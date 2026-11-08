# Privacy & Security tab: prepared answers

Draft answers for the Marketplace listing's Privacy & Security tab. Check each against the form's exact wording before submitting; every answer reflects the code at `main`.

## Data access and storage

| Question | Answer |
| --- | --- |
| Does the app access End-User Data? | **Yes.** It reads public agent replies on Jira Service Management requests, linked issues' status, fix versions and sprints, and the request's customer organisation. |
| Does the app store End-User Data? | **Yes**, in Forge hosted storage only: the promise sentence (one sentence from the reply), a short summary, issue keys, version or sprint id, due date, status and reason, customer organisation name, Atlassian account IDs of the agent who made and confirmed the promise, and a change history. |
| Does the app store data outside Atlassian? | **No.** No remote hosts, no egress (`permissions.external` is not declared). |
| Does the app process personal data? | **Yes, limited:** Atlassian account IDs; the stored promise sentence could contain a name if an agent wrote one. No email addresses, customer names or full reply bodies are stored. |
| Data residency | Data is held in Forge hosted storage and follows Forge's data residency for the site. The app has no other data stores. |
| Retention | Records persist while the app is installed. A site admin can request deletion of all records or a specific account's data via the support contact. |
| Logging | Logs contain issue keys, promise ids, counts and statuses only. They never contain reply text or model output. |

## AI

| Question | Answer |
| --- | --- |
| Does the app use AI/LLMs? | **Yes**, through **Forge LLMs** (Atlassian-hosted). Only public agent replies that pass a keyword pre-filter are sent. |
| What is AI output used for? | Proposals only. A person must confirm each promise before it is tracked. Proposals whose quote is not found in the reply are discarded. |
| Is data used to train models? | The app does not train or fine-tune models. Forge LLM data handling is governed by Atlassian. |

## Security

| Question | Answer |
| --- | --- |
| Authentication | Forge platform only (`api.asApp()` / `api.asUser()`). No Basic auth, no API tokens, no shared secrets stored. |
| Authorisation | Every UI view, Rovo action and MCP tool filters results to requests the current user can open (JQL as the user). Confirming a promise also checks the user can open the delivery issue. |
| Writes to the host product | **None.** Read-only Jira scopes; the app never edits issues or posts comments. |
| Third-party sub-processors | None besides Atlassian. |
| Security contact | mukeshkbj@gmail.com |
| Vulnerability disclosure | Report privately to the security contact; issues are fixed and redeployed through Forge. |

## Scopes and why

| Scope | Why it is needed |
| --- | --- |
| `read:jira-work` | Read public replies on requests, linked issues, fix versions and release dates, sprints and end dates, and the customer organisation field. |
| `read:jira-user` | Read the reply author's account type, so customer comments are never turned into promises. |
| `storage:app` | Store promise records in Forge hosted storage. |

## Remote hosts

None. The app contacts no hosts outside Atlassian.
