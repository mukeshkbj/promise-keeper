import React from 'react';
import { Lozenge, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

/** invoke() may wrap the body with metadata; always return the body. */
export async function call<T>(name: string, payload?: Record<string, unknown>): Promise<T> {
  const res: any = await invoke<any>(name, payload);
  return res && typeof res === 'object' && 'body' in res && 'metadata' in res ? (res.body as T) : (res as T);
}

export interface PromiseView {
  id: string;
  requestKey: string;
  customerOrg: string;
  quote: string;
  what: string;
  timePhrase: string;
  dueDate: string | null;
  issueKey: string | null;
  anchor: { type: string; key: string; name?: string };
  status: 'proposed' | 'open' | 'at_risk' | 'kept' | 'broken' | 'withdrawn' | 'dismissed';
  statusReason: string;
  customerTold: boolean;
  daysLeft: number | null;
}

// Blue for open, yellow for at risk, red only for broken.
const APPEARANCE: Record<PromiseView['status'], 'inprogress' | 'moved' | 'removed' | 'success' | 'default' | 'new'> = {
  proposed: 'new',
  open: 'inprogress',
  at_risk: 'moved',
  kept: 'success',
  broken: 'removed',
  withdrawn: 'default',
  dismissed: 'default',
};
const LABEL: Record<PromiseView['status'], string> = {
  proposed: 'Confirm?',
  open: 'Open',
  at_risk: 'At risk',
  kept: 'Kept',
  broken: 'Broken',
  withdrawn: 'Withdrawn',
  dismissed: 'Dismissed',
};

export const StatusLozenge = ({ status }: { status: PromiseView['status'] }) => (
  <Lozenge appearance={APPEARANCE[status]} isBold={status === 'at_risk' || status === 'broken'}>
    {LABEL[status]}
  </Lozenge>
);

export function dueLabel(p: PromiseView): string {
  if (!p.dueDate) return 'No date';
  if (p.daysLeft === null) return p.dueDate;
  if (p.daysLeft < 0) return `${p.dueDate} (${-p.daysLeft}d overdue)`;
  if (p.daysLeft === 0) return `${p.dueDate} (today)`;
  return `${p.dueDate} (in ${p.daysLeft}d)`;
}

export const anchorLabel = (p: PromiseView) =>
  p.anchor.type === 'version'
    ? `Release ${p.anchor.name ?? ''}`.trim()
    : p.anchor.type === 'sprint'
      ? `Sprint ${p.anchor.name ?? ''}`.trim()
      : p.issueKey ?? 'Date only';

export const Quote = ({ text }: { text: string }) => <Text>“{text}”</Text>;
