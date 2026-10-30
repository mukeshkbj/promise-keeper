// Read-only Jira access. The app reads; it never edits issues or posts comments.

import api, { route } from '@forge/api';
import type { DeliveryContext } from '../engine';
import { adfToText } from '../engine';
import { getSetting, setSetting } from './storage';

async function getJson<T>(res: { ok: boolean; json(): Promise<unknown> }): Promise<T | null> {
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface CommentInfo {
  id: string;
  text: string;
  isPublic: boolean | undefined; // undefined → not a JSM request
  authorId: string;
  authorType: string; // 'atlassian' (agent), 'customer', 'app'
  created: string;
}

export async function getComment(issueKey: string, commentId: string): Promise<CommentInfo | null> {
  const c = await getJson<any>(
    await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment/${commentId}`),
  );
  if (!c) return null;
  return {
    id: String(c.id),
    text: adfToText(c.body),
    isPublic: c.jsdPublic,
    authorId: c.author?.accountId ?? '',
    authorType: c.author?.accountType ?? 'atlassian',
    created: c.created,
  };
}

/** The field id JSM uses for customer organisations, found once and cached. */
async function organisationsFieldId(): Promise<string | null> {
  const cached = await getSetting<string>('orgFieldId');
  if (cached !== undefined) return cached || null;
  const fields = (await getJson<any[]>(await api.asApp().requestJira(route`/rest/api/3/field`))) ?? [];
  const f = fields.find((x) => x.schema?.custom === 'com.atlassian.servicedesk:sd-customer-organizations');
  await setSetting('orgFieldId', f?.id ?? '');
  return f?.id ?? null;
}

export interface RequestInfo {
  key: string;
  customerOrg: string;
  linkedIssueKeys: string[];
}

export async function getRequestInfo(requestKey: string): Promise<RequestInfo | null> {
  const orgField = await organisationsFieldId();
  const fields = ['issuelinks', 'project', ...(orgField ? [orgField] : [])].join(',');
  const issue = await getJson<any>(
    await api.asApp().requestJira(route`/rest/api/3/issue/${requestKey}?fields=${fields}`),
  );
  if (!issue) return null;
  const project = issue.fields?.project?.key;
  const orgs = orgField ? issue.fields?.[orgField] : null;
  const links: string[] = (issue.fields?.issuelinks ?? [])
    .map((l: any) => l.outwardIssue?.key ?? l.inwardIssue?.key)
    .filter((k: string | undefined): k is string => Boolean(k));
  // Prefer delivery work in another project (e.g. ENG-42 linked from SUP-101).
  const ordered = [...links.filter((k) => !k.startsWith(`${project}-`)), ...links.filter((k) => k.startsWith(`${project}-`))];
  return {
    key: issue.key,
    customerOrg: Array.isArray(orgs) && orgs[0]?.name ? orgs[0].name : 'Unknown customer',
    linkedIssueKeys: ordered,
  };
}

/** Everything the risk rules need about a delivery issue. */
export async function getDeliveryContext(issueKey: string | null): Promise<DeliveryContext> {
  if (!issueKey) return {};
  // The Agile API returns the sprint as a plain field; fall back to the platform API.
  const agile = await getJson<any>(
    await api
      .asApp()
      .requestJira(route`/rest/agile/1.0/issue/${issueKey}?fields=status,fixVersions,sprint,statuscategorychangedate,updated`),
  );
  const issue =
    agile ??
    (await getJson<any>(
      await api
        .asApp()
        .requestJira(route`/rest/api/3/issue/${issueKey}?fields=status,fixVersions,statuscategorychangedate,updated`),
    ));
  if (!issue) return { issue: null };

  const f = issue.fields ?? {};
  const versions: any[] = f.fixVersions ?? [];
  // If several versions, the earliest unreleased one is what the customer is waiting for.
  const v =
    versions.filter((x) => !x.released).sort((a, b) => (a.releaseDate ?? '9').localeCompare(b.releaseDate ?? '9'))[0] ??
    versions[0];
  const s = f.sprint;
  const cat = f.status?.statusCategory?.key as 'new' | 'indeterminate' | 'done' | undefined;

  return {
    fixVersion: v ? { id: String(v.id), name: v.name, releaseDate: v.releaseDate ?? null, released: Boolean(v.released) } : null,
    sprint: s ? { id: String(s.id), name: s.name, endDate: s.endDate ?? null, state: s.state } : null,
    issue: {
      key: issue.key,
      statusCategory: cat ?? 'new',
      lastProgressAt: f.statuscategorychangedate ?? f.updated ?? null,
    },
  };
}

/** Keys from this list the current user can open (permission-aware views). */
export async function visibleToUser(keys: string[]): Promise<Set<string>> {
  const unique = [...new Set(keys)].filter((k) => /^[A-Z][A-Z0-9_]+-\d+$/.test(k));
  const visible = new Set<string>();
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: `key in (${batch.join(',')})`, fields: ['key'], maxResults: 100 }),
    });
    const data = await getJson<any>(res);
    (data?.issues ?? []).forEach((x: any) => visible.add(x.key));
  }
  return visible;
}

export async function siteTimeZone(): Promise<string> {
  const cached = await getSetting<string>('timeZone');
  if (cached) return cached;
  // The site's default time zone decides what "Friday" means for the team.
  const props = await getJson<any>(
    await api.asApp().requestJira(route`/rest/api/3/application-properties?key=jira.default.timezone`),
  );
  const tz = (Array.isArray(props) ? props[0]?.value : props?.value) || 'UTC';
  await setSetting('timeZone', tz);
  return tz;
}
