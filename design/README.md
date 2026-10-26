# Relay design

This folder contains the product design for the centralized version of Relay.

- **[PLAN.md](./PLAN.md)** — product thesis, architecture, data model and the phased delivery plan (v2).
- **[prototype/](./prototype/)** — a clickable, dependency-free prototype that mirrors plan v2, feature by feature.
- **[docs/](./docs/)** — the working documents that turn the plan into decisions:

| Doc | Use it to | When |
|---|---|---|
| [research-plan.md](./docs/research-plan.md) | Know what we must learn, ranked by risk, and what evidence settles each question | Phase 0, and the Phase 2 pilot |
| [interview-guide.md](./docs/interview-guide.md) | Run the 8–10 problem interviews: screener, script, note template | Phase 0 |
| [competitive-research.md](./docs/competitive-research.md) | Study the Slack GitHub app, incident.io, review tools, catalogs and agents, with the same five questions for each | Phase 0, refreshed before GA |
| [open-decisions.md](./docs/open-decisions.md) | Track the decisions the plan leaves open: options, recommendation, deadline | Ongoing |
| [technical-spikes.md](./docs/technical-spikes.md) | Prove the risky parts (GitHub sync, Slack bridge, CI logs, tenancy, push, agents) before building them | Before each phase |
| [metrics.md](./docs/metrics.md) | Define the product events and how each phase-gate metric is computed | From Phase 1 |
| [pilot-playbook.md](./docs/pilot-playbook.md) | Run the 30-day design-partner pilot and read it against the kill criteria | After Phase 2 |

Suggested reading order: PLAN.md → research plan → open decisions → technical spikes.

## Open the prototype

```sh
open design/prototype/index.html
```

Or serve it locally:

```sh
npx serve design/prototype
```

The prototype is a single-page HTML/CSS/JS mockup. No build step, no external assets.

## Deciding what to build

- **Roadmap** (sidebar) lists every feature in plan v2 by phase, plus the enterprise track, the "later" list and the cuts. Each prototyped feature has a **View** button that jumps to the screen and highlights it. Mark each feature **Build**, **Later** or **Cut**; choices are saved in your browser, and **Copy as Markdown** exports them for the team.
- **Plan tags** (tag icon at the bottom of the sidebar) label every piece of UI with the phase and feature it belongs to.
- **Jump to…** (`⌘K` / `Ctrl+K`) searches screens, channels, features and docs.

## What the prototype shows

| Where | Plan v2 feature |
|---|---|
| `#payments` | PR thread with **two-way GitHub comment sync** (try replying), **inline CI failure** with log excerpt, "who broke main" and an AI **Explain**, `path:line` IDE links, an **agent** posting progress, a decision captured from a message, and message actions (permalink, create issue, mark decision) |
| `#releases` | Deploy events from the `relay` GitHub Action, release notes drafted from merged PRs, the weekly ship digest |
| `#design` | A channel **bridged with Slack**, with messages that arrived via the bridge |
| `#inc-042` | A **lightweight incident room**: severity, owners notified by push, PagerDuty link, runbook, a **stack trace resolved to repo files**, and messages flagged onto the timeline |
| Composer | `/service checkout-api` and `/incident <title>` slash commands |
| Catch up | Cited AI summary for the current channel |
| Inbox | Reviews, failing CI, mentions and incidents, each with **why it was routed to you** (CODEOWNERS / service ownership) |
| Status | Read-only deploy board, pipelines, incidents, and the **service catalog** |
| Settings | GitHub repo ↔ channel mapping, Slack bridge and import, PagerDuty/Sentry, push and routing rules, API tokens, agents (with revoke), CLI and MCP setup, entitlements, AI controls, Stripe-at-GA note |

What is deliberately **not** shown, because plan v2 cuts it: incident roles and postmortem tooling, deploy locks and approvals, standups, thread tasks, a workflow engine and LiveKit huddles. GitLab and Linear appear in Settings only as "Later".

This is intentionally a design artifact, not production code. The implementation plan starts at Phase 1 in `PLAN.md`.
