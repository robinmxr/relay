# Open decisions

The decisions plan v2 leaves open (PLAN.md §13), plus the ones the prototype surfaced. Each one has options, a current recommendation, the evidence that would change it, and when it must be made. When a decision is made, change its status, add the date and the reason, and update PLAN.md.

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

### D8 · Slack bridge depth
**Status:** Open · **Decide by:** after spike S2

- A. Messages only
- B. Messages + threads + reactions
- C. B + files

**Recommendation:** B. Threads matter for a credible trial; files can be links at first.
**Blocked by:** Slack API terms and rate limits for non-Marketplace apps (spike S2). If the terms block a bridge, this becomes an import-plus-"post summaries back to Slack" path, and kill criterion 2 needs rewriting.

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

_Move entries here with date, decision and reason._
