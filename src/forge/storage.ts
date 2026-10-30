// Promise storage on the Forge Custom Entity Store. Indexes are declared in manifest.yml.
// Entity values cannot hold null, so nulls are stored as '' and restored on read.

import { kvs } from '@forge/kvs';
import type { PromiseRecord, PromiseStatus } from '../engine';

const ENTITY = 'promise';

interface StoredPromise {
  id: string;
  requestKey: string;
  customerOrg: string;
  madeBy: string;
  quote: string;
  what: string;
  kind: string;
  timePhrase: string;
  dueDate: string;
  dueSource: string;
  issueKey: string;
  anchorType: string;
  anchorKey: string;
  anchorName: string;
  status: string;
  statusReason: string;
  customerTold: boolean;
  confirmedBy: string;
  createdAt: string;
  updatedAt: string;
  history: unknown;
}

const toStored = (p: PromiseRecord): StoredPromise => ({
  id: p.id,
  requestKey: p.requestKey,
  customerOrg: p.customerOrg,
  madeBy: p.madeBy,
  quote: p.quote,
  what: p.what,
  kind: p.kind,
  timePhrase: p.timePhrase,
  dueDate: p.dueDate ?? '',
  dueSource: p.dueSource,
  issueKey: p.issueKey ?? '',
  anchorType: p.anchor.type,
  anchorKey: p.anchor.key,
  anchorName: p.anchor.name ?? '',
  status: p.status,
  statusReason: p.statusReason,
  customerTold: p.customerTold,
  confirmedBy: p.confirmedBy ?? '',
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  history: p.history.slice(-20),
});

const fromStored = (s: StoredPromise): PromiseRecord => ({
  id: s.id,
  requestKey: s.requestKey,
  customerOrg: s.customerOrg,
  madeBy: s.madeBy,
  quote: s.quote,
  what: s.what,
  kind: s.kind as PromiseRecord['kind'],
  timePhrase: s.timePhrase,
  dueDate: s.dueDate || null,
  dueSource: s.dueSource as PromiseRecord['dueSource'],
  issueKey: s.issueKey || null,
  anchor: { type: s.anchorType as PromiseRecord['anchor']['type'], key: s.anchorKey, name: s.anchorName || undefined },
  status: s.status as PromiseStatus,
  statusReason: s.statusReason,
  customerTold: s.customerTold,
  confirmedBy: s.confirmedBy || null,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
  history: Array.isArray(s.history) ? (s.history as PromiseRecord['history']) : [],
});

const entity = () => kvs.entity<StoredPromise>(ENTITY);

export async function savePromise(p: PromiseRecord): Promise<void> {
  await entity().set(p.id, toStored(p));
}

export async function getPromise(id: string): Promise<PromiseRecord | null> {
  const s = await entity().get(id);
  return s ? fromStored(s) : null;
}

async function byIndex(index: string, partition: string, limit = 100): Promise<PromiseRecord[]> {
  const out: PromiseRecord[] = [];
  let cursor: string | undefined;
  do {
    let q = entity().query().index(index, { partition: [partition] }).limit(Math.min(limit, 100));
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    page.results.forEach((r) => out.push(fromStored(r.value)));
    cursor = page.nextCursor;
  } while (cursor && out.length < limit);
  return out.slice(0, limit);
}

export const promisesForRequest = (requestKey: string) => byIndex('by-request', requestKey);
export const promisesForIssue = (issueKey: string) => byIndex('by-issue', issueKey);
export const promisesForAnchor = (anchorKey: string) => byIndex('by-anchor', anchorKey);
export const promisesForOrg = (org: string) => byIndex('by-org', org, 500);
export const promisesWithStatus = (status: PromiseStatus, limit = 500) => byIndex('by-status', status, limit);

/** Sequential, readable ids (PRM-1, PRM-2…). Collisions are retried. */
export async function nextPromiseId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const n = ((await kvs.get<number>('seq:promise')) ?? 0) + 1;
    await kvs.set('seq:promise', n);
    const id = `PRM-${n}`;
    if (!(await entity().get(id))) return id;
  }
  return `PRM-${Date.now().toString(36).toUpperCase()}`;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return kvs.get<T>(`setting:${key}`);
}
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await kvs.set(`setting:${key}`, value as any);
}
