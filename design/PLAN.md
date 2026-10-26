# Relay — centralized engineering workspace

**Product, architecture and phased delivery plan**

Status: Draft v2 · October 2026
Decision: **centralized, multi-tenant SaaS** · no self-hosting
Starting point: the existing Relay monorepo (`apps/server`, `apps/web`, `apps/desktop`, `packages/shared`)

### Changes in v2

- **Scope cut by about a third.** v1 summed to 42–62 engineer-weeks; v2 is 30–44 weeks plus a separate, demand-driven enterprise track.
- **Sequencing:** a thin GitHub slice now comes straight after the foundation (Phase 2), so the headline milestone lands in about 10 weeks instead of 14–20.
- **Cut or deferred:** the GitOps workflow engine, LiveKit huddles, async standups, thread tasks, incident roles and postmortem export, deploy locks and approvals, repo code indexing, snippet variables, JetBrains extension, Google OAuth and passwords at launch, Stripe before GA, and 10k-socket load tests.
- **Added:** two-way PR comment sync, a Slack bridge, inline CI failure context, stack trace → repo/IDE links, ownership-aware notification routing, earlier push notifications, agents as channel members, and kill criteria.

---

## 1. The decision

Relay is a centralized service. The server is the source of truth, the web client is the primary experience, and the Electron app is a thin desktop client that loads the hosted app.

This is a deliberate change from the current self-hosted design:

| Area | Current repo | Centralized Relay |
|---|---|---|
| Server | Each customer can run their own | One managed, multi-tenant service |
| Database | PGlite by default, Postgres optional | Managed Postgres, PGlite only for local development |
| Files | Local disk | Object storage + CDN signed URLs |
| Presence / realtime | In-process or optional Redis | Redis-backed fan-out, stateless app instances |
| Auth | Password + recovery code, no email | GitHub OAuth + magic links at launch; MFA and SSO on the enterprise track |
| Billing | None | Entitlements from day one; Stripe at GA |
| Updates | Customer upgrades their install | Continuous deployment |
| Moat | Data control / air-gap | **Developer workflow depth** |

The trade-off is explicit: we lose the “runs on your laptop / air-gapped” buyer. We gain instant onboarding, one product to improve, email and OAuth, billing, mobile push, and a much larger addressable market. The differentiation therefore cannot be “self-hosted.” It has to be **the best chat product for engineering work**.

---

## 2. Thesis

Slack is a general communication layer. Engineering work is still spread across GitHub, CI, PagerDuty, Datadog, Linear, runbooks and docs. Developers pay a context-switching tax all day:

- read a PR in GitHub, discuss it in Slack, check CI in another tab;
- open an incident in PagerDuty, coordinate in Slack, write the postmortem in a doc;
- ask “why did we choose this?” in Slack and hope someone remembers;
- copy a stack trace into chat, where it becomes unreadable text;
- switch to the terminal to post a deploy notification.

**Relay’s bet:** chat is the natural interface for engineering work. If the room understands code, pull requests, services, deploys and incidents, teams stop switching tools.

**Positioning:**

> Relay is the centralized engineering workspace: chat that understands your repo, your CI, your services and your incidents.

Not “a cheaper Slack.” Not “Slack with code blocks.” The product is an **engineering control plane with chat at the center**.

---

## 3. Who it is for

### Primary ICP

- 10–100 person product engineering organizations
- GitHub-centric, with a real CI pipeline
- Remote or hybrid, async-heavy
- Already paying for Slack + GitHub + at least one of PagerDuty, Linear, Datadog or Sentry
- Feeling the “where did we decide that?” and “which PR is this?” tax

### Buyer and users

| Role | Cares about |
|---|---|
| Engineering manager / CTO | Fewer tools, faster onboarding, visibility into delivery and incidents |
| Engineer | Code context, review queue, CLI/IDE integration, signal over noise |
| On-call / SRE | Incident rooms, timelines, runbooks, deploy visibility, mobile alerts |
| Admin / IT | SSO, audit logs, retention, data location, billing |

### Anti-ICP

- Non-technical teams looking for a general Slack replacement
- Very large enterprises that require on-prem or air-gapped deployment
- Teams that do not use GitHub/GitLab or pull requests
- Companies whose primary need is video meetings or document editing

---

## 4. Differentiation pillars

### 4.1 Code-native chat

Code blocks with syntax highlighting, diffs, logs, stack traces, copy buttons and **deep links into the IDE**. A message can point at `apps/api/src/auth.ts:42` and open it in VS Code, JetBrains or Cursor (these are URL schemes, so no extension is needed). Stack traces resolve against the linked repo: each frame links to the file and line on GitHub or in the IDE, at the right commit.

**Why Slack is not enough:** Slack renders code as text. It does not know your repository or your editor. This is the lowest-effort, highest-signal dev feature.

### 4.2 Repo/CI-native rooms

A GitHub app that turns PRs, commits and issues into first-class objects: rich unfurls, CI status, auto-created PR threads, a review-requested inbox, and two-way message ↔ issue links.

Two things make this more than a notification feed:

- **Two-way PR comment sync.** A reply in the Relay PR thread posts to the GitHub review thread, and GitHub review comments appear in the Relay thread. The conversation lives in one place, whichever side people use.
- **CI failure context inline.** When a check fails, the thread shows the failing step and a log excerpt that links to the line, plus “who broke main” and flaky-test hints.

**Why Slack is not enough:** Slack’s GitHub integration is a notification firehose. The PR is still a link to another tab. Relay makes the PR a room with the conversation attached.

### 4.3 Ops control room

Service catalog, ownership, lightweight incident rooms, a deploy board, release notes and runbooks, native rather than a pile of separate apps. Relay **orchestrates and links**: it does not replace PagerDuty, incident.io or CD tooling (no incident role management, deploy locks or approval gates).

Ownership drives routing: CODEOWNERS and the service catalog decide who gets notified about a PR, a failing check or an incident, so pings go to owners instead of whole channels.

**Why Slack is not enough:** Slack relies on incident.io, PagerDuty, Datadog and custom bots. The data lives in separate SaaS silos and the chat only sees fragments.

### 4.4 Developer and agent surfaces

A first-class CLI and an MCP server for coding agents. Post from CI, ask from the terminal, share from the editor via the CLI.

**Agents as channel members.** A coding agent (Claude Code, Cursor, CI bots) gets a scoped identity, posts its progress into a thread, and humans approve, redirect or reply there. Agent runs are visible, attributable and revocable.

A VS Code extension follows once the CLI and MCP are proven. JetBrains is not planned.

**Why Slack is not enough:** Slack’s API is cloud-only and generic, and agents in Slack are bolted-on bots. Relay can be present where the code is and treat agents as first-class participants.

### 4.5 CI-native automation

Automation lives where dev teams already automate: a `relay` GitHub Action, incoming and outgoing webhooks, and slash commands. Configuration that belongs to a repo is committed to that repo, reviewed in a PR and versioned with the code.

A dedicated workflow engine (`.relay/workflows.yml` with triggers, conditions and dry-runs) is **deferred**. Revisit it only if design partners hit limits that Actions and webhooks cannot cover.

**Why Slack is not enough:** Slack Workflow Builder is a GUI, admin-managed and cloud-only. Repo-versioned automation is how dev teams already work.

### 4.6 AI with citations and control

Catch-up, thread summaries, decision/action extraction, “ask the workspace,” error explanation and release notes. Permission-aware, cited, opt-in, with bring-your-own model key and a no-training guarantee.

**Why Slack is not enough:** Slack AI is cloud-only, per-seat and generic. Relay can make AI trustworthy for engineering data: citations, scoped retrieval, model choice and clear data controls.

---

## 5. Scope

### Must win in the first 12 months

1. GitHub PR threads with two-way comment sync, inline CI failure context and a review inbox
2. Code-native messages, stack trace links and IDE deep links
3. Coexistence with Slack: a channel bridge, plus Slack import
4. Service catalog with ownership-aware routing
5. Lightweight incident rooms and a read-only deploy board
6. API tokens, webhooks, the GitHub Action, CLI and MCP (agents as channel members)
7. Push notifications (PWA) for mentions, reviews and incidents

Billing, SSO and audit logs follow demand: entitlements exist from Phase 1, Stripe ships at GA, and enterprise features run on a separate track (§9).

### Later

- GitLab, Bitbucket and Linear integrations
- VS Code extension
- Repo-versioned workflow engine (`.relay/workflows.yml`)
- Native mobile apps
- Data residency (US/EU), SCIM, legal hold, eDiscovery
- Shared channels with external organizations
- Marketplace / third-party apps

### Explicitly out of scope

- Self-hosting or air-gapped deployment
- A full Canvas/document suite
- A generic GUI workflow builder
- Incident-management depth: role assignment (IC/comms/scribe), postmortem tooling, paging. Integrate with PagerDuty/incident.io instead.
- Deploy orchestration: locks, approval gates and rollbacks. Use GitHub Environments / Argo; Relay displays them.
- Async standups and thread task tracking (Geekbot and Linear already do this)
- Repository code indexing and code search (Sourcegraph territory); Relay searches code in messages only
- Production-grade huddles (LiveKit/SFU, recording, transcription). The mesh stays a small-team beta; otherwise unfurl Meet/Zoom links.
- JetBrains extension
- E2EE (conflicts with search, bots and AI; revisit for DMs later)
- A video-conferencing product

---

## 6. Architecture

### 6.1 Current state

- **Web:** React + Vite, one reducer-driven workspace shell.
- **Server:** Fastify + WebSocket, REST for writes, one socket per client.
- **Data:** PGlite by default or Postgres; local-disk files; optional Redis for events, presence and rate limits.
- **Desktop:** Electron shell that loads the web client and adds notifications, badge, deep links and certificate pinning.
- **Shared:** `packages/shared` with types and the WebSocket protocol.

This is a good starting point. The centralized version keeps the domain model and UI shell, but replaces the runtime assumptions.

### 6.2 Target topology

```text
Browser / Electron / CLI / MCP / agents
                │
        CDN + WAF + TLS
                │
        Load balancer / API gateway
                │
   ┌────────────┴────────────┐
   │  Fastify app instances  │  stateless, autoscaled
   │  REST + WebSocket       │
   └────────────┬────────────┘
                │
   ┌────────────┼─────────────┬──────────────┐
   │            │             │              │
Postgres      Redis          S3          Worker pool
(primary +   (pub/sub,     (files,      (GitHub sync,
 replica)     presence,     avatars,     Slack bridge,
              rate limits,   exports)     webhooks, email,
              queues)                     push, AI jobs)
                │
   GitHub App · Slack API · email provider · Web Push · Sentry/OpenTelemetry · AI provider · Stripe (GA)
```

**Rules:**

- App instances are stateless. No in-memory presence or rate-limit counters in production.
- All long-running work goes to workers with idempotency keys and retries.
- WebSocket fan-out goes through Redis; each instance only holds its own sockets.
- Sync jobs (GitHub comments, Slack bridge) are idempotent and loop-safe: every mirrored item records its origin so it is never echoed back.
- Huddles keep the current mesh as a small-team beta. No SFU work is planned.

### 6.3 Tenancy

A **workspace is the tenant** and the billing account. Users are global and can belong to multiple workspaces (the current model already supports this).

- Every tenant-owned row has `workspace_id`.
- All queries go through `requireWorkspace` / `requireChannel`-style helpers.
- Add Postgres row-level security as defense in depth for the highest-risk tables.
- Object-storage keys are prefixed `workspace/<id>/…`; signed URLs are scoped and short-lived.
- WebSocket subscriptions are authorized per workspace and channel; no cross-tenant fan-out.
- Rate limits are per user, per workspace and per IP.
- Integration tokens and webhook secrets are encrypted at rest.
- Add an automated tenant-isolation test suite that attempts cross-workspace reads for every new endpoint.

### 6.4 Auth

Phase 1 (launch):

- GitHub OAuth (primary; the ICP is GitHub-centric and the repo features need it)
- Magic-link sign-in by email
- Invites by email; auto-suggest invites from GitHub org members
- Session/device list and revoke
- Owner/admin/member/guest roles

On demand (when a design partner asks):

- Google OAuth
- Email/password with verification

Enterprise track:

- TOTP MFA
- SAML/OIDC SSO
- SCIM provisioning
- Audit-log export

The current recovery-code flow can remain as a fallback, but it is no longer the primary reset path. Centralized Relay has email, so use it.

### 6.5 Billing

Build the **entitlements service and plan schema in Phase 1**: every gated feature checks it server-side from the start. **Stripe** (Billing + Checkout + Customer Portal) ships in Phase 7, once design partners have shown they would pay. Until then, plans are assigned manually.

Proposed packaging (validate with design partners):

| Plan | Price | Limits |
|---|---|---|
| Free | $0 | 10 seats, 90-day history, 1 integration, 5 GB files |
| Team | $10/user/month | Unlimited history, 10 integrations, 100 GB, review inbox, CLI/MCP, Slack bridge |
| Business | $18/user/month | SSO, audit log, retention controls, priority support |
| AI add-on | $5/user/month or usage-based | Catch-up, summaries, ask, BYO key |

Entitlements are checked server-side by a single `entitlements` service. Never trust the client. Seat counts sync from active workspace members. Add a 14-day Team trial on signup. Gate only features that create real cost or enterprise value; do not cripple the core chat for free teams. Data export is available on every plan, so leaving Relay is never a lock-in fear.

### 6.6 Data and storage

- Managed Postgres with PITR backups and a read replica for analytics/search later.
- S3-compatible object storage for uploads, avatars and exports.
- Redis for pub/sub, presence TTLs, rate limits and queues.
- Signed URLs with short TTLs; virus scanning for uploads; image thumbnails via a worker.
- Migrations use expand/contract so deploys never require downtime.
- Retention and export are workspace settings; deletion is asynchronous and audited.

### 6.7 Realtime

Keep the current protocol shape (`ServerEvent` / `ClientEvent`) and add typed events for:

- `pull_request.updated`
- `pull_request.comment_synced`
- `check.failed`
- `review.requested`
- `incident.updated`
- `deploy.updated`
- `agent.run.updated`
- `ai.job.updated`
- `notification.created`

Redis pub/sub fans out envelopes. WebSocket connections authenticate with a short-lived session token, then subscribe only to authorized channels. Presence is a Redis key with a TTL, refreshed by the socket heartbeat. Users without an open socket get Web Push for mentions, review requests and incidents.

### 6.8 Security and compliance

- OWASP ASVS baseline, WAF, per-tenant rate limits
- Secrets in a managed vault; no secrets in the repo
- Dependency and container scanning in CI
- Webhook signature verification (GitHub, Slack, Stripe)
- API tokens hashed at rest, scoped and revocable; agent tokens limited to named channels
- Audit log for admin, auth, integration, token, agent and billing events
- GDPR export/delete, DPA, subprocessor list
- Annual penetration test; SOC 2 Type I on the enterprise track
- Encryption in transit and at rest

---

## 7. Data model additions

Keep the current tables and add:

| Table | Purpose |
|---|---|
| `workspaces` (extend) | plan, billing customer, trial, data region, settings, logo |
| `workspace_members` (extend) | `admin`/`guest` roles, invite status, last active |
| `invites` | email, role, token hash, expiry, inviter |
| `api_tokens` | workspace, user or agent, name, scopes, allowed channels, hash, last used, expiry, revoked |
| `agents` | workspace, name, owner, avatar, token, allowed channels |
| `agent_runs` | agent, channel, thread root, status, summary, started/finished |
| `integrations` | provider, encrypted config, status, installed by |
| `repo_links` | workspace, channel, provider, repo full name, default branch |
| `pull_requests` | repo, number, title, state, author, checks, url, channel, thread root |
| `pr_comment_links` | message ↔ GitHub comment id, direction of origin, sync status |
| `check_failures` | PR/commit, check name, failing step, log excerpt, log url, flaky flag |
| `reviews` | PR, reviewer, state, requested at, completed at |
| `services` | name, owners (users/teams), repo, on-call, dashboard, runbook, health |
| `incidents` | title, severity, status, service, channel, external link, started/resolved |
| `incident_events` | incident, actor, kind, body, message ref, created at |
| `deploys` | service, environment, version, commit, actor, status, timings |
| `bridges` | workspace, Relay channel, Slack workspace + channel, direction, status |
| `bridge_links` | Relay message ↔ Slack message ts, origin |
| `push_subscriptions` | user, endpoint, keys, device, created at |
| `notifications` | user, workspace, kind, source, routed-by (owner/mention/rule), read at, digest batch |
| `saved_items` | user, message, note, created at |
| `pins` | channel, message, pinned by |
| `audit_logs` | workspace, actor, action, target, metadata, IP, user agent |
| `ai_jobs` | workspace, kind, input refs, status, model, token usage |

Extend `messages` with `metadata jsonb` (unfurls, cards, CI excerpts, stack-trace resolutions) and `kind` (`text`, `deploy`, `incident`, `decision`, `agent`, `system`). Decisions are messages with `kind = decision` and a status in metadata, found through a search filter, so there is no separate decisions table. Keep the plain-text body for search and notifications.

Extend `channels` with `kind` (`standard`, `repo`, `incident`, `deploy`, `service`) and optional `service_id`/`repo_link_id`.

---

## 8. API surface

### REST groups

- `/api/auth/*` — GitHub OAuth, magic link, sessions (MFA/SSO on the enterprise track)
- `/api/workspaces/*` — settings, members, invites, entitlements, audit, export
- `/api/channels/*` — existing chat plus pins, saved, read state
- `/api/messages/*` — existing plus reactions, permalink, metadata, convert-to-issue
- `/api/pulls/*` — list, review state, thread mapping, comment sync status
- `/api/services/*` — CRUD, owners, on-call, health
- `/api/incidents/*` — open, update, timeline, resolve
- `/api/deploys/*` — list, ingest from CI, release notes
- `/api/bridges/*` — Slack bridge setup, status, pause
- `/api/agents/*` — register, scope, list runs, revoke
- `/api/push/*` — subscribe, unsubscribe
- `/api/tokens/*` — create, list, revoke
- `/api/cli/*` — token-authenticated CLI endpoints
- `/api/ai/*` — catch-up, summarize, ask, jobs
- `/webhooks/github`, `/webhooks/slack`, `/webhooks/stripe` (GA)

### WebSocket events

Add the event types listed in §6.7. Keep client → server events small and typed. The first frame remains `auth`.

### API tokens

- Prefix tokens (`rly_…`) and store only a hash.
- Scopes: `read`, `post`, `search`, `admin:workspace`, `integration:github`, `agent`.
- Agent tokens are restricted to named channels and post as the agent identity.
- Per-token rate limits and last-used tracking.
- A token is owned by a user and scoped to a workspace.
- CLI and MCP use tokens, never session tokens.

---

## 9. Delivery plan

Estimates assume one experienced full-stack engineer; multiply for a team. Total: **30–44 weeks** for Phases 0–7, plus the enterprise track only when a buyer requires it. The sequence is wedge-first: foundation → GitHub wedge → only the chat parity partners ask for → ops → developer surfaces → AI → GA.

### Phase 0 — Design validation (now, 1 week)

**Goal:** make sure we build the right wedge before changing the architecture.

Deliverables:

- This plan and the clickable prototype
- 5–10 interviews with engineering managers and senior engineers
- A ranked problem list: which context switch hurts most?
- A pricing and packaging hypothesis
- A shortlist of 3 design partners (10–50 engineers, GitHub, Slack users)
- Success metrics and instrumentation plan
- A decision on desktop investment (see §13)

Exit criteria:

- At least 3 design partners say they would pilot the review inbox + PR threads
- The first release scope is agreed and written down
- We know which two integrations are non-negotiable (likely GitHub + Slack bridge/import)

---

### Phase 1 — Centralized foundation (3–5 weeks)

**Goal:** one real multi-tenant service that can safely host a design partner.

Scope:

- Managed Postgres, Redis, S3, email provider
- Workspace/tenant model, roles (`owner`, `admin`, `member`, `guest`), invites
- Auth: GitHub OAuth, magic link; session/device list and revoke
- Entitlements service and plan schema (plans assigned manually; no Stripe yet)
- Onboarding: create workspace → connect GitHub → invite team (suggested from GitHub org) → first channel
- Audit-log skeleton; tenant-isolation tests
- Observability: Sentry, OpenTelemetry traces, metrics, structured logs
- CI/CD, staging and production, migrations, backups, restore drill
- Remove the self-hosted framing from product copy and onboarding

Acceptance:

- A new team can sign up, create a workspace, invite a member and send a message in under 5 minutes
- A cross-workspace access test suite passes for every endpoint
- Every gated feature checks the entitlements service server-side
- File uploads go to S3 and render through signed URLs
- A staging restore from backup succeeds
- p95 API latency < 250 ms on the staging load test

---

### Phase 2 — Thin GitHub wedge (4–6 weeks)

**Goal:** the first “why Relay instead of Slack?” moment, as early as possible. This delivers the headline milestone in §14.

Scope:

- GitHub App install, repo selection, channel ↔ repo mapping
- PR unfurls and an auto-thread per PR in the mapped channel: checks, review state, files changed, labels; updates on push, review, merge, close
- **Two-way PR comment sync:** Relay thread replies post to GitHub; GitHub review comments appear in the thread; loop-safe and idempotent
- **Inline CI failure context:** failing step, log excerpt with a line link, “who broke main” on the default branch, flaky-test hint for checks that flip on re-run
- Review inbox: requested, authored, failing CI, stale, mentions
- Markdown and fenced code with syntax highlighting (the minimum for PR discussion to read well)

Acceptance:

- Installing the GitHub App and mapping `acme/payments` to `#payments` takes < 3 minutes
- Opening a PR creates a thread with a rich card; merging updates it
- A reply in Relay appears on the GitHub PR within 10 seconds, and the reverse also holds, with no duplicates
- A failed check shows the failing step and log excerpt in the thread without opening GitHub
- A requested review appears in the inbox within 10 seconds of the webhook

---

### Phase 3 — Chat essentials and Slack coexistence (5–7 weeks)

**Goal:** remove the reasons a dev team would reject Relay, and let them trial it **without leaving Slack**. Build only the parity items design partners actually raise; everything else waits.

Scope:

- Code-native messages: diffs, ANSI/log blocks, copy code, collapse long blocks, `path:line` → IDE deep link (web + Electron)
- **Stack trace resolution:** frames link to the repo file and line at the right commit, on GitHub or in the IDE
- Message permalinks, copy link, jump to message and highlight (search included)
- Activity inbox: mentions, replies, review requests, unread
- Drafts, pins, saved-for-later
- Notification rules: per-channel, keywords, DND, timezone
- **Web Push (PWA)** for mentions, review requests and, later, incidents
- Search filters: `in:`, `from:`, `has:file`, `has:code`, `is:thread`, `before:`, `after:`
- API tokens, incoming webhooks, slash-command framework
- CLI v0: `relay login`, `relay send`, `relay search`
- **Slack bridge:** two-way mirror of selected channels, with author attribution and loop protection; PR thread summaries can post back to a Slack channel
- Slack import: public channels, users, messages (DMs later)
- Message → GitHub issue with two-way status

Deferred until partners ask: custom workspace emoji, user groups, reminders, scheduled send, digest notification rules.

Acceptance:

- A code block can be copied and opened in VS Code from both web and desktop
- A pasted stack trace links each in-repo frame to the right file and line
- A message has a stable permalink and search lands on it
- A CI job can post a deploy message with a workspace token
- A bridged channel stays in sync with Slack for a week of pilot use with no duplicates or drops
- A Slack workspace can be imported with channel history intact
- A mention reaches a user’s phone via push when they have no Relay tab open

---

### Phase 4 — Engineering control room, lean (4–6 weeks)

**Goal:** own the moments where dev teams currently leave chat, by orchestrating existing tools rather than replacing them.

Scope:

- Service catalog: owners, repo, on-call (from PagerDuty), dashboard, runbook, health, recent deploys
- CODEOWNERS sync; `/service <name>`; “who owns this?”
- **Ownership-aware routing:** PR, check-failure and incident notifications go to owners from CODEOWNERS and the service catalog, not the whole channel
- Incident rooms: `/incident` creates a channel with severity, service, runbook, PagerDuty/Sentry link and a timeline built from flagged messages; push to owners and on-call
- Deploy board (read-only): environments and deploy events ingested from CI and the GitHub Action
- Release notes generated from merged PRs and deploy events
- Decisions: mark a message as a decision (`kind = decision`), with a `is:decision` search filter
- Weekly ship digest: shipped, decisions, incidents, open reviews

Acceptance:

- `/incident` creates a room with service, runbook and timeline in one action, and notifies owners by push
- A deploy from CI posts a deploy card and updates the environment board
- `/service payments-api` resolves owners, on-call, repo and recent deploys
- A failing check on `payments-api` notifies its owners, not everyone in the channel
- A weekly digest is generated without a bot or a manual doc
- A decision can be found by searching `is:decision` plus a keyword

---

### Phase 5 — Developer and agent surfaces (4–6 weeks)

**Goal:** become part of the developer’s daily tools, not another tab.

Scope:

- CLI v1: `relay send`, `search`, `ask`, `incident`, `deploy`, `tail`, `pr`, `review`, `login`
- MCP server: scoped read/post tools for Claude Code, Cursor and other agents
- **Agents as channel members:** agent identities, channel-scoped tokens, progress posted to a thread, human replies routed back to the agent, run history and revoke
- `relay` GitHub Action for CI notifications and deploy events
- Outgoing webhooks and a small set of native integrations (Sentry, PagerDuty)
- VS Code extension (share selection, open in IDE, mentions), only if CLI/MCP adoption justifies it

Acceptance:

- A developer can install the CLI, authenticate and post from a terminal in under 2 minutes
- An MCP client can read a channel and post a scoped update
- A coding agent posts progress into a thread, a human replies, and the agent receives the reply
- Revoking an agent token stops its posts immediately, and the revoke is audited
- A GitHub Action step posts a deploy card in under a minute of setup

---

### Phase 6 — AI (5–7 weeks)

**Goal:** make Relay the place teams ask questions.

Scope:

- AI catch-up, thread summaries, decision/action extraction, “ask the workspace”
- Error/log explanation (builds on CI failure context and stack trace resolution), release-note drafting, reply drafting
- Permission-aware retrieval, citations, prompt-injection defenses
- Bring-your-own provider key + model choice; no training on customer data
- AI usage budgets and workspace/channel opt-out

Acceptance:

- AI answers cite only messages the user can access
- A failed CI check gets a cited explanation that links to the log lines
- Usage stays within the workspace budget, and opt-out channels are never retrieved

---

### Phase 7 — GA and monetization (4–6 weeks)

**Goal:** turn the pilot product into a business.

Scope:

- Stripe Billing, Checkout and Customer Portal wired to the existing entitlements service; seat sync; 14-day trial
- Public pricing and self-serve signup
- Onboarding checklist and templates (#deploys, #incidents, service catalog)
- Docs, changelog, status page, support workflow
- Slack bridge and import at signup; “start with one bridged channel” migration path
- Marketing site and launch content
- Load test sized for the ICP: about 50 active workspaces, 2k concurrent WebSockets, 200 messages/sec burst
- Support SLO and incident-response process for Relay itself

Acceptance:

- A team can go from signup to a working PR thread and deploy channel without a call
- Stripe checkout and plan changes work in production
- Free → paid conversion is measurable
- Support response SLO is met for two consecutive months
- Uptime meets 99.9% for a month

---

### Enterprise track (demand-driven, run when a qualified buyer requires it)

Not scheduled. Each item starts only when a design partner or paying customer makes it a condition of purchase.

- TOTP MFA; SAML/OIDC SSO; SCIM
- Audit-log export in a documented format; retention policies
- Data residency (US/EU)
- SOC 2 Type I, DPA, subprocessor list, penetration test
- Larger load tests (10k concurrent WebSockets, 1k messages/sec)
- Google OAuth and email/password, if not already added on demand

---

## 10. Phase gates and metrics

| Gate | Metric | Target |
|---|---|---|
| Activation | Workspace created + GitHub connected + first PR thread + 3 active members in 7 days | 40% of signups |
| Habit | Weekly active seats / total seats | 60% by week 4 |
| Wedge adoption | Teams using review inbox weekly | 50% of active teams |
| Two-way value | PR thread replies that sync to GitHub, per active team per week | ≥ 10 |
| Coexistence | Pilot teams running a Slack bridge who move a second channel to Relay | 50% within 30 days |
| Developer surface | Teams with CLI, MCP or agent token | 25% of active teams |
| Retention | 90-day workspace retention | 85% |
| Monetization | Free → paid conversion | 5–8% |
| Quality | API p95 / WebSocket delivery p95 | < 250 ms / < 100 ms |
| Reliability | Monthly uptime | 99.9% |
| Security | Critical tenant-isolation bugs | 0 |

Instrument from Phase 1. Every feature ships with a product event. No dashboard, no launch.

### Kill criteria

Decide in advance what failure looks like, so the wedge is tested rather than defended:

- **After the Phase 2 pilot (30 days):** if fewer than 2 of 3 design partners use the review inbox or PR threads weekly, stop and re-interview before building Phase 3. Either the wedge changes (for example, incidents-first) or the plan does.
- **After Phase 3:** if no pilot team moves a second channel off Slack within 30 days of bridging, the coexistence path is not converting. Investigate before investing in Phase 4.
- **Before Phase 6:** if the activation metric is below 20% of signups, fix activation before adding AI.

---

## 11. What changes in this repo

| Current | Change |
|---|---|
| `README.md` self-hosted story | Rewrite for hosted product; keep local dev instructions |
| PGlite default | Keep for local dev/tests; production requires Postgres |
| Local-disk `FILES_DIR` | Add S3 driver behind the existing `FileStore` interface |
| `workspaces` | Extend with plan/billing/region/settings; keep as tenant |
| `workspace_members` | Add `admin` and `guest`; invites move to email |
| Auth routes | Add GitHub OAuth, magic link and email reset; MFA later |
| `Huddles` in-memory mesh | Keep as a small-team beta; no SFU work planned |
| Desktop cert pinning | Recent commits invested here. Decide in Phase 0: keep for dev/self-signed staging only, or pause desktop work entirely until web-first is proven |
| Recovery-code reset | Keep as fallback; email reset becomes primary |
| Rate limits | Move to Redis in production; add per-workspace quotas |
| File URLs | Keep HMAC signing; move storage to S3/CDN |
| `apps/web` | Becomes the primary product (including PWA push); desktop loads the hosted URL |
| `packages/relay-chat` | Publish a CLI/SDK package instead of a server installer |

Do not rewrite the chat domain model. The current schema and routes are a good base. The main work is tenancy, auth, infrastructure and the new dev surfaces.

---

## 12. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Slack network effects | Teams won’t leave their history and habits | Slack bridge so teams trial one channel without leaving Slack; Slack import; GitHub login |
| Feature sprawl | A small team cannot out-build Slack | Explicit out-of-scope list (§5); parity items only when partners ask; kill criteria (§10) |
| Wedge doesn’t land | Months of work on the wrong problem | GitHub wedge moved to Phase 2; 30-day kill criterion before further investment |
| GitHub dependency | Repo features are the wedge | Abstract provider interface; GitLab next |
| Sync correctness | Duplicated or lost comments destroy trust in two-way sync and the bridge | Origin tracking on every mirrored item, idempotency keys, a reconciliation job, visible sync status |
| AI trust and cost | Bad summaries or data leaks kill adoption | Citations, scoped retrieval, opt-in, BYO key, budgets |
| Incident and deploy scope creep | PagerDuty, incident.io and CD tools are deep | Orchestrate and link; no roles, paging, locks or approvals |
| Multi-tenant data leak | Existential | Tenant-isolation tests, RLS defense, pen test, audit |
| Agent misuse | Agents with tokens can spam or leak | Channel-scoped agent tokens, rate limits, audited runs, instant revoke |
| Pricing resistance | Dev tools are scrutinized | Free tier, per-seat Team, AI add-on; prove review-inbox value before Stripe |
| Notification overload | The product becomes another firehose | Ownership-aware routing, focus mode, digests |
| On-call blind spots | Incident rooms are useless if alerts don’t reach phones | Web Push in Phase 3, before incident rooms ship |
| Integration security | Webhooks and tokens are attack surface | Scoped tokens, signature verification, allowlists, audit |

---

## 13. Open questions

1. **Free plan:** 10 seats and 90-day history, or unlimited seats with paid integrations? Validate with design partners.
2. **AI provider:** hosted default + BYO key, or BYO only at launch? Start with hosted for activation, add BYO for trust.
3. **Data region:** US-only at launch, or US + EU? EU is a sales requirement for some teams; it sits on the enterprise track until a buyer requires it.
4. **GitLab:** launch with GitHub only, or GitHub + GitLab? GitHub first; design the provider abstraction now.
5. **Desktop:** is the Electron app required at launch? Web-first, with PWA push. Recent work went into desktop install and certificate pinning: decide in Phase 0 whether desktop work pauses until the web wedge is proven.
6. **Huddles:** keep the existing mesh as a small-team beta; no SFU. Revisit only if partners ask repeatedly.
7. **Slack import depth:** public channels + messages first; DMs and files later.
8. **Slack bridge limits:** which Slack plan features (threads, reactions, files) must the bridge carry for a credible trial?
9. **Agent identities:** do agents count as seats for billing?
10. **Pricing:** $10/seat Team and $18/seat Business — test with 10 interviews.

---

## 14. Immediate next steps

1. Review the prototype in `design/prototype/` and mark Build / Later / Cut in its Roadmap view.
2. Run 8–10 problem interviews with the [interview guide](./docs/interview-guide.md); answer the ranked questions in the [research plan](./docs/research-plan.md).
3. Settle the Phase 1–2 entries in [open decisions](./docs/open-decisions.md) (desktop, auth, GitHub-only, comment attribution) and lock the Phase 1 + Phase 2 scope.
4. Run spikes S1, S2 and S4 from [technical spikes](./docs/technical-spikes.md): GitHub sync, the Slack bridge's terms and rate limits, tenancy.
5. Stand up staging infrastructure (Postgres, Redis, S3, email, Sentry) and the events in [metrics](./docs/metrics.md).
6. Implement the tenant model, GitHub OAuth, magic link and invites before any new chat feature.
7. Build the Phase 2 GitHub wedge (PR threads with two-way comment sync) as the first visible proof.
8. Recruit 3 design partners and run the 30-day pilot from the [pilot playbook](./docs/pilot-playbook.md), judged against the kill criteria in §10.

The first visible milestone, about 10 weeks in, should be: **a design partner can sign up with GitHub, invite their team, see a real PR become a thread in `#payments`, and reply there to have it land on GitHub.** Everything before that is plumbing; everything after it is the product.
