# Open decisions

The decisions plan v2.1 leaves open (PLAN.md §13), plus the ones the prototype surfaced. Each one has options, a current recommendation, the evidence that would change it, and when it must be made. When a decision is made, change its status, add the date and the reason, and update PLAN.md.

Status: **Open** · **Leaning** (recommendation stands unless evidence arrives) · **Decided**

---

## Needed before Phase 1 starts

### D1 · Desktop app investment
**Status:** Open · **Decide by:** end of Phase 0

Recent commits went into desktop install and certificate pinning, while the plan says "web-first".

| Option | Cost | Upside |
|---|---|---|
| A. Pause desktop; web + PWA only | None | Focus; PWA covers push |
| B. Keep desktop as a thin shell loading the hosted URL, no new features | Low (maintenance) | Native notifications, dock badge |
| C. Keep investing | High | Matters only if partners demand it |

**Recommendation:** B. Remove certificate pinning for hosted builds, then freeze the app.
**Would change if:** 2+ design partners say a desktop app is required for the pilot.

### D2 · Free plan shape
**Status:** Open · **Decide by:** before Phase 7, but test in interviews now

- A. 10 seats, 90-day history (current plan)
- B. Unlimited seats, paid integrations beyond GitHub
- C. No free plan; 30-day trial only

**Recommendation:** A for now. B is attractive if seat limits block bottom-up adoption.
**Evidence:** where design partners hit limits during the pilot.

### D3 · Auth methods at launch
**Status:** Leaning · **Decide by:** Phase 1 week 1

GitHub OAuth + magic link (plan v2). **Would change if:** a design partner's security policy requires Google Workspace SSO; add Google OAuth then.
Launch also needs working email deliverability — a verified sending domain with SPF/DKIM. Treat that as part of this decision, not as a Phase 7 detail.

### D4 · GitHub only, or GitHub + GitLab?
**Status:** Leaning (GitHub only) · **Decide by:** end of Phase 0

**Evidence:** screener data (R8). If 25% or more of qualified leads are on GitLab, revisit.
**Either way:** design the provider interface in Phase 2 so that GitLab is additive.

---

## Needed before Phase 2

### D5 · Whose name is on synced comments?
**Status:** Open · **Decide by:** Phase 2 week 1 (after spike S1)

When Alex replies in Relay, the comment on GitHub can be posted:

- A. **as Alex**, using a GitHub App user access token, or
- B. **as the Relay bot**, with "Alex Rivera via Relay" in the body.

**Recommendation:** A. Reviews must be attributable to a person, and B looks like spam on GitHub.
**Cost:** every user must authorise the GitHub App, and tokens must be refreshed. Fall back to B when a user hasn't authorised.

### D6 · Which CI systems for failure context?
**Status:** Leaning · **Decide by:** Phase 2 week 1

- A. GitHub Actions only (logs via the API)
- B. Any check run (status and link only), with full logs for Actions
- C. Add CircleCI/Buildkite adapters

**Recommendation:** B. **Evidence:** partners' CI vendors from interviews.

### D7 · Which comments sync?
**Status:** Open

PR review comments (inline, on a line), PR conversation comments, and review summaries are different GitHub objects. Decide which ones map to the Relay thread, and how inline comments render (file + line + snippet).
**Recommendation:** sync all three; render inline comments with a `path:line` link, as in the prototype.

---

## Needed before Phase 3

### D8 · Slack integration depth
**Status:** Decided (2026-10-27) — see [Decided](#decided). Read-only history import plus one-way notifications; no two-way message bridge before GA.

### D15 · Which events notify into Slack
**Status:** Leaning · **Decide by:** Phase 2 week 1, for the four PR events; revisit in Phase 4 for incidents

- A. PR threads only
- B. The engineering loop: PR threads, review requests, failing checks, and mentions, plus incidents once rooms exist
- C. Everything a user subscribes to

**Recommendation:** B, per channel and opt-in. It keeps the loop visible without making Slack a second firehose, which is the exact complaint partners have about the GitHub app.
**Evidence:** which notifications partners mute first during the pilot. A notification nobody reads is worse than none.

### D9 · Slack import depth
**Status:** Leaning (public channels + messages; DMs and files later)

### D10 · Library scope
**Status:** Open · **Surfaced by:** the prototype

The prototype keeps a Markdown Library (documents, decisions, design notes) with an editor. Plan v2 rules out a document suite and makes decisions into messages.

- A. Keep the Library as read-mostly runbooks plus a view of decisions captured from messages
- B. Remove it; link to docs in the repo or in Notion
- C. Keep the full editor

**Recommendation:** A. Runbooks are needed for incident rooms, but editing stays minimal.

---

## Later

### D11 · Agents and billing
Do agents count as seats? **Leaning:** no seat; meter agent posts only if abuse appears.

### D12 · AI provider at launch
Hosted default + bring-your-own key (plan), or bring-your-own only? **Leaning:** hosted for activation, with BYO available in Phase 6.

### D13 · Data region
US only at launch. Revisit when an EU buyer makes residency a purchase condition (enterprise track).

### D14 · Huddles
Keep the mesh as a small-team beta, with no SFU work. **Would change if:** 3+ partners ask for huddles unprompted.

---

## Decided

### D8 · Slack bridge — deferred (2026-10-27)
**Decision:** no two-way Slack bridge before GA. Coexistence ships as **read-only history import** from the admin workspace export, plus **one-way notifications** into Slack through incoming webhooks.

**Why:**
- A bridge is the most expensive integration in the plan: threads, reactions, edits, files, author attribution and a permanent reconciliation job, for a room that exists twice.
- It is also the least certain. Slack’s terms and rate limits for non-Marketplace apps (spike S2) could block it outright, and it sat before Phase 3 — after the pilot had already been designed around it.
- It carried the entire adoption argument, which made one integration a single point of failure. Import plus notifications gets history and awareness without that.
- It does not differentiate. Message mirroring is a commodity; ownership routing and incident context are not.

**Cost accepted:** during the pilot, Relay is a second window. So the pilot is scoped to one loop (PR threads + the review inbox), and it is judged on whether Relay gets opened *before* GitHub or Slack — not on raw usage.

**Revisit when:** two or more design partners say they would move a channel off Slack but will not run a second window, or a partner makes mirroring a purchase condition. Re-open with a fresh terms check and a fresh spike; do not assume the 2026 answer still applies.

_Next: D1, D3, D5, D6 and D10 are leaning and can be closed after the Phase 0 interviews and spikes._
