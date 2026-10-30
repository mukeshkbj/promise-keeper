// Risk rules: decide whether a confirmed promise is open, at risk, kept or broken.
// Deterministic and explainable: every status comes with a plain-English reason.

import { daysBetween, todayIn } from './dates';
import type { DeliveryContext, PromiseRecord, PromiseStatus, RiskConfig } from './types';
import { DEFAULT_RISK_CONFIG } from './types';

export interface Assessment {
  status: PromiseStatus;
  reason: string;
  /** Delivery is done but the customer has not been told yet. */
  readyToTell: boolean;
}

const TERMINAL: PromiseStatus[] = ['kept', 'broken', 'withdrawn', 'dismissed', 'proposed'];

export function assessRisk(
  p: Pick<PromiseRecord, 'status' | 'dueDate' | 'dueSource' | 'anchor' | 'customerTold' | 'kind'>,
  ctx: DeliveryContext,
  now: Date,
  cfg: RiskConfig = DEFAULT_RISK_CONFIG,
  timeZone = 'UTC',
): Assessment {
  if (TERMINAL.includes(p.status)) return { status: p.status, reason: '', readyToTell: false };

  const today = todayIn(now, timeZone);
  const delivered = isDelivered(p, ctx);

  // 1. Delivered: kept once the customer has been told; otherwise prompt the agent.
  if (delivered) {
    if (p.customerTold) return { status: 'kept', reason: 'Delivered and customer told', readyToTell: false };
    const late = p.dueDate && daysBetween(p.dueDate, today) > 0;
    return {
      status: late ? 'at_risk' : 'open',
      reason: late ? 'Delivered after the promised date: tell the customer now' : 'Delivered: tell the customer to keep this promise',
      readyToTell: true,
    };
  }

  // 2. Due date passed and not delivered (or not told for non-delivery promises).
  if (p.dueDate && daysBetween(p.dueDate, today) > 0) {
    if (p.customerTold && !hasDeliveryAnchor(p, ctx)) {
      return { status: 'kept', reason: 'Customer was updated', readyToTell: false };
    }
    return { status: 'broken', reason: `Promised by ${p.dueDate}; not delivered`, readyToTell: false };
  }

  // 3. The anchor moved past the promise: the clearest early warning.
  const expected = expectedDelivery(ctx);
  if (p.dueDate && expected && daysBetween(p.dueDate, expected.date) > 0) {
    return {
      status: 'at_risk',
      reason: `${expected.label} now ${expected.date}, after the promised ${p.dueDate}`,
      readyToTell: false,
    };
  }
  if (p.dueSource === 'fix_version' && ctx.fixVersion === null) {
    return { status: 'at_risk', reason: 'The delivery issue was removed from its fix version', readyToTell: false };
  }

  // 4. Close to the date with work not finished.
  if (p.dueDate && ctx.issue && ctx.issue.statusCategory !== 'done') {
    const left = daysBetween(today, p.dueDate);
    if (left <= cfg.nearDays) {
      const state = ctx.issue.statusCategory === 'new' ? 'not started' : 'still in progress';
      return {
        status: 'at_risk',
        reason: `${left === 0 ? 'Due today' : `Due in ${left} day${left === 1 ? '' : 's'}`}; ${ctx.issue.key} ${state}`,
        readyToTell: false,
      };
    }
  }

  // 5. Stalled work.
  if (p.dueDate && ctx.issue?.lastProgressAt && ctx.issue.statusCategory !== 'done') {
    const idle = daysBetween(ctx.issue.lastProgressAt.slice(0, 10), today);
    if (idle >= cfg.staleDays) {
      return { status: 'at_risk', reason: `${ctx.issue.key} has had no progress for ${idle} days`, readyToTell: false };
    }
  }

  // 6. Non-delivery promises (updates, call-backs) close to the date.
  if (p.dueDate && !hasDeliveryAnchor(p, ctx) && !p.customerTold && daysBetween(today, p.dueDate) <= 0) {
    return { status: 'at_risk', reason: 'Due today: update the customer', readyToTell: false };
  }

  return { status: 'open', reason: p.dueDate ? `On track for ${p.dueDate}` : 'Open: no date set', readyToTell: false };
}

function hasDeliveryAnchor(p: Pick<PromiseRecord, 'anchor'>, ctx: DeliveryContext): boolean {
  return p.anchor.type !== 'date' || Boolean(ctx.issue);
}

function isDelivered(p: Pick<PromiseRecord, 'anchor' | 'kind'>, ctx: DeliveryContext): boolean {
  if (p.anchor.type === 'version') return Boolean(ctx.fixVersion?.released);
  if (p.anchor.type === 'sprint') return ctx.issue?.statusCategory === 'done';
  if (ctx.issue) return ctx.issue.statusCategory === 'done';
  return false; // date-only promises are kept when the customer is told
}

/** When delivery is now expected, from the linked version or sprint. */
function expectedDelivery(ctx: DeliveryContext): { date: string; label: string } | null {
  const v = ctx.fixVersion;
  if (v?.releaseDate && !v.released) return { date: v.releaseDate.slice(0, 10), label: `Release ${v.name}` };
  const s = ctx.sprint;
  if (s?.endDate && s.state !== 'closed') return { date: s.endDate.slice(0, 10), label: `Sprint ${s.name} ends` };
  return null;
}

/** Days from today to a promise's due date (negative if overdue). */
export function daysLeft(dueDate: string | null, now: Date, timeZone = 'UTC'): number | null {
  return dueDate ? daysBetween(todayIn(now, timeZone), dueDate) : null;
}

