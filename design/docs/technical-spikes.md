# Technical spikes

Time-boxed experiments to run **before** committing to the phase that depends on them. Each spike ends with a short written answer, not production code. Platform facts below reflect our understanding as of October 2026. **Verify each against current docs before relying on it**; APIs and terms change.

| Spike | Blocks | Timebox | Riskiest unknown |
|---|---|---|---|
| S1 GitHub two-way comment sync | Phase 2 | 3 days | Attribution and loop safety |
| S2 Slack bridge and import | Phase 3 | 2 days | Whether Slack’s terms and rate limits allow it at all |
| S3 CI log excerpts | Phase 2 | 1 day | Log access and size |
| S4 Multi-tenant foundation | Phase 1 | 3 days | RLS + PGlite parity, Redis fan-out |
| S5 Web Push | Phase 3 | 1 day | iOS behaviour |
| S6 Stack-trace resolution | Phase 3 | 1 day | Mapping deployed commit and build paths |
| S7 Agent identity via MCP | Phase 5 | 2 days | Routing human replies back to an agent |

---

## S1 · GitHub two-way comment sync

**Question:** can a reply typed in Relay appear on the right GitHub thread, attributed to the person, without duplicates or echo loops?

Try:

1. Create a GitHub App with pull request read/write and webhooks for `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `check_run` and `check_suite`.
2. Post a reply to an inline review comment, and a top-level PR comment, using **both** an installation token (posts as the bot) and a user access token (posts as the person). Compare how each looks on GitHub. This settles decision D5.
3. Echo loop: when GitHub sends the webhook for a comment Relay just posted, recognise it and drop it. Store the GitHub comment id against the Relay message (`pr_comment_links`) *before* the webhook can arrive. Check that a webhook arriving first is still handled.
4. Edits and deletes in either direction.
5. Rate limits: measure calls per PR event; estimate the per-installation budget for a 50-engineer org.

**Done when:** a 2-page note covers attribution, the dedupe scheme, edit/delete semantics, rate-limit headroom, and the webhook-replay/reconciliation strategy.

## S2 · Slack bridge and import

**Question:** is a two-way bridge allowed and practical for a non-Marketplace app?

Try:

1. **Read Slack’s current API Terms and rate-limit policy first.** Our understanding is that Slack tightened `conversations.history`/`conversations.replies` limits for commercially distributed non-Marketplace apps in 2025, and restricts some uses of message data. If true, history import via the API and polling-based sync are impractical without Marketplace approval. Confirm what applies to a new app today.
2. Bridge with the Events API (push), not polling: post into Slack with `chat.postMessage`, using a custom username/icon per author if allowed.
3. Import from Slack’s **workspace export** (admin-triggered ZIP) instead of the API. This avoids history rate limits.
4. Threads, reactions and edits in both directions. Plan loop protection the same way as S1.

**Done when:** we know whether the bridge is (a) fine, (b) fine only after Marketplace approval, with a timeline, or (c) not allowed. Option (c) changes Phase 3 and kill criterion 2. Feeds decision D8.

## S3 · CI log excerpts

**Question:** can we reliably show the failing step and the relevant lines?

- GitHub Actions: get the failed job and step from the run, then fetch that job’s log. Logs can be large; keep only the tail and the lines matching error patterns.
- Other CI providers: check runs carry a summary and details URL, but not raw logs. Show status and link only (decision D6).
- "Who broke main": first failing commit on the default branch after the last green run. Flaky hint: same check, same commit, different outcomes on re-run.

**Done when:** excerpts for 20 real failures from partner repos are judged "useful" by an engineer in at least 15 of 20 cases.

## S4 · Multi-tenant foundation

Ground truth from the repo today:

- `FileStore` in `apps/server/src/files.ts` is a **class**, not an interface. Extract an interface before adding an S3 driver (PLAN.md §11 assumes the interface exists).
- Rate limiting uses `@fastify/rate-limit` in `apps/server/src/app.ts`. Point it at the Redis store in production.
- `apps/server/src/huddles.ts` and `presence.ts` hold in-memory state that must move to Redis or stay dev-only.

Try:

1. Postgres RLS on `messages` and `channels`, keyed on `current_setting('app.workspace_id')`. Check that it behaves the same on PGlite (used in dev and tests), or decide that RLS is tested on Postgres only.
2. Write the tenant-isolation test harness: for each route, sign in as workspace A and request B’s ids.
3. Run two app instances behind a load balancer with Redis pub/sub fan-out. Send messages to the same channel from both.

**Done when:** an isolation-test pattern exists, every existing route passes it, and the two-instance fan-out works.

## S5 · Web Push

- Desktop browsers: standard Push API + service worker.
- iOS: Web Push works only for web apps **added to the Home Screen** (iOS 16.4+). Test the "install" prompt flow; this is what on-call engineers will actually use.
- Measure delivery delay for a push sent by a worker.

**Done when:** an incident push reaches an iPhone with the installed PWA in under 10 seconds.

## S6 · Stack-trace resolution

- Identify the deployed commit: from deploy events (the `relay` GitHub Action) or Sentry release tags.
- Map build paths (`/app/dist/...`, source maps) to repo paths. Try one Node service and one browser bundle.

**Done when:** 80% of in-repo frames from 20 real traces map to the right file and line.

## S7 · Agent identity via MCP

- An MCP server exposing `read_channel`, `post_message`, `post_progress` and `wait_for_reply`, authenticated by a channel-scoped agent token.
- How does a human reply reach a running agent? Options: the agent polls a thread, a long-poll tool, or a webhook to the agent runner. Test with Claude Code.
- Revocation must stop posts immediately, and every post must be audited.

**Done when:** a Claude Code session posts progress to a thread, receives a human reply, and is cut off by a revoke mid-run.
