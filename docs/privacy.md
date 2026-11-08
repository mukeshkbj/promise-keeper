---
title: Privacy policy
---

# Privacy policy: Promise Keeper for JSM

_Last updated: 8 November 2026_

Promise Keeper for JSM ("the app") is an Atlassian Forge app made by Mukesh Agrawal ("we"). This policy explains what the app processes, where it is kept, and your choices.

## Summary

- The app runs entirely on Atlassian's Forge platform. It sends **no data to any server outside Atlassian**.
- It stores only what it needs to track a promise: the promise sentence, dates and Jira keys.
- It never posts comments, sends email or contacts your customers.

## What the app reads

With the scopes `read:jira-work` and `read:jira-user`, the app reads, on your Atlassian site:

- **Public agent replies** on Jira Service Management requests, to detect commitments. Internal notes are never read for this purpose. Customer comments are never turned into promises.
- **Delivery data** for linked issues: status, fix versions and release dates, sprints and their end dates.
- **The request's customer organisation name**.

## What the app stores

In Forge storage (`storage:app`), hosted by Atlassian, for each promise:

| Data | Example | Why |
| --- | --- | --- |
| The promise sentence (one sentence, copied from the reply) | "The fix will be in our next release" | Shows exactly what was promised |
| A short summary and kind | "Fix ships in next release", fix | Display |
| Request and delivery issue keys, fix version or sprint id | SUP-1, ENG-1, 4.2 | Track delivery |
| Due date, status and reason | 2026-11-13, at risk | Risk tracking |
| Customer organisation name | Acme | Per-customer ledger |
| Atlassian account IDs of the agent who made and confirmed the promise | 5ebf…63de | Audit trail |
| Change history (timestamps and status changes) | open → at risk | Audit trail |

The app does **not** store full reply bodies, customer names or email addresses, or attachments.

## AI processing

To propose promises, the text of a public agent reply is sent to a large language model through **Forge LLMs**, which Atlassian hosts within its platform. Only replies that pass a keyword check are sent. Model output is used only to propose promises; an agent must confirm each one before it is tracked. See Atlassian's documentation on Forge LLMs for how Atlassian handles this data.

## Access and permissions

Every view and every Rovo or MCP action only shows promises on requests the current user can already open in Jira.

## Retention and deletion

Promise records stay in your site's Forge app storage while the app is installed. A site admin can ask us to delete all records for their site, or for a specific account ID, by emailing the address below. When the app is uninstalled, Atlassian's Forge platform governs the removal of app storage.

## Data residency

Data is stored in Forge storage. Forge data residency follows Atlassian's Forge policies for your site.

## Sub-processors

None, other than Atlassian, which hosts the app, its storage and the Forge LLM.

## Contact

Mukesh Agrawal, mukeshkbj@gmail.com

We will update this page if the app's data handling changes, and note the date above.
