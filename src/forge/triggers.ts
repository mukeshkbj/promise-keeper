// Product event and schedule handlers.

import { handleComment, refreshForAnchor, refreshForIssue, refreshPromises } from './service';
import { promisesWithStatus } from './storage';

export async function onComment(event: any) {
  const issueKey = event?.issue?.key;
  const commentId = event?.comment?.id;
  if (!issueKey || !commentId) return;
  const n = await handleComment(issueKey, String(commentId));
  if (n) console.log(`Proposed ${n} promise(s) on ${issueKey}`);
}

// Only these changes can move a promise's risk.
const RELEVANT_FIELDS = new Set(['fix version', 'fixversions', 'status', 'sprint', 'link', 'resolution']);

export async function onIssueUpdated(event: any) {
  const key = event?.issue?.key;
  if (!key) return;
  const items: any[] = event?.changelog?.items ?? [];
  if (items.length && !items.some((i) => RELEVANT_FIELDS.has(String(i.field ?? i.fieldId ?? '').toLowerCase()))) return;
  const changed = await refreshForIssue(key);
  if (changed.length) console.log(`${key}: ${changed.map((p) => `${p.id}→${p.status}`).join(', ')}`);
}

export async function onVersionChanged(event: any) {
  const id = event?.version?.id ?? event?.id;
  if (!id) return;
  const changed = await refreshForAnchor(`version:${id}`);
  if (changed.length) console.log(`Version ${id}: ${changed.map((p) => `${p.id}→${p.status}`).join(', ')}`);
}

export async function onSprintChanged(event: any) {
  const id = event?.sprint?.id;
  if (!id) return;
  await refreshForAnchor(`sprint:${id}`);
}

/** Daily: dates pass without any Jira event, so re-check every live promise. */
export async function dailySweep() {
  const live = [...(await promisesWithStatus('open')), ...(await promisesWithStatus('at_risk'))];
  const changed = await refreshPromises(live);
  console.log(`Daily sweep: ${live.length} live, ${changed.length} changed`);
}
