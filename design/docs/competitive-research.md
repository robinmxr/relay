# Competitive research

What to study, and what to look for in each. The point is to find **where Relay must be better** and **what not to build**, not to copy features. Fill the "Findings" column as you go; leave it empty rather than guess.

Timebox: 2 days of desk research in Phase 0, refreshed before GA.

---

## How to look at each product

For every product, answer the same five questions:

1. **Job:** what job does a 10–100 person engineering team hire it for?
2. **Overlap:** which Relay pillar does it compete with (4.1–4.6)?
3. **Gap:** what do users complain about? Check G2/Capterra reviews, Hacker News, Reddit, and the product’s own community or forum.
4. **Price:** per-seat price, and what the free plan withholds.
5. **Integrate or compete:** should Relay link to it, replace part of it, or ignore it?

## What to study

### Chat platforms (the incumbent and alternatives)

| Product | Look at | Findings |
|---|---|---|
| Slack + GitHub app | What the official GitHub integration does today: PR unfurls, subscriptions, threading, review reminders. This is the exact baseline Phase 2 must beat. | |
| Slack Workflow Builder, Slack AI | How far no-code automation and AI summaries already go, and their pricing | |
| Microsoft Teams + GitHub | Same as above, for Microsoft shops (likely anti-ICP) | |
| Mattermost, Zulip | Dev-focused or self-hosted chat; why teams pick them, and what they lack | |
| Discord | Why some startups run engineering on it | |

### Code review and PR workflow

| Product | Look at | Findings |
|---|---|---|
| GitHub notifications and the PR inbox | What GitHub itself already does well. Don’t rebuild it. | |
| Graphite and similar review tools | Review inbox, stacked PRs, Slack notifications | |
| Pull-reminder style Slack bots | How teams get review nudges today | |

### Incidents and on-call

| Product | Look at | Findings |
|---|---|---|
| incident.io | Slack-native incident rooms: what Relay explicitly will **not** rebuild, and what it must link to | |
| PagerDuty, Opsgenie | APIs for on-call schedules and incident links | |
| Rootly, FireHydrant | Same category; note pricing for small teams | |

### Ownership and catalogs

| Product | Look at | Findings |
|---|---|---|
| Backstage, Cortex, OpsLevel | Service catalog data models; how teams keep ownership current | |
| GitHub CODEOWNERS | Real-world coverage and staleness (research question R6) | |

### Agents and AI in team tools

| Product | Look at | Findings |
|---|---|---|
| Claude Code, Cursor, Copilot agents | Where agent output goes today; existing Slack integrations | |
| Linear agents / AI features | How a dev tool presents agent work to humans | |
| Slack AI, Glean | "Ask the workspace" expectations: citations, permissions, price | |

## Questions to answer from all of this

1. What does the Slack GitHub app **not** do that Phase 2 does? If the list is short, the wedge is weak.
2. Is anyone already doing two-way PR comment sync with chat? How well, and why hasn’t it won?
3. Which incident features are table stakes in chat (room creation, timeline), and which are clearly incident.io’s job?
4. What price do teams pay **in total** for Slack + review bots + incident tooling? Relay’s price is judged against that sum.
5. Which of these products should be launch integrations rather than competitors?

## Output

A one-page summary with: the baseline Relay must beat (the Slack GitHub app), the three biggest gaps found, an integrate/compete call per category, and a pricing table. Link it from [research plan](./research-plan.md) §3.
