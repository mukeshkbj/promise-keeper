import { describe, expect, it, vi } from 'vitest';
vi.mock('@forge/kvs', () => ({ kvs: {} }));
import { fromStored, toStored } from '../src/forge/storage';
import type { PromiseRecord } from '../src/engine';

const blank: PromiseRecord = {
  id: 'PRM-1', requestKey: 'SUP-1', customerOrg: 'Acme', madeBy: 'u1',
  quote: "I'll update you by Friday", what: 'Status update', kind: 'update', timePhrase: 'by Friday',
  dueDate: null, dueSource: 'none', issueKey: null, anchor: { type: 'date', key: 'date' },
  status: 'proposed', statusReason: '', customerTold: false, confirmedBy: null,
  createdAt: '2026-11-07T21:00:00Z', updatedAt: '2026-11-07T21:00:00Z', history: [],
};

describe('entity storage mapping', () => {
  it('never writes an empty string (Forge rejects them)', () => {
    const s = toStored(blank) as unknown as Record<string, unknown>;
    expect(Object.entries(s).filter(([, v]) => v === '')).toEqual([]);
    expect(s.dueDate).toBe('~none');
    expect(s.issueKey).toBe('~none');
  });
  it('round-trips blanks back to null / empty', () => {
    const back = fromStored(toStored(blank));
    expect(back).toMatchObject({ dueDate: null, issueKey: null, statusReason: '', confirmedBy: null, anchor: { type: 'date', key: 'date' } });
  });
  it('round-trips a full record unchanged', () => {
    const full: PromiseRecord = { ...blank, dueDate: '2026-11-13', dueSource: 'fix_version', issueKey: 'ENG-1',
      anchor: { type: 'version', key: 'version:10000', name: '4.2' }, status: 'open', statusReason: 'On track', confirmedBy: 'u1',
      history: [{ at: 'x', change: 'confirmed' }] };
    expect(fromStored(toStored(full))).toEqual(full);
  });
});
