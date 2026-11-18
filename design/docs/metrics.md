# Metrics and instrumentation

PLAN.md §10 says every feature ships with a product event, and nothing ships without one. This doc lists the events, how each gate metric is computed from them, and when each must exist.

---

## Principles

- **Event names are `object.verb` in the past tense**, for example `pr_thread.reply_synced`.
- Every event carries `workspace_id`, `user_id` (or `agent_id`), `occurred_at` and `source` (`web`, `desktop`, `cli`, `mcp`, `slack`, `github`).
- **No message content in analytics events.** Use ids and counts only.
- Events are written server-side wherever possible, because client events get blocked or lost.
- Analytics are separate from the audit log. Audit records security-relevant actions; analytics records product usage. Some actions emit both.

## Events by phase

### Phase 1 (foundation)

| Event | When |
|---|---|
| `workspace.created` | Signup completes |
| `user.signed_in` | Any sign-in; property `method` (`github`, `magic_link`) |
| `invite.sent` / `invite.accepted` | |
| `github.connected` | GitHub App installed |
| `message.sent` | Property `channel_kind`, `has_code`, `source` |

### Phase 2 (GitHub wedge)

| Event | When |
|---|---|
| `repo.mapped` | Repo ↔ channel mapping created |
| `pr_thread.created` | First card for a PR posted |
| `pr_thread.reply_synced` | Property `direction` (`relay_to_github`, `github_to_relay`) |
| `pr_thread.sync_failed` | With `reason` |
| `ci_failure.shown` / `ci_failure.log_opened` / `ci_failure.explained` | |
| `review_inbox.viewed` / `review_inbox.item_opened` | |
| `slack_notification.posted` | Property `kind` (`pr_thread`, `review_requested`, `check_failed`, `mention`, plus `incident` from Phase 4), `slack_channel_id` |

### Phase 3 (essentials and coexistence)

| Event | When |
|---|---|
| `slack_import.started` / `slack_import.completed` / `slack_import.failed` | Counts of channels, users and messages; property `rerun` |
| `push.subscribed` / `push.delivered` / `push.opened` | |
| `ide_link.opened` / `stack_frame.opened` | |
| `token.created` / `cli.command_run` | |

### Phase 4–6

`service.viewed`, `notification.routed` (property `routed_by`: `codeowners`, `service`, `mention`, `rule`), `incident.created`, `message.flagged`, `decision.marked`, `digest.generated`, `agent.run_started`, `agent.reply_delivered`, `agent.revoked`, `ai.catch_up_used`, `ai.citation_opened`.

## Gate metrics

Targets are green/amber/red bands in [PLAN.md §10](../PLAN.md); this table only defines how each one is computed.

| Gate (PLAN.md §10) | Computed as |
|---|---|
| Activation (≥ 40%) | Workspaces with `github.connected` + `pr_thread.created` + 3 distinct users with `message.sent`, within 7 days of `workspace.created` |
| Habit (≥ 60% by week 4) | Distinct users with a *write* event in week N ÷ activated seats. Invite-everyone inflates the denominator, so read it next to read-only usage, which is the warning signal. |
| Wedge adoption (≥ 50%) | Active teams with ≥ 1 `review_inbox.item_opened` in the week |
| Two-way value (≥ 10/week) | `pr_thread.reply_synced` where `direction = relay_to_github`, per active team per week, read as a 3-week trend |
| Coexistence (4 weeks) | Teams with one Relay channel active (≥ 20 messages from ≥ 3 users) for 4 consecutive weeks while still using Slack |
| Developer surface (≥ 25%) | Active teams with `cli.command_run` or an agent/MCP token used in the last 30 days |
| Retention (≥ 85% at 90 days) | Workspaces active in week 13 ÷ workspaces created 13 weeks earlier |

Review triggers read directly from the wedge, two-way and coexistence rows. A gate is acted on only after two or three consecutive weeks move the same way; one week is noise at this sample size.

## Quality signals to watch alongside

- `pr_thread.sync_failed` ÷ `pr_thread.reply_synced`: target < 0.5%. Trust in sync dies fast.
- Duplicate or dropped messages found by the GitHub reconciliation job, or by a repeated Slack import: target 0.
- Time from `pr_thread.created` to the first `relay_to_github` reply. This is the leading indicator for two-way value: a team that never replies in week 1 rarely starts in week 4.
- `slack_notification.posted` against the events that should have notified. Gaps mean the loop is invisible, and a muted channel shows up next week as fewer `review_inbox.item_opened`. Mutes themselves are invisible in analytics — ask in the weekly check-in.
- Push delivery p95 and open rate for incident pushes.
- `ai.citation_opened` ÷ `ai.catch_up_used`: low means people don’t trust the summary, or don’t need to check it. Interview to find out which.

## Tooling

Start simple: events in a Postgres table (or a product-analytics tool with EU hosting available), one SQL view per gate metric, and a weekly review. Decide on the vendor in Phase 1; don’t build a dashboard product.
