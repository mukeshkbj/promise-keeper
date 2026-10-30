// Core types for Promise Keeper. Pure data: no Forge imports here.

export type PromiseKind = 'fix' | 'update' | 'callback' | 'delivery' | 'other';

export type PromiseStatus =
  | 'proposed' // detected, waiting for the agent to confirm
  | 'open' // confirmed and on track
  | 'at_risk'
  | 'kept'
  | 'broken'
  | 'withdrawn'
  | 'dismissed'; // proposal rejected by the agent

export type DueSource = 'explicit_date' | 'relative_date' | 'fix_version' | 'sprint' | 'none';

export type AnchorType = 'version' | 'sprint' | 'issue' | 'date';

export interface Anchor {
  type: AnchorType;
  /** e.g. "version:10001", "sprint:42", "issue:ENG-12", "date" */
  key: string;
  name?: string;
}

export interface PromiseRecord {
  id: string; // PRM-n
  requestKey: string; // JSM request the promise was made on
  customerOrg: string; // organisation name or id ("unknown" if none)
  madeBy: string; // accountId, or "ai:<agent name>"
  quote: string; // exact words from the reply
  what: string; // short summary of what was promised
  kind: PromiseKind;
  timePhrase: string; // the words that set the date ("by Friday")
  dueDate: string | null; // ISO date YYYY-MM-DD
  dueSource: DueSource;
  issueKey: string | null; // linked delivery issue, if any
  anchor: Anchor;
  status: PromiseStatus;
  statusReason: string;
  customerTold: boolean; // the customer has been told the outcome
  confirmedBy: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  history: HistoryEntry[];
}

export interface HistoryEntry {
  at: string;
  change: string;
  from?: string;
  to?: string;
}

/** What the LLM must return for each promise it finds in a reply. */
export interface RawProposal {
  quote: string;
  what: string;
  kind: string;
  timePhrase: string;
}

export interface Proposal {
  quote: string;
  what: string;
  kind: PromiseKind;
  timePhrase: string;
}

/** Delivery facts the date resolver and risk rules need. */
export interface DeliveryContext {
  fixVersion?: { id: string; name: string; releaseDate?: string | null; released: boolean } | null;
  sprint?: { id: string; name: string; endDate?: string | null; state: 'future' | 'active' | 'closed' } | null;
  issue?: {
    key: string;
    statusCategory: 'new' | 'indeterminate' | 'done';
    lastProgressAt?: string | null; // last status change or update that counts as progress
  } | null;
}

export interface RiskConfig {
  /** Due within this many days and the work is not done → at risk. */
  nearDays: number;
  /** No progress on the issue for this many days → at risk. */
  staleDays: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = { nearDays: 2, staleDays: 5 };
