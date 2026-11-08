// Resolver for the UI Kit issue panel and global page.

import Resolver from '@forge/resolver';
import { visibleToUser } from './jira';
import { confirmPromise, refreshForIssue, setOutcome } from './service';
import { getPromise } from './storage';
import { panelData, queueData } from './views';

const resolver = new Resolver();

async function assertCanEdit(id: string) {
  const p = await getPromise(id);
  if (!p) throw new Error('Promise not found');
  const ok = await visibleToUser([p.requestKey]);
  if (!ok.has(p.requestKey)) throw new Error('You cannot open this request');
  return p;
}

resolver.define('getPanel', async ({ context }) => {
  const key = (context as any).extension?.issue?.key;
  if (!key) return { made: [], carried: [], carriedCount: 0 };
  return panelData(key);
});

resolver.define('refreshPanel', async ({ context }) => {
  const key = (context as any).extension?.issue?.key;
  if (key) await refreshForIssue(key);
  return key ? panelData(key) : { made: [], carried: [], carriedCount: 0 };
});

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

resolver.define('confirm', async ({ payload, context }) => {
  await assertCanEdit(payload.id);
  let issueKey: string | null | undefined = payload.issueKey;
  if (issueKey !== undefined && issueKey !== null) {
    issueKey = String(issueKey).trim().toUpperCase();
    if (!ISSUE_KEY.test(issueKey)) throw new Error('Delivery issue must look like ENG-42');
    // The app reads delivery issues as itself, so only accept ones this user can open.
    if (!(await visibleToUser([issueKey])).has(issueKey)) throw new Error(`You cannot open ${issueKey}`);
  }
  let dueDate: string | null | undefined = payload.dueDate;
  if (dueDate !== undefined && dueDate !== null) {
    dueDate = String(dueDate).slice(0, 10);
    if (!YMD.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) throw new Error('Due date must be a valid date');
  }
  const what = typeof payload.what === 'string' ? payload.what : undefined;
  return confirmPromise(payload.id, (context as any).accountId, { what, dueDate, issueKey });
});

resolver.define('outcome', async ({ payload, context }) => {
  await assertCanEdit(payload.id);
  if (!['dismissed', 'withdrawn', 'told'].includes(payload.outcome)) throw new Error('Unknown outcome');
  return setOutcome(payload.id, (context as any).accountId, payload.outcome);
});

resolver.define('getQueue', async () => queueData());

export const handler = resolver.getDefinitions();
