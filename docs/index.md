---
title: Promise Keeper for JSM
---

# Promise Keeper for JSM

Support agents make promises every day: "the fix is in our next release", "I'll update you by Friday". Promise Keeper turns those promises into tracked commitments, ties each one to the Jira work and release that must deliver it, and flags it **at risk** as soon as delivery slips, before the promised date passes.

- [Set up](#set-up) · [Use it](#use-it) · [Rovo agent and MCP tools](#rovo-agent-and-mcp-tools) · [Privacy policy](privacy) · [Support](support)

## How it works

1. An agent posts a **public reply** on a Jira Service Management request.
2. Promise Keeper proposes the promises it finds, quoting the agent's exact words. The agent confirms each one with a click. Nothing is tracked without confirmation.
3. The due date comes from rules: "Friday", "end of month", "within 2 working days", "12 Nov", and **"next release"** (the linked issue's fix version date) or **"next sprint"** (the sprint end date). Vague words such as "soon" are never guessed.
4. When the release moves, the work is pulled from the release, the due date is close and work isn't done, or work stalls, the promise turns **At risk** with a plain-English reason, for example *Release 4.2 now 2026-11-20, after the promised 2026-11-13*.
5. When the work ships and the agent marks **Customer updated**, the promise is **Kept**. If the date passes first, it is **Broken**.

## Set up

1. Install the app on your site (Jira with Jira Service Management).
2. On a service request, **link the delivery issue** (any link type, for example "relates to"), so the app knows which work delivers the promise.
3. Give the delivery issue a **fix version with a release date**, or put it in a sprint with an end date. Promises can also be date-only.
4. Make sure requests have a **customer organisation**, so the per-customer ledger can group them.

No other configuration is needed. The app reads Jira and never writes to issues or posts comments.

## Use it

- **Customer promises panel** (on any issue): confirm or dismiss proposed promises, edit the summary, due date or delivery issue, mark **Customer updated**, or **Withdraw**. On a delivery issue, the panel shows how many customer promises depend on it.
- **Promise Keeper page** (Apps menu): the **Needs attention** queue (at risk or due in 3 days) and a **ledger per customer** with open, at-risk, kept and broken counts and the kept rate.
- Live promises are re-checked automatically when versions, sprints or issues change, and hourly for dates that simply pass.

## Rovo agent and MCP tools

The **Promise Keeper** Rovo agent answers questions such as "What have we promised Acme?" and drafts honest updates for slipped promises. It only drafts; a person sends.

The same actions are available to AI agents as MCP tools through the Atlassian MCP server:

| Tool | Use |
| --- | --- |
| `list-promises` | Promises for a request (`requestKey`) or a customer (`customerOrg`) |
| `check-before-reply` | Before replying: warns about at-risk promises and date conflicts in the draft |
| `log-promise` | Record a promise an AI agent just made, with its exact words |

Agent instructions: [SKILL.md](https://github.com/mukeshkbj/promise-keeper/blob/main/skills/promise-keeper/SKILL.md).

## Permissions

| Scope | Why |
| --- | --- |
| `read:jira-work` | Read replies, linked issues, fix versions and sprints |
| `read:jira-user` | Read the reply author's account type (agent or customer) |
| `storage:app` | Store promise records |

The app makes no calls outside Atlassian.
