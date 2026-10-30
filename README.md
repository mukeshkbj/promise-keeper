# Promise Keeper

A Forge app for Jira Service Management. It turns the promises agents make in replies
("the fix is in our next release", "I'll update you Friday") into tracked commitments,
ties each one to the Jira work and release that must deliver it, and warns the agent
**before** the promise breaks.

Codegeist 2026 entry. Bonus coverage: Rovo agent + actions (Best Agents), `rovo:mcp`
tools + `SKILL.md` (Best MCP), Teamwork Graph mapping (Best Teamwork Graph, write-back
pending the spike below), free Marketplace listing (Best Marketplace).

## How it works

```
public agent reply ──► pre-filter ──► Forge LLM proposes ──► quote check ──► agent confirms
                                                                               │
Jira: version / sprint / issue changes ──► reverse index ──► risk rules ◄──────┘
                                                               │
                         open · at risk · kept · broken ◄──────┘  (+ reason in plain English)
```

- **The LLM only proposes.** Its quote must appear in the reply or the proposal is dropped.
  Only promises the agent confirms are tracked, so the demo never depends on extraction accuracy.
- **Dates are rules, not guesses.** "Friday", "end of month", "within 2 working days", "12 Nov",
  "next release" (→ fix version date), "next sprint" (→ sprint end). "Soon" is never guessed.
- **Risk is deterministic.** A promise turns at risk when its release moves past the due date,
  the issue is pulled from the version, the due date is near and work isn't done, or work stalls.
  Every status carries a reason, e.g. `Release 4.2 now 2026-11-13, after the promised 2026-11-06`.
- **Never auto-sends.** Drafts only; a person always sends.

## Layout

| Path | What |
| --- | --- |
| `src/engine/` | Pure logic: pre-filter, proposal gate, date resolver, risk rules, ledger, graph mapping. No Forge imports. |
| `src/forge/` | Storage (Custom Entity Store), Jira reads, LLM call, service, triggers, resolver, Rovo/MCP actions. |
| `src/frontend/` | UI Kit: issue panel (confirm + track) and global page (at-risk queue + customer ledgers). |
| `skills/promise-keeper/SKILL.md` | Instructions for third-party agents using the MCP tools. |
| `test/` | 37 engine tests built around the demo story. |

## Run the checks

```bash
npm install
npm test          # engine tests
npm run typecheck
```

## Deploy to your dev site

You need a free Atlassian Cloud developer site with **Jira Service Management** and **Jira**,
with Rovo enabled for the agent and MCP surfaces.

```bash
npm install -g @forge/cli
forge login                 # your Atlassian email + API token, in your own terminal
forge register              # replaces the placeholder app.id in manifest.yml
forge deploy
forge install --product jira --site <your-site>.atlassian.net
```

Then in JSM: link a request (e.g. SUP-1) to a delivery issue (ENG-1) that has a fix version
with a release date, and post a public reply such as *"The fix will be in our next release."*
The **Customer promises** panel on the request proposes the promise. Confirm it, then move the
fix version's release date past it and watch it turn **At risk**.

Useful while developing: `forge tunnel` (live reload) and `forge logs`.

## Week-1 spikes (from the design doc)

1. **`rovo:mcp`** is an early-access module. If `forge deploy` rejects it on your site, remove the
   `rovo:mcp` block; the Rovo agent keeps working through the same actions.
2. **Teamwork Graph write-back.** `src/engine/graph.ts` maps a promise to a graph object
   (request, delivery issue, version, customer). Wiring the write needs a `graph:connector`
   module, `npm i @forge/teamwork-graph`, scopes `read:object:jira` / `write:object:jira`, and
   an admin-configured connection. Confirm object types on your site, then call
   `graph.setObjects({ objects, connectionId })` from `refreshPromises` and `confirmPromise`.
3. **LLM model name.** `src/forge/llm.ts` uses `claude-sonnet-4-5-20250929`. Check the models
   enabled for your app in the developer console and update `MODEL` if needed.
4. **JSM queue page.** The at-risk queue ships as a Jira global page. Swap to a JSM queue page
   module if one fits better on your site.

## Not built yet

- Demo seed script (Acme, SUP-101 linked to ENG-42 in release 4.2).
- Marketplace listing assets (privacy policy, icon, support URL).
- Graph write-back (spike 2).
