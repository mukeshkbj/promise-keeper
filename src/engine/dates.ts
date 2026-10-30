// Date resolution: turns the agent's time words into a checkable due date.
// Pure rules, no LLM. Dates are plain YYYY-MM-DD strings in the site's time zone.

import { normalise } from './text';
import type { Anchor, DeliveryContext, DueSource } from './types';

export interface ResolveOptions {
  /** IANA time zone used to decide what "today" is. */
  timeZone?: string;
  /** How to read 03/04: day first (en-GB) or month first (en-US). */
  dayFirst?: boolean;
}

export interface Resolution {
  dueDate: string | null;
  dueSource: DueSource;
  anchor: Anchor;
  /** Why no date could be set, if so. Shown to the agent on the confirm card. */
  note?: string;
}

const DAY = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---- small date utilities (UTC-midnight arithmetic on Y-M-D) ----

export function todayIn(now: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const toMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => fromMs(toMs(ymd) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const weekday = (ymd: string) => new Date(toMs(ymd)).getUTCDay();

function addWorkingDays(ymd: string, n: number): string {
  let d = ymd;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    const w = weekday(d);
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}

function endOfMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return fromMs(Date.UTC(y, m, 0)); // day 0 of next month
}

function validYmd(y: number, m: number, d: number): string | null {
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return fromMs(ms);
}

/** A date with no year: pick this year, or next year if it is well in the past. */
function inferYear(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4));
  const thisYear = validYmd(y, m, d);
  if (thisYear && daysBetween(today, thisYear) >= -7) return thisYear;
  return validYmd(y + 1, m, d);
}

/** Next occurrence of a weekday, counting today. "next Friday" means the one in the following week. */
function weekdayDate(today: string, target: number, next: boolean): string {
  const diff = (target - weekday(today) + 7) % 7;
  let d = addDays(today, diff);
  if (next) {
    // Monday-start weeks: if the occurrence is still in the current week, move a week on.
    const daysToSunday = (7 - weekday(today)) % 7;
    if (diff <= daysToSunday) d = addDays(d, 7);
  }
  return d;
}

/** Friday of this week (weeksAhead = 0) or a later week. On a weekend, "this week" means the coming one. */
function fridayOfWeek(today: string, weeksAhead: number): string {
  const w = weekday(today);
  const monday = addDays(today, -((w + 6) % 7));
  const weekend = w === 6 || w === 0;
  // On a weekend both "this week" and "next week" point to the coming working week.
  return addDays(monday, 4 + 7 * (weekend ? 1 : weeksAhead));
}

// ---- main resolver ----

export function resolveDue(
  timePhrase: string,
  now: Date,
  ctx: DeliveryContext = {},
  opts: ResolveOptions = {},
): Resolution {
  const today = todayIn(now, opts.timeZone ?? 'UTC');
  const t = normalise(timePhrase).replace(/\b(by|before|on|until|no later than)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const date = (d: string | null, source: DueSource = 'relative_date'): Resolution =>
    d
      ? { dueDate: d, dueSource: source, anchor: { type: 'date', key: 'date' } }
      : { dueDate: null, dueSource: 'none', anchor: { type: 'date', key: 'date' }, note: 'Date could not be read' };

  if (!t) return { ...date(null), note: 'No time given: pick a date' };

  // Delivery-linked phrases come first: they anchor to Jira, not the calendar.
  if (/\b(next|upcoming|coming|this|the) (release|version|build|patch|update|deploy(ment)?)\b|\brelease\b/.test(t)) {
    const v = ctx.fixVersion;
    if (!v) {
      return {
        dueDate: null,
        dueSource: 'fix_version',
        anchor: { type: 'version', key: 'version:unset' },
        note: 'Link a delivery issue with a fix version to track this',
      };
    }
    return {
      dueDate: v.releaseDate ?? null,
      dueSource: 'fix_version',
      anchor: { type: 'version', key: `version:${v.id}`, name: v.name },
      note: v.releaseDate ? undefined : `Fix version ${v.name} has no release date yet`,
    };
  }
  if (/\b(next|this|current|end of (the )?) ?sprint\b/.test(t)) {
    const s = ctx.sprint;
    if (!s) {
      return {
        dueDate: null,
        dueSource: 'sprint',
        anchor: { type: 'sprint', key: 'sprint:unset' },
        note: 'Link a delivery issue in a sprint to track this',
      };
    }
    return {
      dueDate: s.endDate ? s.endDate.slice(0, 10) : null,
      dueSource: 'sprint',
      anchor: { type: 'sprint', key: `sprint:${s.id}`, name: s.name },
      note: s.endDate ? undefined : `Sprint ${s.name} has no end date`,
    };
  }

  // Vague words: never guess.
  if (/^(soon|shortly|asap|as soon as possible|in due course|in the coming days)$/.test(t)) {
    return { ...date(null), note: `"${timePhrase}" has no date: pick one or a range` };
  }

  // ISO date.
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return date(validYmd(+m[1], +m[2], +m[3]), 'explicit_date');

  // 12/11 or 12/11/2026.
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    const [d, mo] = (opts.dayFirst ?? true) ? [a, b] : [b, a];
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return date(validYmd(y, mo, d), 'explicit_date');
    }
    return date(inferYear(today, mo, d), 'explicit_date');
  }

  // 12 Nov, 12th November, 12 Nov 2026.
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,? (\d{4}))?\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[2]) + 1;
    return date(m[3] ? validYmd(+m[3], mo, +m[1]) : inferYear(today, mo, +m[1]), 'explicit_date');
  }
  // November 12, Nov 12th 2026.
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[1]) + 1;
    return date(m[3] ? validYmd(+m[3], mo, +m[2]) : inferYear(today, mo, +m[2]), 'explicit_date');
  }

  if (/\b(today|tonight|end of (the )?day|eod|close of business|cob)\b/.test(t)) return date(today);
  if (/\btomorrow\b/.test(t)) return date(addDays(today, 1));

  // in 3 days / within 2 weeks / 48 hours / 2 working days.
  m = t.match(/\b(?:in|within)?\s*(\d+|a|one|two|three|four|five) (working |business )?(hours?|days?|weeks?)\b/);
  if (m) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
    const n = words[m[1]] ?? +m[1];
    if (m[3].startsWith('hour')) return date(addDays(today, Math.ceil(n / 24)));
    if (m[3].startsWith('week')) return date(addDays(today, 7 * n));
    return date(m[2] ? addWorkingDays(today, n) : addDays(today, n));
  }

  // Weekday names.
  m = t.match(/\b(next |this |coming )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) return date(weekdayDate(today, WEEKDAYS.indexOf(m[2]), m[1]?.trim() === 'next'));

  if (/\bend of (the )?week\b|\bthis week\b/.test(t)) return date(fridayOfWeek(today, 0));
  if (/\bnext week\b/.test(t)) return date(fridayOfWeek(today, 1));
  if (/\bend of (the )?month\b|\bthis month\b/.test(t)) return date(endOfMonth(today));
  if (/\bnext month\b/.test(t)) return date(endOfMonth(addDays(endOfMonth(today), 1)));

  return { ...date(null), note: `Could not read "${timePhrase}": pick a date` };
}
