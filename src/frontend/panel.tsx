// Issue panel. On a JSM request: confirm proposed promises and track open ones.
// On a delivery issue: show how many customer promises depend on it.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  DatePicker,
  Heading,
  Inline,
  Label,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
  Textfield,
  xcss,
} from '@forge/react';
import { anchorLabel, call, dueLabel, Quote, StatusLozenge, type PromiseView } from './shared';

interface PanelData {
  made: PromiseView[];
  carried: PromiseView[];
  carriedCount: number;
}

const card = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'radius.medium',
  padding: 'space.150',
});

function ProposedCard({ p, onDone }: { p: PromiseView; onDone: (d: PanelData | null) => void }) {
  const [what, setWhat] = useState(p.what);
  const [dueDate, setDueDate] = useState<string | null>(p.dueDate);
  const [issueKey, setIssueKey] = useState(p.issueKey ?? '');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      onDone(null);
    }
  };

  return (
    <Box xcss={card}>
      <Stack space="space.100">
        <Inline spread="space-between" alignBlock="center">
          <Strong>Promise detected</Strong>
          <StatusLozenge status="proposed" />
        </Inline>
        <Quote text={p.quote} />
        <Stack space="space.050">
          <Label labelFor={`what-${p.id}`}>What was promised</Label>
          <Textfield id={`what-${p.id}`} value={what} onChange={(e) => setWhat(e.target.value)} />
        </Stack>
        <Inline space="space.150" alignBlock="end">
          <Stack space="space.050">
            <Label labelFor={`due-${p.id}`}>Due</Label>
            <DatePicker id={`due-${p.id}`} value={dueDate ?? undefined} onChange={(v) => setDueDate(v || null)} />
          </Stack>
          <Stack space="space.050">
            <Label labelFor={`issue-${p.id}`}>Depends on issue</Label>
            <Textfield
              id={`issue-${p.id}`}
              value={issueKey}
              placeholder="ENG-42"
              onChange={(e) => setIssueKey(e.target.value.trim().toUpperCase())}
            />
          </Stack>
        </Inline>
        {p.statusReason ? <Text>{p.statusReason}</Text> : null}
        <ButtonGroup>
          <Button
            appearance="primary"
            isDisabled={busy}
            onClick={() =>
              act(() =>
                call('confirm', {
                  id: p.id,
                  what,
                  dueDate: dueDate !== p.dueDate ? dueDate : undefined,
                  issueKey: issueKey !== (p.issueKey ?? '') ? issueKey || null : undefined,
                }),
              )
            }
          >
            Track this promise
          </Button>
          <Button appearance="subtle" isDisabled={busy} onClick={() => act(() => call('outcome', { id: p.id, outcome: 'dismissed' }))}>
            Not a promise
          </Button>
        </ButtonGroup>
      </Stack>
    </Box>
  );
}

function TrackedCard({ p, onDone }: { p: PromiseView; onDone: (d: PanelData | null) => void }) {
  const [busy, setBusy] = useState(false);
  const outcome = async (o: 'told' | 'withdrawn') => {
    setBusy(true);
    try {
      await call('outcome', { id: p.id, outcome: o });
    } finally {
      onDone(null);
    }
  };
  const live = p.status === 'open' || p.status === 'at_risk';
  return (
    <Box xcss={card}>
      <Stack space="space.075">
        <Inline spread="space-between" alignBlock="center">
          <Strong>
            {p.id} · {p.what}
          </Strong>
          <StatusLozenge status={p.status} />
        </Inline>
        <Quote text={p.quote} />
        <Text>
          Due {dueLabel(p)} · depends on {anchorLabel(p)}
        </Text>
        {p.statusReason ? <Text>{p.statusReason}</Text> : null}
        {live ? (
          <ButtonGroup>
            <Button appearance={p.status === 'at_risk' ? 'warning' : 'default'} isDisabled={busy} onClick={() => outcome('told')}>
              Customer updated
            </Button>
            <Button appearance="subtle" isDisabled={busy} onClick={() => outcome('withdrawn')}>
              Withdraw
            </Button>
          </ButtonGroup>
        ) : null}
      </Stack>
    </Box>
  );
}

const App = () => {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (name = 'getPanel') =>
    call<PanelData>(name)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(String(e?.message ?? e)));

  useEffect(() => {
    load();
  }, []);

  if (error) return <SectionMessage appearance="error" title="Promise Keeper">{error}</SectionMessage>;
  if (!data) return <Spinner label="Loading promises" />;

  const proposed = data.made.filter((p) => p.status === 'proposed');
  const tracked = data.made.filter((p) => p.status !== 'proposed');
  const reload = () => load();

  return (
    <Stack space="space.200">
      {data.carriedCount > 0 ? (
        <SectionMessage appearance="warning" title={`Carries ${data.carriedCount} customer promise${data.carriedCount === 1 ? '' : 's'}`}>
          <Stack space="space.050">
            {data.carried.slice(0, 5).map((p) => (
              <Text key={p.id}>
                {p.customerOrg} · {p.requestKey} · due {dueLabel(p)}
              </Text>
            ))}
            <Text>Moving this work out may break them.</Text>
          </Stack>
        </SectionMessage>
      ) : null}

      {proposed.map((p) => (
        <ProposedCard key={p.id} p={p} onDone={reload} />
      ))}

      {tracked.length ? <Heading size="xsmall">Promises on this request</Heading> : null}
      {tracked.map((p) => (
        <TrackedCard key={p.id} p={p} onDone={reload} />
      ))}

      {!proposed.length && !tracked.length && !data.carriedCount ? (
        <Text>No promises on this request.</Text>
      ) : null}

      <Inline>
        <Button appearance="subtle" onClick={() => load('refreshPanel')}>
          Re-check now
        </Button>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
