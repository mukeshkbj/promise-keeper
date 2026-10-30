// Application service: the operations every surface (triggers, panel, Rovo, MCP) shares.

import {
  assessRisk,
  mightContainPromise,
  resolveDue,
  type PromiseRecord,
  type Proposal,
} from '../engine';
import { getComment, getDeliveryContext, getRequestInfo, siteTimeZone } from './jira';
import { proposePromises } from './llm';
import {
  getPromise,
  nextPromiseId,
  promisesForAnchor,
  promisesForIssue,
  promisesForRequest,
  savePromise,
} from './storage';

const nowIso = () => new Date().toISOString();

function withHistory(p: PromiseRecord, change: string, from?: string, to?: string): PromiseRecord {
  return { ...p, updatedAt: nowIso(), history: [...p.history, { at: nowIso(), change, from, to }] };
}

/** Work out the delivery issue, due date and anchor for a time phrase on a request. */
async function resolveFields(requestKey: string, timePhrase: string, issueKeyOverride?: string | null) {
  const req = await getRequestInfo(requestKey);
  const issueKey = issueKeyOverride !== undefined ? issueKeyOverride : req?.linkedIssueKeys[0] ?? null;
  const ctx = await getDeliveryContext(issueKey);
  const tz = await siteTimeZone();
  const res = resolveDue(timePhrase, new Date(), ctx, { timeZone: tz, dayFirst: !tz.startsWith('America/') });
  const anchor =
    res.anchor.type === 'date' && issueKey ? { type: 'issue' as const, key: `issue:${issueKey}`, name: issueKey } : res.anchor;
  return { req, issueKey, ctx, tz, res, anchor };
}

/** Build a promise record from a proposal, resolving its date against delivery data. */
async function draftPromise(
  requestKey: string,
  proposal: Proposal,
  madeBy: string,
  status: 'proposed' | 'open',
): Promise<PromiseRecord> {
  const { req, issueKey, ctx, tz, res, anchor } = await resolveFields(requestKey, proposal.timePhrase);

  const base: PromiseRecord = {
    id: await nextPromiseId(),
    requestKey,
    customerOrg: req?.customerOrg ?? 'Unknown customer',
    madeBy,
    quote: proposal.quote,
    what: proposal.what,
    kind: proposal.kind,
    timePhrase: proposal.timePhrase,
    dueDate: res.dueDate,
    dueSource: res.dueSource,
    issueKey,
    anchor,
    status,
    statusReason: res.note ?? '',
    customerTold: false,
    confirmedBy: status === 'open' ? madeBy : null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    history: [{ at: nowIso(), change: status === 'open' ? 'logged' : 'proposed' }],
  };
  return status === 'open' ? applyAssessment(base, ctx, tz) : base;
}

function applyAssessment(p: PromiseRecord, ctx: Awaited<ReturnType<typeof getDeliveryContext>>, tz: string): PromiseRecord {
  const a = assessRisk(p, ctx, new Date(), undefined, tz);
  const reason = a.readyToTell ? a.reason : a.reason || p.statusReason;
  if (a.status === p.status && reason === p.statusReason) return p;
  const next = { ...p, status: a.status, statusReason: reason };
  return a.status !== p.status ? withHistory(next, 'status', p.status, a.status) : { ...next, updatedAt: nowIso() };
}

// ---------- triggers ----------

/** A public reply was posted: propose promises if it looks like it contains any. */
export async function handleComment(issueKey: string, commentId: string): Promise<number> {
  const c = await getComment(issueKey, commentId);
  // Only public agent replies on JSM requests. Customers can never create promises.
  if (!c || c.isPublic !== true || c.authorType === 'customer') return 0;
  if (!mightContainPromise(c.text)) return 0;

  const proposals = await proposePromises(c.text);
  if (!proposals.length) return 0;

  const existing = await promisesForRequest(issueKey);
  const known = new Set(existing.map((p) => p.quote.toLowerCase()));
  let created = 0;
  for (const proposal of proposals) {
    if (known.has(proposal.quote.toLowerCase())) continue;
    const madeBy = c.authorType === 'app' ? `ai:${c.authorId}` : c.authorId;
    await savePromise(await draftPromise(issueKey, proposal, madeBy, 'proposed'));
    created++;
  }
  return created;
}

/** Re-check every live promise tied to an anchor or issue. Returns those whose status changed. */
export async function refreshPromises(promises: PromiseRecord[]): Promise<PromiseRecord[]> {
  const live = promises.filter((p) => p.status === 'open' || p.status === 'at_risk');
  if (!live.length) return [];
  const tz = await siteTimeZone();
  const ctxCache = new Map<string, Awaited<ReturnType<typeof getDeliveryContext>>>();
  const changed: PromiseRecord[] = [];
  for (const p of live) {
    const key = p.issueKey ?? '';
    if (!ctxCache.has(key)) ctxCache.set(key, await getDeliveryContext(p.issueKey));
    const ctx = ctxCache.get(key)!;

    // The anchor may have moved (issue moved to another version or sprint).
    let next = p;
    if (p.dueSource === 'fix_version' && ctx.fixVersion && `version:${ctx.fixVersion.id}` !== p.anchor.key) {
      next = withHistory(
        { ...p, anchor: { type: 'version', key: `version:${ctx.fixVersion.id}`, name: ctx.fixVersion.name } },
        'anchor moved',
        p.anchor.name,
        ctx.fixVersion.name,
      );
    }
    const assessed = applyAssessment(next, ctx, tz);
    if (assessed !== p) {
      await savePromise(assessed);
      if (assessed.status !== p.status) changed.push(assessed);
    }
  }
  return changed;
}

export const refreshForIssue = async (issueKey: string) =>
  refreshPromises([...(await promisesForIssue(issueKey)), ...(await promisesForRequest(issueKey))]);
export const refreshForAnchor = async (anchorKey: string) => refreshPromises(await promisesForAnchor(anchorKey));

// ---------- agent actions (panel, Rovo, MCP) ----------

export interface ConfirmEdits {
  what?: string;
  dueDate?: string | null;
  issueKey?: string | null;
}

export async function confirmPromise(id: string, accountId: string, edits: ConfirmEdits = {}): Promise<PromiseRecord> {
  const p = await getPromise(id);
  if (!p) throw new Error(`No promise ${id}`);
  let next: PromiseRecord = { ...p, confirmedBy: accountId, status: 'open' };
  if (edits.what) next.what = edits.what.slice(0, 120);
  if (edits.issueKey !== undefined && edits.issueKey !== p.issueKey) {
    // Re-resolve against the newly linked delivery issue.
    const r = await resolveFields(p.requestKey, p.timePhrase, edits.issueKey);
    next = { ...next, issueKey: r.issueKey, anchor: r.anchor, dueDate: r.res.dueDate, dueSource: r.res.dueSource };
  }
  if (edits.dueDate !== undefined && edits.dueDate !== null) {
    next = { ...next, dueDate: edits.dueDate, dueSource: next.dueSource === 'none' ? 'explicit_date' : next.dueSource };
  }
  next = withHistory(next, 'confirmed', 'proposed', 'open');
  const ctx = await getDeliveryContext(next.issueKey);
  next = applyAssessment(next, ctx, await siteTimeZone());
  await savePromise(next);
  return next;
}

export async function setOutcome(
  id: string,
  accountId: string,
  outcome: 'dismissed' | 'withdrawn' | 'told',
): Promise<PromiseRecord> {
  const p = await getPromise(id);
  if (!p) throw new Error(`No promise ${id}`);
  let next: PromiseRecord;
  if (outcome === 'told') {
    next = withHistory({ ...p, customerTold: true }, `customer told by ${accountId}`);
    next = applyAssessment(next, await getDeliveryContext(p.issueKey), await siteTimeZone());
  } else {
    next = withHistory({ ...p, status: outcome, statusReason: `${outcome} by agent` }, outcome, p.status, outcome);
  }
  await savePromise(next);
  return next;
}

/** For AI service agents: log a promise directly (the tool call is the confirmation). */
export async function logPromise(
  requestKey: string,
  proposal: Proposal,
  agentName: string,
): Promise<PromiseRecord> {
  const p = await draftPromise(requestKey, proposal, `ai:${agentName}`, 'open');
  await savePromise(p);
  return p;
}
