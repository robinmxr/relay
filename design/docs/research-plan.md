# Research plan

What we need to learn before and during Phase 0–2, ranked by how badly a wrong answer would hurt. Each question names the method, the evidence that would settle it, and the plan section it can change.

Owner: product · Timebox: Phase 0 (1 week) plus the 30-day Phase 2 pilot

---

## 1. The questions, ranked by risk

| # | Question | Why it matters | Method | Settled when | Changes |
|---|---|---|---|---|---|
| R1 | Is the PR ↔ chat context switch the most painful one, or is it incidents, CI failures or "where did we decide that"? | The whole wedge (Phase 2) assumes PRs. If incidents hurt more, the sequence flips. | 8–10 interviews ([interview guide](./interview-guide.md)), ranked problem list | 7+ of 10 rank PR pain in their top two, or 5+ rank it first. Score PR separately from CI; bundling them hides which wedge to build. | §9 sequencing |
| R2 | Will engineers reply in a Relay thread instead of on GitHub? | Two-way sync only has value if people write in Relay. | Interviews (current habits) + pilot metric "PR replies written in Relay" | ≥ 20 synced replies per active team per week — deliberately twice the green band, so passing the gate is not the same as settling the question | Pillar 4.2, review trigger 1 |
| R3 | Will a team run Relay as a second window for one loop while staying on Slack, and does one-way notification make that tolerable? | Slack network effects are the top adoption risk, and there is no bridge to soften it (D8). | Pilot: weekly check-ins, whether Relay gets opened before GitHub or Slack ([technical spikes](./technical-spikes.md) S2 covers import and notifications) | 2 of 3 partners keep one Relay channel active for 4 consecutive weeks, and at least one opens Relay before GitHub on a review request | Phase 3 scope, review trigger 2 |
| R4 | Who buys, and at what price? | $10/$18 per seat is a guess. | Pricing questions in interviews; Van Westendorp on 15+ responses | A price band that 60%+ of EMs call "acceptable" | §6.5 packaging |
| R5 | Do agents need a home in team chat? | Agents-as-members is a bet on 2026 workflows. | Interviews: how teams run Claude Code/Cursor agents today | 3+ teams already pipe agent output into Slack or PRs | Phase 5 priority |
| R6 | Is ownership data (CODEOWNERS, service catalog) good enough to route on? | Ownership-aware routing fails on stale CODEOWNERS. | Ask partners for their CODEOWNERS; measure coverage | ≥ 70% of changed paths in the last 100 PRs have an owner | Phase 4 routing |
| R7 | What do security reviewers require before a pilot? | A blocked security review kills a pilot regardless of product fit. | Ask each design partner for their vendor questionnaire | We can answer every "must" item for Phase 1 | Phase 1 scope, enterprise track |
| R8 | Is GitHub-only acceptable? | GitLab teams are excluded at launch. | Screener data: % of qualified leads on GitLab | < 25% of qualified leads need GitLab | Open decision D4 |

## 2. Hypotheses to try to break

Write these down before interviews so we can't rationalise afterwards.

1. **Engineers lose 30+ minutes a day** switching between GitHub, CI and chat. *Disproved if* most interviewees can't name a recent concrete instance.
2. **The Slack GitHub app is seen as noise**, not as a solution. *Disproved if* teams say it works well and they'd only want small tweaks.
3. **Teams would run two chat tools for 30 days** for one loop, with Slack still pinging them. *Disproved if* EMs say they would only switch all at once, or if Relay opens fall in weeks 3–4.
4. **Incident tooling is already solved** (PagerDuty/incident.io) and teams don't want another one. *Disproved if* teams under 50 engineers have no incident tooling and want it in chat.
5. **AI catch-up is a nice-to-have, not a reason to switch.** *Disproved if* it comes up unprompted as a top-3 pain.
6. **A one-way notification is enough to make a second window tolerable.** *Disproved if* partners keep the notification on but stop opening Relay, or mute it within two weeks. This is the assumption that replaced the Slack bridge (D8), so it needs its own test.

## 3. Desk research (no interviews needed)

- **Competitor teardown**: see [competitive research](./competitive-research.md).
- **Platform constraints**: GitHub App permissions and rate limits; Slack incoming webhooks and workspace-export import (no bridge, so no Marketplace review); iOS Web Push requirements. See [technical spikes](./technical-spikes.md).
- **Market sizing (light)**: count of companies with 10–100 engineers on GitHub + Slack. One estimate with a stated method is enough; do not spend more than half a day.
- **Pricing benchmarks**: per-seat prices of Slack Pro/Business+, Linear, incident.io, Graphite, Sentry Team. Note what each gates behind the paid plan.

## 4. Synthesis

After each interview, fill the template at the end of the [interview guide](./interview-guide.md) within 24 hours. After the last interview:

1. Tally the ranked problem list across interviews (R1).
2. Mark each hypothesis in §2 as held, broken or unclear, with quotes.
3. Update the decisions in [open decisions](./open-decisions.md) that the evidence settles.
4. Update the Roadmap view in the prototype (Build / Later / Cut) and export it for the record.
5. Write a one-page summary: what we learned, what changes in PLAN.md, what's still unknown.

## 5. Ethics and handling

- Ask permission before recording; store notes without company secrets.
- Do not promise features or dates in interviews.
- Offer design partners early access and a direct line, not payment.
