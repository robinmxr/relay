# Design partner pilot playbook

How to run the 30-day pilot with the 3 design partners after Phase 2, and how to read the result against the review triggers.

---

## Who qualifies

- 10–50 engineers, GitHub, Slack, a real CI pipeline (same as the [interview](./interview-guide.md) screener)
- An engineering manager who will sponsor the pilot, plus one engineer champion
- Willing to run **one loop** — PR threads and the review inbox — in one channel mapped to an active repo, for 30 days, while keeping Slack as general chat
- Will join a 20-minute check-in weekly and give us their security questionnaire up front

## Before day 1

- [ ] Security questionnaire answered (research question R7)
- [ ] Pilot agreement: scope, data handling, what happens to data afterwards, no fees
- [ ] Choose the pilot channel: an active repo with 5+ PRs a week
- [ ] Slack notifications connected, and the import run if they want their history
- [ ] The one loop agreed in writing, and said plainly: **a two-way Slack bridge is not part of the pilot**
- [ ] Analytics events from [metrics](./metrics.md) Phases 1–2 are live and verified on staging
- [ ] Support channel set up (a shared channel in Relay itself, with a fallback email)

## Day 1: onboarding call (45 min)

1. The sponsor creates the workspace and signs in with GitHub.
2. Install the GitHub App and map the repo to a channel. Time this; the target is under 3 minutes.
3. Invite the team.
4. Open a real PR together and watch it become a thread. Reply from Relay and check the reply on GitHub.
5. Agree on the one habit to try: "discuss PRs in the Relay thread, not on GitHub." Slack stays for general chat, and the notifications will bring people back to Relay.

## Weekly check-in (20 min)

- What did you open first this week: Relay, GitHub or Slack? Why?
- What did you go back to GitHub or Slack for, and why?
- For anything discussed in Relay: would it have happened anyway in Slack or on GitHub? The honest counterfactual matters — a polite reply is not a converted habit.
- One thing that annoyed you, one thing you’d miss. Did you mute the Slack notifications?
- Review that week’s numbers with them: synced replies, review inbox opens, failures surfaced.
- Log bugs and requests. Fix sync bugs within 48 hours; trust is the product.

## Signals to watch

Read these as direction over two or three weeks, not as a weekly verdict.

| Healthy | Warning |
|---|---|
| Replies written in Relay rise over two or three weeks | Replies happen on GitHub; Relay used read-only |
| Review inbox opened daily, often before GitHub | Inbox opened once, then ignored |
| Champion invites more teammates unprompted | Only the champion posts |
| Slack notifications stay on, and still lead back to Relay | Notifications muted within two weeks |
| Requests for "more of this" (another repo, CI, incidents) | Requests for generic chat features only |

## Day 30: readout

1. Read the numbers as bands, not a verdict: two-way replies per team per week across all four weeks, review inbox opens, and how often Relay was opened before GitHub or Slack. Look for a trend, not the best week.
2. Exit interview with the sponsor and two engineers:
   - Would you keep using it? Would you pay $10 per seat? Why or why not?
   - How disappointed would you be if Relay went away? (very / somewhat / not)
   - Would you run a second loop — CI, incidents, another repo — or is a second window too much?
   - What would make you move a loop off Slack, if anything?
3. Choose one of four outcomes: **continue**, **continue narrower** (the default), **change the wedge**, or **pause**. Write the reason in one paragraph.
4. Write a one-page readout: numbers, quotes, the outcome, and what changes in PLAN.md.

## If the pilot comes in red

Red is a prompt to change one thing, not proof the idea is dead. In order:

- Re-interview the partners about what they reached for instead.
- Check which other pain showed up most in check-ins (incidents? CI?). That may be the real wedge.
- Narrow before you abandon: keep the review inbox, drop PR threads, and re-run for two weeks. The review inbox is the cheaper half of the bet.
- Update [open decisions](./open-decisions.md) and the Roadmap view, then decide whether to re-run a narrower pilot, change the wedge, or pause.
- Only stop the plan if two consecutive reviews come in red after a narrowed scope. One bad month with three partners is noise.

## What this pilot deliberately does not test

- **Two-way Slack mirroring.** Not built and not promised ([D8](./open-decisions.md)). Do not read "we still use Slack" as a failure signal; read "we never open Relay" as one.
- **Multi-team rollouts.** One team, one loop, 30 days. Company-wide switching is a different experiment.
- **Willingness to pay at scale.** The $10 question is directional, not a pricing study.
