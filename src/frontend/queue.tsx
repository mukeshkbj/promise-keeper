// Global page: the at-risk queue and a ledger per customer.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  DynamicTable,
  Heading,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { anchorLabel, call, dueLabel, StatusLozenge, type PromiseView } from './shared';

interface LedgerRow {
  customerOrg: string;
  open: number;
  atRisk: number;
  kept: number;
  broken: number;
  keptRate: number | null;
}

const App = () => {
  const [data, setData] = useState<{ queue: PromiseView[]; ledgers: LedgerRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ queue: PromiseView[]; ledgers: LedgerRow[] }>('getQueue')
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!data) return <Spinner label="Loading" />;

  const queueRows = data.queue.map((p) => ({
    key: p.id,
    cells: [
      { key: 'status', content: <StatusLozenge status={p.status} /> },
      { key: 'due', content: dueLabel(p) },
      { key: 'customer', content: p.customerOrg },
      { key: 'req', content: <Link href={`/browse/${p.requestKey}`}>{p.requestKey}</Link> },
      { key: 'what', content: p.what },
      { key: 'anchor', content: anchorLabel(p) },
      { key: 'reason', content: p.statusReason },
    ],
  }));

  const ledgerRows = data.ledgers.map((l) => ({
    key: l.customerOrg,
    cells: [
      { key: 'org', content: l.customerOrg },
      { key: 'open', content: String(l.open) },
      { key: 'risk', content: l.atRisk ? <Lozenge appearance="moved">{String(l.atRisk)}</Lozenge> : '0' },
      { key: 'kept', content: String(l.kept) },
      { key: 'broken', content: l.broken ? <Lozenge appearance="removed">{String(l.broken)}</Lozenge> : '0' },
      { key: 'rate', content: l.keptRate === null ? '—' : `${Math.round(l.keptRate * 100)}%` },
    ],
  }));

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="medium">Needs attention</Heading>
        <Text>Promises at risk, or due in the next 3 days.</Text>
        {queueRows.length ? (
          <DynamicTable
            head={{
              cells: ['Status', 'Due', 'Customer', 'Request', 'Promised', 'Depends on', 'Why'].map((c) => ({ key: c, content: c })),
            }}
            rows={queueRows}
          />
        ) : (
          <Text>Nothing at risk. Every open promise is on track.</Text>
        )}
      </Stack>
      <Stack space="space.100">
        <Inline spread="space-between">
          <Heading size="medium">Customer ledgers</Heading>
        </Inline>
        <Text>Last 90 days, plus everything still open.</Text>
        <DynamicTable
          head={{ cells: ['Customer', 'Open', 'At risk', 'Kept', 'Broken', 'Kept rate'].map((c) => ({ key: c, content: c })) }}
          rows={ledgerRows}
          emptyView={<Text>No promises tracked yet</Text>}
        />
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
