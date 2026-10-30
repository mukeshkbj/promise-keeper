// Actions for the Rovo agent. The same actions are exposed as MCP tools via rovo:mcp.
// Inputs arrive as top-level payload fields. Every action checks the caller can open the request.

import { checkReplyAgainstPromises, normalise, resolveDue, todayIn } from '../engine';
import { getDeliveryContext, siteTimeZone, visibleToUser } from './jira';
import { logPromise } from './service';
import { getPromise, promisesForRequest } from './storage';
import { ledgerFor } from './views';

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

async function requireVisible(requestKey: string) {
  if (!KEY.test(requestKey ?? '')) throw new Error('requestKey must look like SUP-123');
  const ok = await visibleToUser([requestKey]);
  if (!ok.has(requestKey)) throw new Error(`You cannot open ${requestKey}`);
}

const brief = (p: any) => ({
  id: p.id,
  request: p.requestKey,
  customer: p.customerOrg,
  promised: p.what,
  quote: p.quote,
  due: p.dueDate,
  dependsOn: p.anchor?.name ?? p.issueKey,
  status: p.status,
  reason: p.statusReason,
  customerTold: p.customerTold,
});

/** "What have we promised Acme?" or "What's open on SUP-101?" */
export async function listPromises(payload: any) {
  if (payload?.requestKey) {
    await requireVisible(payload.requestKey);
    const ps = (await promisesForRequest(payload.requestKey)).filter((p) => !['dismissed', 'proposed'].includes(p.status));
    return { promises: ps.map(brief) };
  }
  if (payload?.customerOrg) {
    const ledger = await ledgerFor(String(payload.customerOrg));
    const { promises, ...summary } = ledger;
    return { summary, promises: promises.map(brief) };
  }
  return { error: 'Give a requestKey or a customerOrg' };
}

/** Before an AI agent replies: warn about at-risk promises or a conflicting date. */
export async function checkBeforeReply(payload: any) {
  await requireVisible(payload?.requestKey);
  const open = (await promisesForRequest(payload.requestKey)).filter((p) => p.status === 'open' || p.status === 'at_risk');
  const draft = String(payload?.draftReply ?? '');
  const tz = await siteTimeZone();
  let draftDue: string | null = null;
  if (payload?.timePhrase) {
    const issueKey = open[0]?.issueKey ?? null;
    draftDue = resolveDue(String(payload.timePhrase), new Date(), await getDeliveryContext(issueKey), { timeZone: tz }).dueDate;
  }
  const result = checkReplyAgainstPromises(draft, draftDue, open);
  return { ...result, openPromises: open.map(brief), today: todayIn(new Date(), tz) };
}

/** An AI agent records a promise it just made in a reply. */
export async function logPromiseAction(payload: any) {
  await requireVisible(payload?.requestKey);
  const quote = String(payload?.quote ?? '').trim();
  const what = String(payload?.what ?? '').trim() || quote.slice(0, 80);
  const timePhrase = String(payload?.timePhrase ?? '').trim();
  if (quote.length < 8) return { error: 'quote must be the exact promise wording from the reply' };
  if (timePhrase && !normalise(quote + ' ' + (payload?.reply ?? '')).includes(normalise(timePhrase))) {
    return { error: 'timePhrase must appear in the quoted reply' };
  }
  const existing = await promisesForRequest(payload.requestKey);
  const dup = existing.find((p) => normalise(p.quote) === normalise(quote));
  if (dup) return { promise: brief(dup), note: 'Already logged' };
  const p = await logPromise(
    payload.requestKey,
    { quote, what, kind: ['fix', 'update', 'callback', 'delivery'].includes(payload?.kind) ? payload.kind : 'other', timePhrase },
    String(payload?.agentName ?? 'rovo'),
  );
  return { promise: brief(p) };
}

/** Facts for drafting an honest update. The agent writes the words; a person sends them. */
export async function draftUpdateFacts(payload: any) {
  const p = await getPromise(String(payload?.promiseId ?? ''));
  if (!p) return { error: 'No such promise' };
  await requireVisible(p.requestKey);
  const ctx = await getDeliveryContext(p.issueKey);
  return {
    promise: brief(p),
    delivery: {
      issue: ctx.issue?.key,
      issueState: ctx.issue?.statusCategory,
      version: ctx.fixVersion?.name,
      versionDate: ctx.fixVersion?.releaseDate,
      released: ctx.fixVersion?.released,
    },
    guidance:
      'Write a short, honest update in the agent\'s voice: acknowledge the original promise, give the new expected date if known, say what happens next. Do not promise a new date unless delivery data supports it. Never send it yourself.',
  };
}
