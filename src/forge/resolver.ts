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

resolver.define('confirm', async ({ payload, context }) => {
  await assertCanEdit(payload.id);
  return confirmPromise(payload.id, (context as any).accountId, {
    what: payload.what,
    dueDate: payload.dueDate,
    issueKey: payload.issueKey,
  });
});

resolver.define('outcome', async ({ payload, context }) => {
  await assertCanEdit(payload.id);
  if (!['dismissed', 'withdrawn', 'told'].includes(payload.outcome)) throw new Error('Unknown outcome');
  return setOutcome(payload.id, (context as any).accountId, payload.outcome);
});

resolver.define('getQueue', async () => queueData());

export const handler = resolver.getDefinitions();
