# Design partner pilot playbook

How to run the 30-day pilot with the 3 design partners after Phase 2, and how to read the result against the kill criteria.

---

## Who qualifies

- 10–50 engineers, GitHub, Slack, a real CI pipeline (same as the [interview](./interview-guide.md) screener)
- An engineering manager who will sponsor the pilot, plus one engineer champion
- Willing to run **one or two channels** in Relay for 30 days, mapped to an active repo
- Will join a 20-minute check-in weekly and give us their security questionnaire up front

## Before day 1

- [ ] Security questionnaire answered (research question R7)
- [ ] Pilot agreement: scope, data handling, what happens to data afterwards, no fees
- [ ] Choose the pilot channel: an active repo with 5+ PRs a week
- [ ] Analytics events from [metrics](./metrics.md) Phases 1–2 are live and verified on staging
- [ ] Support channel set up (a shared channel in Relay itself, with a fallback email)

## Day 1: onboarding call (45 min)

1. The sponsor creates the workspace and signs in with GitHub.
2. Install the GitHub App and map the repo to a channel. Time this; the target is under 3 minutes.
3. Invite the team.
4. Open a real PR together and watch it become a thread. Reply from Relay and check the reply on GitHub.
5. Agree on the one habit to try: "discuss PRs in the Relay thread, not in Slack."

## Weekly check-in (20 min)

- What did you use? What did you go back to GitHub or Slack for, and why?
- One thing that annoyed you, one thing you’d miss.
- Review that week’s numbers with them: synced replies, review inbox opens, failures surfaced.
- Log bugs and requests. Fix sync bugs within 48 hours; trust is the product.

## Signals to watch

| Healthy | Warning |
|---|---|
| Replies written in Relay rise week over week | Replies happen on GitHub; Relay used read-only |
| Review inbox opened daily | Inbox opened once, then ignored |
| Champion invites more teammates unprompted | Only the champion posts |
| Requests for "more of this" (another repo, CI, incidents) | Requests for generic chat features only |

## Day 30: readout

1. Compute the kill-criterion metric: did **at least 2 of 3 partners** use PR threads or the review inbox **weekly**?
2. Exit interview with the sponsor and two engineers:
   - Would you keep using it? Would you pay $10 per seat? Why or why not?
   - How disappointed would you be if Relay went away? (very / somewhat / not)
   - What would make you move a second channel off Slack?
3. Write a one-page readout: numbers, quotes, the go/no-go call on Phase 3, and what changes in PLAN.md.

## If the pilot fails the kill criterion

Do not start Phase 3. Instead:

- Re-interview the partners about what they reached for instead.
- Check which other pain showed up most in check-ins (incidents? CI?). That may be the real wedge.
- Update [open decisions](./open-decisions.md) and the Roadmap view, then decide whether to re-run a narrower pilot or change the wedge.
