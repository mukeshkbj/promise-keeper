// Teamwork Graph shape for a promise. Pure mapping so it can be tested here.
// The write itself (graph.setObjects via @forge/teamwork-graph and a graph:connector
// module) is wired in after the week-1 spike confirms which object types and
// connection set-up the dev site allows. See README → "Teamwork Graph".

import type { PromiseRecord } from './types';

export interface GraphPromiseObject {
  schemaVersion: '1.0';
  id: string;
  updateSequenceNumber: number;
  displayName: string;
  description: string;
  url: string;
  createdAt: string;
  lastUpdatedAt: string;
  /** Plain properties so agents can filter by them. */
  properties: Record<string, string>;
  /** Links to the objects a promise connects. */
  associations: { type: string; key: string }[];
  'atlassian:document': { type: { category: 'document' }; content: { mimeType: 'text/plain'; text: string } };
}

export function toGraphObject(p: PromiseRecord, siteUrl: string): GraphPromiseObject {
  const associations = [{ type: 'jira-work-item', key: p.requestKey }];
  if (p.issueKey) associations.push({ type: 'jira-work-item', key: p.issueKey });
  if (p.anchor.type === 'version') associations.push({ type: 'jira-version', key: p.anchor.key.replace('version:', '') });
  if (p.customerOrg && p.customerOrg !== 'Unknown customer') associations.push({ type: 'customer-organization', key: p.customerOrg });

  return {
    schemaVersion: '1.0',
    id: p.id,
    updateSequenceNumber: Date.parse(p.updatedAt) || Date.now(),
    displayName: `${p.id}: ${p.what}`,
    description: `Promised to ${p.customerOrg} on ${p.requestKey}: "${p.quote}"`,
    url: `${siteUrl.replace(/\/$/, '')}/browse/${p.requestKey}`,
    createdAt: p.createdAt,
    lastUpdatedAt: p.updatedAt,
    properties: {
      status: p.status,
      dueDate: p.dueDate ?? '',
      customer: p.customerOrg,
      dependsOn: p.anchor.name ?? p.issueKey ?? '',
      kind: p.kind,
    },
    associations,
    'atlassian:document': {
      type: { category: 'document' },
      content: {
        mimeType: 'text/plain',
        text: [
          `Promise ${p.id} (${p.status})`,
          `Customer: ${p.customerOrg}`,
          `Request: ${p.requestKey}`,
          `Promised: ${p.what}`,
          `Exact words: "${p.quote}"`,
          `Due: ${p.dueDate ?? 'no date'}`,
          `Depends on: ${p.anchor.name ?? p.issueKey ?? 'date only'}`,
          p.statusReason ? `Why: ${p.statusReason}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    },
  };
}
