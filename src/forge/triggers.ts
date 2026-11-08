// Product event and schedule handlers.

import { handleComment, refreshForAnchor, refreshForIssue, refreshPromises } from './service';
import { getSetting, promisesWithStatus, setSetting } from './storage';

export async function onComment(event: any) {
  const issueKey = event?.issue?.key;
  const commentId = event?.comment?.id;
  console.log(`[pk] comment event ${issueKey ?? '?'}/${commentId ?? '?'}`);
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

// Dates pass without any Jira event, so live promises are re-checked on a schedule.
// Hourly, a fixed-size batch at a time, so one run never approaches Forge's time limit.
const SWEEP_BATCH = 40;

export async function dailySweep() {
  const live = [...(await promisesWithStatus('open')), ...(await promisesWithStatus('at_risk'))].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (!live.length) return;
  const start = ((await getSetting<number>('sweepOffset')) ?? 0) % live.length;
  const batch = [...live.slice(start), ...live.slice(0, start)].slice(0, SWEEP_BATCH);
  const changed = await refreshPromises(batch);
  await setSetting('sweepOffset', (start + batch.length) % live.length);
  console.log(`[pk] sweep: ${batch.length}/${live.length} checked, ${changed.length} changed`);
}
