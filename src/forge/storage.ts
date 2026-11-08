// Promise storage on the Forge Custom Entity Store. Indexes are declared in manifest.yml.
// Entity values cannot hold null, so nulls are stored as '' and restored on read.

import { kvs } from '@forge/kvs';
import type { PromiseRecord, PromiseStatus } from '../engine';

const ENTITY = 'promise';

// Forge entity values cannot be empty strings, and some empty fields are index keys
// (dueDate, issueKey), so blanks are stored as a placeholder and restored on read.
const NONE = '~none';
const put = (v: string | null | undefined): string => (v === null || v === undefined || v === '' ? NONE : v);
const get = (v: string | undefined): string => (v === undefined || v === NONE ? '' : v);

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

export const toStored = (p: PromiseRecord): StoredPromise => ({
  id: put(p.id),
  requestKey: put(p.requestKey),
  customerOrg: put(p.customerOrg),
  madeBy: put(p.madeBy),
  quote: put(p.quote),
  what: put(p.what),
  kind: put(p.kind),
  timePhrase: put(p.timePhrase),
  dueDate: put(p.dueDate),
  dueSource: put(p.dueSource),
  issueKey: put(p.issueKey),
  anchorType: put(p.anchor.type),
  anchorKey: put(p.anchor.key),
  anchorName: put(p.anchor.name),
  status: put(p.status),
  statusReason: put(p.statusReason),
  customerTold: p.customerTold,
  confirmedBy: put(p.confirmedBy),
  createdAt: put(p.createdAt),
  updatedAt: put(p.updatedAt),
  history: p.history.length ? p.history.slice(-20) : [{ at: p.updatedAt, change: 'created' }],
});

export const fromStored = (s: StoredPromise): PromiseRecord => ({
  id: get(s.id),
  requestKey: get(s.requestKey),
  customerOrg: get(s.customerOrg),
  madeBy: get(s.madeBy),
  quote: get(s.quote),
  what: get(s.what),
  kind: get(s.kind) as PromiseRecord['kind'],
  timePhrase: get(s.timePhrase),
  dueDate: get(s.dueDate) || null,
  dueSource: (get(s.dueSource) || 'none') as PromiseRecord['dueSource'],
  issueKey: get(s.issueKey) || null,
  anchor: {
    type: (get(s.anchorType) || 'date') as PromiseRecord['anchor']['type'],
    key: get(s.anchorKey) || 'date',
    name: get(s.anchorName) || undefined,
  },
  status: get(s.status) as PromiseStatus,
  statusReason: get(s.statusReason),
  customerTold: Boolean(s.customerTold),
  confirmedBy: get(s.confirmedBy) || null,
  createdAt: get(s.createdAt),
  updatedAt: get(s.updatedAt),
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

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return kvs.get<T>(`setting:${key}`);
}
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await kvs.set(`setting:${key}`, value as any);
}
