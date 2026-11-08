import { describe, expect, it } from 'vitest';
import {
  adfToText,
  assessRisk,
  atRiskQueue,
  buildLedger,
  checkReplyAgainstPromises,
  mightContainPromise,
  resolveDue,
  validateProposals,
  extractJson,
  type PromiseRecord,
} from '../src/engine';

// Monday 2 Nov 2026, 10:00 London
const MON = new Date('2026-11-02T10:00:00Z');
const TZ = 'Europe/London';

describe('pre-filter', () => {
  it('flags replies with a commitment and a time', () => {
    expect(mightContainPromise("Thanks Jo, the fix will be in our next release.")).toBe(true);
    expect(mightContainPromise("I'll update you by Friday.")).toBe(true);
    expect(mightContainPromise('We expect this to ship on 12 Nov.')).toBe(true);
  });
  it('skips replies without a commitment', () => {
    expect(mightContainPromise('Thanks for the screenshot, that helps.')).toBe(false);
    expect(mightContainPromise('Could you send the logs from Friday?')).toBe(false);
  });
});

describe('ADF to text', () => {
  it('flattens paragraphs and mentions', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, { type: 'mention', attrs: { text: '@Jo' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: "I'll call you tomorrow." }] },
      ],
    };
    expect(adfToText(adf)).toBe("Hi @Jo\nI'll call you tomorrow.");
  });
});

describe('evidence gate', () => {
  const reply = "Hi Jo, thanks for your patience. The fix will be in our next release, and I'll update you by Friday.";
  it('keeps proposals backed by the reply', () => {
    const parsed = extractJson(
      'Sure: {"promises":[{"quote":"The fix will be in our next release","what":"Fix ships in next release","kind":"fix","timePhrase":"next release"},{"quote":"I\'ll update you by Friday","what":"Status update","kind":"update","timePhrase":"by Friday"}]}',
    );
    const out = validateProposals(parsed, reply);
    expect(out.map((p) => p.kind)).toEqual(['fix', 'update']);
  });
  it('drops invented quotes and invented time phrases', () => {
    const parsed = {
      promises: [
        { quote: 'We will refund you in full', what: 'Refund', kind: 'other', timePhrase: '' },
        { quote: 'The fix will be in our next release', what: 'Fix', kind: 'fix', timePhrase: 'by Monday' },
      ],
    };
    expect(validateProposals(parsed, reply)).toEqual([]);
  });
  it('survives malformed output', () => {
    expect(validateProposals(extractJson('no json here'), reply)).toEqual([]);
  });
});

describe('date resolution (Monday 2 Nov 2026)', () => {
  const r = (phrase: string, ctx = {}) => resolveDue(phrase, MON, ctx, { timeZone: TZ });
  it.each([
    ['by Friday', '2026-11-06'],
    ['next Friday', '2026-11-13'],
    ['tomorrow', '2026-11-03'],
    ['end of the week', '2026-11-06'],
    ['next week', '2026-11-13'],
    ['end of month', '2026-11-30'],
    ['within 2 working days', '2026-11-04'],
    ['in 48 hours', '2026-11-04'],
    ['by 12 Nov', '2026-11-12'],
    ['November 20th', '2026-11-20'],
    ['10/11', '2026-11-10'],
    ['2026-12-01', '2026-12-01'],
    ['by 5 Jan', '2027-01-05'],
  ])('%s → %s', (phrase, expected) => {
    expect(r(phrase).dueDate).toBe(expected);
  });
  it('anchors "next release" to the fix version', () => {
    const res = r('in our next release', {
      fixVersion: { id: '10001', name: '4.2', releaseDate: '2026-11-06', released: false },
    });
    expect(res).toMatchObject({ dueDate: '2026-11-06', dueSource: 'fix_version', anchor: { key: 'version:10001' } });
  });
  it('asks for a link when no fix version exists', () => {
    const res = r('next release');
    expect(res.dueDate).toBeNull();
    expect(res.note).toMatch(/fix version/);
  });
  it('never guesses "soon"', () => {
    expect(r('soon').dueDate).toBeNull();
  });
  it('reads month-first when configured', () => {
    expect(resolveDue('11/10/2026', MON, {}, { dayFirst: false }).dueDate).toBe('2026-11-10');
  });
});

// The demo story: Sam promises Acme the fix in release 4.2 (Friday 6 Nov).
const base: PromiseRecord = {
  id: 'PRM-1',
  requestKey: 'SUP-101',
  customerOrg: 'Acme',
  madeBy: 'sam',
  quote: 'The fix will be in our next release',
  what: 'Fix ships in next release',
  kind: 'fix',
  timePhrase: 'next release',
  dueDate: '2026-11-06',
  dueSource: 'fix_version',
  issueKey: 'ENG-42',
  anchor: { type: 'version', key: 'version:10001', name: '4.2' },
  status: 'open',
  statusReason: '',
  customerTold: false,
  confirmedBy: 'sam',
  createdAt: '2026-11-02T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
  history: [],
};
const issue = { key: 'ENG-42', statusCategory: 'indeterminate' as const, lastProgressAt: '2026-11-02T09:00:00Z' };
const v42 = (releaseDate: string, released = false) => ({ id: '10001', name: '4.2', releaseDate, released });

describe('risk rules', () => {
  it('on track when the version still ships on time', () => {
    expect(assessRisk(base, { fixVersion: v42('2026-11-06'), issue }, MON).status).toBe('open');
  });
  it('at risk the moment the version slips past the promise', () => {
    const wed = new Date('2026-11-04T09:00:00Z');
    const a = assessRisk(base, { fixVersion: v42('2026-11-13'), issue }, wed);
    expect(a.status).toBe('at_risk');
    expect(a.reason).toBe('Release 4.2 now 2026-11-13, after the promised 2026-11-06');
  });
  it('at risk when removed from the version', () => {
    expect(assessRisk(base, { fixVersion: null, issue }, MON).status).toBe('at_risk');
  });
  it('at risk when due soon and not done', () => {
    const thu = new Date('2026-11-05T09:00:00Z');
    expect(assessRisk(base, { fixVersion: v42('2026-11-06'), issue }, thu).reason).toMatch(/Due in 1 day; ENG-42 still in progress/);
  });
  it('at risk when work stalls', () => {
    const p = { ...base, dueDate: '2026-11-30' };
    const stale = { ...issue, lastProgressAt: '2026-10-25T00:00:00Z' };
    expect(assessRisk(p, { fixVersion: v42('2026-11-30'), issue: stale }, MON).reason).toMatch(/no progress for 8 days/);
  });
  it('released but customer not told → prompt to tell', () => {
    const a = assessRisk(base, { fixVersion: v42('2026-11-06', true), issue: { ...issue, statusCategory: 'done' } }, MON);
    expect(a).toMatchObject({ status: 'open', readyToTell: true });
  });
  it('kept once released and told', () => {
    const a = assessRisk({ ...base, customerTold: true }, { fixVersion: v42('2026-11-06', true), issue }, MON);
    expect(a.status).toBe('kept');
  });
  it('broken after the date passes undelivered', () => {
    const sat = new Date('2026-11-07T12:00:00Z');
    expect(assessRisk(base, { fixVersion: v42('2026-11-13'), issue }, sat).status).toBe('broken');
  });
  it('date-only update promise kept when the customer is updated', () => {
    const p = { ...base, kind: 'update' as const, anchor: { type: 'date' as const, key: 'date' }, dueSource: 'relative_date' as const, issueKey: null, customerTold: true };
    const sat = new Date('2026-11-07T12:00:00Z');
    expect(assessRisk(p, {}, sat).status).toBe('kept');
  });
  it('leaves proposals and closed promises alone', () => {
    expect(assessRisk({ ...base, status: 'proposed' }, {}, MON).status).toBe('proposed');
  });
});

describe('ledger and queue', () => {
  const ps: PromiseRecord[] = [
    { ...base, id: 'A', status: 'at_risk', dueDate: '2026-11-06' },
    { ...base, id: 'B', status: 'open', dueDate: '2026-11-03' },
    { ...base, id: 'C', status: 'open', dueDate: '2026-12-20' },
    { ...base, id: 'D', status: 'kept' },
    { ...base, id: 'E', status: 'broken' },
  ];
  it('summarises per customer', () => {
    expect(buildLedger('Acme', ps, MON)).toMatchObject({ open: 2, atRisk: 1, kept: 1, broken: 1, keptRate: 0.5 });
  });
  it('queues at-risk first, then due soonest', () => {
    expect(atRiskQueue(ps, MON).map((p) => p.id)).toEqual(['A', 'B']);
  });
  it('warns an AI agent before it repeats an at-risk promise', () => {
    const r = checkReplyAgainstPromises('It ships Friday', '2026-11-06', [
      { ...base, status: 'at_risk', statusReason: 'Release 4.2 now 2026-11-13' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.warnings[0]).toMatch(/PRM-1 is at risk/);
  });
});

import { toGraphObject } from '../src/engine';
describe('Teamwork Graph mapping', () => {
  it('links request, delivery issue, version and customer', () => {
    const g = toGraphObject(base, 'https://acme.atlassian.net/');
    expect(g.url).toBe('https://acme.atlassian.net/browse/SUP-101');
    expect(g.associations.map((a) => a.type)).toEqual(['jira-work-item', 'jira-work-item', 'jira-version', 'customer-organization']);
    expect(g.properties).toMatchObject({ status: 'open', dueDate: '2026-11-06', dependsOn: '4.2' });
  });
});

import { findTimePhrase } from '../src/engine';
describe('time phrase in a draft', () => {
  it.each([
    ['Thanks Jo, the fix ships in our next release.', 'in our next release'],
    ["I'll update you by Friday.", 'by friday'],
    ['Expect it within 2 working days.', 'within 2 working days'],
    ['We plan to deploy on 12 Nov.', 'on 12 nov'],
    ['Thanks for the logs!', ''],
  ])('%s', (draft, phrase) => {
    const got = findTimePhrase(draft);
    if (phrase === 'in our next release') expect(got).toBe('next release');
    else expect(got).toBe(phrase);
  });
});
