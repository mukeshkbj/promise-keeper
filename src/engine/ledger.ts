// Ledger and queue helpers: summaries over many promises.

import { daysBetween, todayIn } from './dates';
import type { PromiseRecord } from './types';

export interface Ledger {
  customerOrg: string;
  open: number;
  atRisk: number;
  kept: number;
  broken: number;
  keptRate: number | null; // kept / (kept + broken)
  lastBroken: string | null;
}

const TRACKED = new Set(['open', 'at_risk', 'kept', 'broken']);

export function buildLedger(customerOrg: string, promises: PromiseRecord[], now: Date, windowDays = 90): Ledger {
  const today = todayIn(now);
  const recent = promises.filter(
    (p) => TRACKED.has(p.status) && (p.status === 'open' || p.status === 'at_risk' || daysBetween(p.updatedAt.slice(0, 10), today) <= windowDays),
  );
  const count = (s: string) => recent.filter((p) => p.status === s).length;
  const kept = count('kept');
  const broken = count('broken');
  const lastBroken =
    recent
      .filter((p) => p.status === 'broken')
      .map((p) => p.updatedAt)
      .sort()
      .pop() ?? null;
  return {
    customerOrg,
    open: count('open'),
    atRisk: count('at_risk'),
    kept,
    broken,
    keptRate: kept + broken ? Math.round((kept / (kept + broken)) * 100) / 100 : null,
    lastBroken,
  };
}

/** Promises an agent should look at now: at risk first, then due soonest. */
export function atRiskQueue(promises: PromiseRecord[], now: Date, horizonDays = 3): PromiseRecord[] {
  const today = todayIn(now);
  return promises
    .filter(
      (p) =>
        p.status === 'at_risk' ||
        (p.status === 'open' && p.dueDate !== null && daysBetween(today, p.dueDate) <= horizonDays),
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'at_risk' ? -1 : 1;
      return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
}

/**
 * Before an AI agent sends a reply: does it state a date that conflicts with an
 * open promise on the same request, or repeat a promise that is already at risk?
 */
export function checkReplyAgainstPromises(
  draft: string,
  draftDue: string | null,
  open: PromiseRecord[],
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  for (const p of open) {
    if (p.status === 'at_risk') {
      warnings.push(`${p.id} is at risk (${p.statusReason}). Do not repeat "${p.quote}" without checking.`);
    }
    if (draftDue && p.dueDate && p.status !== 'at_risk' && draftDue !== p.dueDate && /fix|delivery/.test(p.kind)) {
      warnings.push(`${p.id} promised ${p.dueDate}; this reply implies ${draftDue}. Say the date changed if it did.`);
    }
  }
  return { ok: warnings.length === 0, warnings };
}
