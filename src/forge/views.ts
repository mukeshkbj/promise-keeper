// Read models shared by the UI resolver and the Rovo/MCP actions.
// Every list is filtered to what the current user can already open in Jira.

import { atRiskQueue, buildLedger, daysLeft, type PromiseRecord } from '../engine';
import { visibleToUser } from './jira';
import { promisesForIssue, promisesForOrg, promisesForRequest, promisesWithStatus } from './storage';

export interface PromiseView extends PromiseRecord {
  daysLeft: number | null;
}

const view = (p: PromiseRecord): PromiseView => ({ ...p, daysLeft: daysLeft(p.dueDate, new Date()) });

async function onlyVisible(ps: PromiseRecord[]): Promise<PromiseRecord[]> {
  if (!ps.length) return ps;
  const keys = ps.flatMap((p) => [p.requestKey]);
  const ok = await visibleToUser(keys);
  return ps.filter((p) => ok.has(p.requestKey));
}

/** Issue panel: promises made on this request, and promises that depend on this issue. */
export async function panelData(issueKey: string) {
  const [made, carried] = await Promise.all([promisesForRequest(issueKey), promisesForIssue(issueKey)]);
  const madeHere = made.filter((p) => p.status !== 'dismissed');
  const dependsHere = await onlyVisible(carried.filter((p) => p.requestKey !== issueKey && ['open', 'at_risk'].includes(p.status)));
  return {
    made: madeHere.map(view),
    carried: dependsHere.map(view),
    carriedCount: carried.filter((p) => ['open', 'at_risk'].includes(p.status)).length,
  };
}

/** Global page: what needs attention now, and a ledger per customer. */
export async function queueData() {
  const live = await onlyVisible([...(await promisesWithStatus('at_risk')), ...(await promisesWithStatus('open'))]);
  const queue = atRiskQueue(live, new Date()).map(view);
  const orgs = [...new Set(live.map((p) => p.customerOrg))];
  const ledgers = await Promise.all(orgs.map((o) => ledgerFor(o)));
  return { queue, ledgers: ledgers.sort((a, b) => b.atRisk - a.atRisk || b.open - a.open) };
}

export async function ledgerFor(org: string) {
  const ps = await onlyVisible(await promisesForOrg(org));
  return { ...buildLedger(org, ps, new Date()), promises: ps.filter((p) => p.status !== 'dismissed' && p.status !== 'proposed').map(view) };
}
