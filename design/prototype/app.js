(function () {
  'use strict';

  const people = {
    maya: { name: 'Maya Chen', initials: 'MC', tone: 'coral', role: 'Design' },
    jonas: { name: 'Jonas Berg', initials: 'JB', tone: 'blue', role: 'Platform' },
    priya: { name: 'Priya Nair', initials: 'PN', tone: 'violet', role: 'Infrastructure' },
    sam: { name: 'Sam Okafor', initials: 'SO', tone: 'amber', role: 'Product' },
    dana: { name: 'Dana Lee', initials: 'DL', tone: 'blue', role: 'Design contractor' },
    claude: { name: 'Claude Code', initials: 'CC', tone: 'teal', role: 'Agent', agent: true },
    alex: { name: 'Alex Rivera', initials: 'AR', tone: 'teal', role: 'You' }
  };

  const sourceIcons = {
    github: { icon: 'github', fill: true },
    slack: { icon: 'slack', fill: false },
    relay: { icon: 'chat', fill: false },
    alert: { icon: 'alert', fill: false },
    clock: { icon: 'clock', fill: false },
    bell: { icon: 'bell', fill: false },
    bot: { icon: 'bot', fill: false }
  };

  // Plan v2 (design/PLAN.md §9). Every feature can point at the place the prototype shows it.
  const phases = [
    { id: 'p0', label: 'Phase 0', title: 'Design validation', weeks: '1 week', goal: 'Make sure we build the right wedge before changing the architecture.' },
    { id: 'p1', label: 'Phase 1', title: 'Centralized foundation', weeks: '3–5 weeks', goal: 'One real multi-tenant service that can safely host a design partner.' },
    { id: 'p2', label: 'Phase 2', title: 'Thin GitHub wedge', weeks: '4–6 weeks', goal: 'The first “why Relay instead of Slack?” moment, about 10 weeks in.', milestone: true },
    { id: 'p3', label: 'Phase 3', title: 'Chat essentials and Slack coexistence', weeks: '5–7 weeks', goal: 'Remove reasons to reject Relay, and let teams trial it without leaving Slack.' },
    { id: 'p4', label: 'Phase 4', title: 'Engineering control room, lean', weeks: '4–6 weeks', goal: 'Own the moments teams leave chat, by orchestrating existing tools rather than replacing them.' },
    { id: 'p5', label: 'Phase 5', title: 'Developer and agent surfaces', weeks: '4–6 weeks', goal: 'Become part of the developer’s daily tools, not another tab.' },
    { id: 'p6', label: 'Phase 6', title: 'AI', weeks: '5–7 weeks', goal: 'Make Relay the place teams ask questions, with citations and controls.' },
    { id: 'p7', label: 'Phase 7', title: 'GA and monetization', weeks: '4–6 weeks', goal: 'Turn the pilot product into a business.' },
    { id: 'ent', label: 'Enterprise track', title: 'Demand-driven', weeks: 'When a buyer requires it', goal: 'Each item starts only when a design partner or customer makes it a condition of purchase.' },
    { id: 'later', label: 'Later', title: 'After GA or on demand', weeks: 'Unscheduled', goal: 'Worth doing, but not in the first 12 months.' },
    { id: 'out', label: 'Out of scope', title: 'Cut in plan v2', weeks: '—', goal: 'Listed so you can overrule a cut deliberately.' }
  ];

  const features = [
    { id: 'interviews', phase: 'p0', title: 'Problem interviews and 3 design partners', desc: '5–10 interviews, a ranked problem list and a 30-day pilot agreement.' },
    { id: 'kill-criteria', phase: 'p0', title: 'Kill criteria agreed up front', desc: 'Stop and re-interview if fewer than 2 of 3 partners use PR threads weekly.', route: '#/roadmap', target: 'kill-criteria' },
    { id: 'gh-login', phase: 'p1', title: 'GitHub sign-in and magic links', desc: 'GitHub OAuth first; Google and passwords only on request.' },
    { id: 'tenancy', phase: 'p1', title: 'Workspaces, roles and invites', desc: 'Owner, admin, member and guest; invites suggested from the GitHub org.' },
    { id: 'entitlements', phase: 'p1', title: 'Entitlements service', desc: 'Every gated feature checks it server-side; plans assigned manually until GA.', route: '#/settings/plan' },
    { id: 'infra', phase: 'p1', title: 'Postgres, Redis, S3, observability, backups', desc: 'Stateless app instances, a restore drill and p95 under 250 ms.' },
    { id: 'isolation-tests', phase: 'p1', title: 'Tenant-isolation test suite', desc: 'Every endpoint is attacked cross-workspace in CI.' },
    { id: 'pr-threads', phase: 'p2', title: 'PR threads with rich cards', desc: 'A PR becomes a thread in the mapped channel and updates on push, review and merge.', route: '#/chat/payments' },
    { id: 'pr-sync', phase: 'p2', title: 'Two-way PR comment sync', desc: 'Reply in Relay and it lands on the GitHub review; GitHub comments appear in the thread.', route: '#/chat/payments' },
    { id: 'ci-context', phase: 'p2', title: 'Inline CI failure context', desc: 'Failing step, log excerpt, “who broke main” and a flaky-test hint in the thread.', route: '#/chat/payments' },
    { id: 'review-inbox', phase: 'p2', title: 'Review inbox', desc: 'Requested, authored, failing CI and stale reviews in one queue.', route: '#/inbox' },
    { id: 'code-blocks', phase: 'p2', title: 'Markdown and highlighted code', desc: 'The minimum for PR discussion to read well.', route: '#/chat/payments' },
    { id: 'ide-links', phase: 'p3', title: 'path:line → IDE deep links', desc: 'Open a file at the right line in VS Code, Cursor or JetBrains via URL schemes.', route: '#/chat/payments' },
    { id: 'stack-traces', phase: 'p3', title: 'Stack trace resolution', desc: 'Each in-repo frame links to the file and line at the deployed commit.', route: '#/chat/inc-042' },
    { id: 'permalinks', phase: 'p3', title: 'Permalinks and jump to message', desc: 'Stable message links that open the channel and highlight the message.', route: '#/chat/payments' },
    { id: 'msg-to-issue', phase: 'p3', title: 'Message → GitHub issue', desc: 'Turn a message into an issue and show its state back in the thread.', route: '#/chat/payments' },
    { id: 'activity-inbox', phase: 'p3', title: 'Activity inbox', desc: 'Mentions and replies beside reviews.', route: '#/inbox' },
    { id: 'push', phase: 'p3', title: 'Web Push (PWA)', desc: 'Mentions, review requests and incidents reach your phone, before incident rooms ship.', route: '#/settings/notifications' },
    { id: 'notif-rules', phase: 'p3', title: 'Notification rules', desc: 'Per-channel rules, keywords, Do Not Disturb and timezone.', route: '#/settings/notifications' },
    { id: 'search-filters', phase: 'p3', title: 'Search filters', desc: 'in:, from:, has:code, is:thread, is:decision, before:, after:.' },
    { id: 'tokens-webhooks', phase: 'p3', title: 'API tokens and incoming webhooks', desc: 'Scoped, hashed, revocable tokens; post from CI with one curl.', route: '#/settings/developers' },
    { id: 'slash-commands', phase: 'p3', title: 'Slash-command framework', desc: '/service, /incident and friends from the composer.', route: '#/chat/payments' },
    { id: 'cli-v0', phase: 'p3', title: 'CLI v0', desc: 'relay login, send and search.', route: '#/settings/developers' },
    { id: 'slack-bridge', phase: 'p3', title: 'Slack bridge', desc: 'Two-way mirror of selected channels so a team can trial Relay without leaving Slack.', route: '#/chat/design' },
    { id: 'slack-import', phase: 'p3', title: 'Slack import', desc: 'Public channels, users and history.', route: '#/settings/integrations' },
    { id: 'service-catalog', phase: 'p4', title: 'Service catalog with CODEOWNERS sync', desc: 'Owners, on-call, repo, runbook, health and recent deploys per service.', route: '#/status/services' },
    { id: 'owner-routing', phase: 'p4', title: 'Ownership-aware routing', desc: 'PR, check-failure and incident notifications go to owners, not whole channels.', route: '#/inbox' },
    { id: 'incident-rooms', phase: 'p4', title: 'Lightweight incident rooms', desc: '/incident opens a room with runbook, PagerDuty link and a timeline built from flagged messages.', route: '#/chat/inc-042' },
    { id: 'deploy-board', phase: 'p4', title: 'Read-only deploy board', desc: 'Environments and deploy events ingested from CI. No locks or approvals.', route: '#/status/deployments' },
    { id: 'release-notes', phase: 'p4', title: 'Release notes from merged PRs', desc: 'Drafted from merged PRs and deploy events.', route: '#/library/release-notes-215' },
    { id: 'decisions', phase: 'p4', title: 'Decisions as messages', desc: 'Mark a message as a decision; find it with is:decision. No separate subsystem.', route: '#/chat/payments' },
    { id: 'digest', phase: 'p4', title: 'Weekly ship digest', desc: 'Shipped, decisions, incidents and open reviews, generated without a bot.', route: '#/chat/releases' },
    { id: 'cli-v1', phase: 'p5', title: 'CLI v1', desc: 'ask, incident, deploy, tail, pr and review from the terminal.', route: '#/settings/developers' },
    { id: 'mcp', phase: 'p5', title: 'MCP server', desc: 'Scoped read/post tools for Claude Code, Cursor and other agents.', route: '#/settings/developers' },
    { id: 'agents', phase: 'p5', title: 'Agents as channel members', desc: 'Agents post progress into a thread; humans reply and the agent receives it.', route: '#/chat/payments' },
    { id: 'gh-action', phase: 'p5', title: 'relay GitHub Action', desc: 'CI notifications and deploy events in a minute of setup.', route: '#/status/deployments' },
    { id: 'native-integrations', phase: 'p5', title: 'Sentry and PagerDuty integrations', desc: 'On-call context and errors that link into stack-trace resolution.', route: '#/settings/integrations' },
    { id: 'vscode', phase: 'p5', title: 'VS Code extension', desc: 'Only if CLI and MCP adoption justifies it.', default: 'later' },
    { id: 'ai-catchup', phase: 'p6', title: 'Catch-up and thread summaries', desc: 'Every claim cites a message you can access.', route: '#/chat/payments' },
    { id: 'ai-explain', phase: 'p6', title: 'Explain a CI failure or error', desc: 'Builds on CI context and stack-trace resolution, with citations.', route: '#/chat/payments' },
    { id: 'ai-ask', phase: 'p6', title: 'Ask the workspace', desc: 'Permission-aware retrieval with prompt-injection defenses.' },
    { id: 'ai-controls', phase: 'p6', title: 'BYO key, budgets and opt-out', desc: 'Model choice, spend limits and channels AI never reads.', route: '#/settings/plan' },
    { id: 'stripe', phase: 'p7', title: 'Stripe billing and self-serve signup', desc: 'Wired to the entitlements service that already exists.', route: '#/settings/plan' },
    { id: 'onboarding', phase: 'p7', title: 'Onboarding checklist and templates', desc: 'Signup to a working PR thread and deploy channel without a call.' },
    { id: 'status-docs', phase: 'p7', title: 'Docs, changelog and status page', desc: 'Plus a support SLO and incident process for Relay itself.' },
    { id: 'load-test', phase: 'p7', title: 'ICP-sized load test', desc: '~50 workspaces, 2k sockets, 200 messages/sec burst.' },
    { id: 'mfa-sso', phase: 'ent', title: 'MFA, SAML/OIDC SSO and SCIM', desc: 'Start when a qualified buyer requires it.' },
    { id: 'audit-export', phase: 'ent', title: 'Audit-log export and retention policies', desc: 'Documented export format.' },
    { id: 'residency', phase: 'ent', title: 'Data residency (US/EU)', desc: 'A sales requirement for some EU teams.' },
    { id: 'soc2', phase: 'ent', title: 'SOC 2 Type I and pen test', desc: 'With DPA and subprocessor list.' },
    { id: 'big-load', phase: 'ent', title: '10k-socket load test', desc: '1k messages/sec burst.' },
    { id: 'gitlab', phase: 'later', title: 'GitLab, Bitbucket and Linear', desc: 'The provider abstraction is designed now; GitHub ships first.' },
    { id: 'workflow-engine', phase: 'later', title: 'Repo-versioned workflow engine', desc: '.relay/workflows.yml, only if Actions and webhooks hit limits.' },
    { id: 'native-mobile', phase: 'later', title: 'Native mobile apps', desc: 'PWA push covers the on-call need first.' },
    { id: 'shared-channels', phase: 'later', title: 'Shared channels with other orgs', desc: 'Slack Connect equivalent for vendors and contractors.' },
    { id: 'incident-roles', phase: 'out', title: 'Incident roles and postmortem tooling', desc: 'incident.io territory. Integrate instead.' },
    { id: 'deploy-locks', phase: 'out', title: 'Deploy locks, approvals and rollbacks', desc: 'GitHub Environments and Argo already do this.' },
    { id: 'livekit', phase: 'out', title: 'Production huddles (LiveKit, recording)', desc: 'The mesh stays a small-team beta; unfurl Meet/Zoom links.' },
    { id: 'standups', phase: 'out', title: 'Async standups', desc: 'Geekbot already does this.' },
    { id: 'tasks', phase: 'out', title: 'Thread task tracking', desc: 'Linear already does this.' },
    { id: 'code-index', phase: 'out', title: 'Repository code indexing', desc: 'Sourcegraph territory; search code in messages only.' },
    { id: 'snippet-vars', phase: 'out', title: 'Snippet library with variables', desc: 'Niche; code blocks in messages cover it.' },
    { id: 'jetbrains', phase: 'out', title: 'JetBrains extension', desc: 'IDE deep links cover JetBrains without an extension.' }
  ];

  const featureById = Object.fromEntries(features.map((feature) => [feature.id, feature]));
  const phaseById = Object.fromEntries(phases.map((phase) => [phase.id, phase]));

  function defaultDecision(feature) {
    if (feature.default) return feature.default;
    if (feature.phase === 'out') return 'cut';
    if (feature.phase === 'ent' || feature.phase === 'later') return 'later';
    return 'build';
  }

  const channels = {
    payments: {
      name: 'payments',
      kind: 'repo',
      description: 'Checkout and payments work. Pull requests from acme/checkout become threads here.',
      members: 24,
      avatars: ['maya', 'jonas', 'priya', 'sam'],
      context: [
        { icon: 'github', label: 'acme/checkout', note: 'PR threads on', feature: 'pr-threads' },
        { icon: 'server', label: 'checkout-api', note: 'owned by Payments', href: '#/status/services', feature: 'service-catalog' },
        { icon: 'bot', label: 'Claude Code', note: 'agent member', href: '#/settings/developers', feature: 'agents' }
      ],
      catchUp: [
        { text: 'PR #1284 (Apple Pay) has one approval and is waiting on your review; the wallet row stays behind the flag until #1286 ships.', cite: 'm1' },
        { text: 'main is red since 1d90be7: the dedupe test fails 3 of 3 runs, so it is not flaky.', cite: 'm3' },
        { text: 'Claude Code is opening a fix PR; Jonas asked it to add a regression test.', cite: 'm4' },
        { text: 'Decision: webhook processing moves off the request path.', cite: 'm5' }
      ],
      messages: [
        {
          id: 'm1',
          type: 'message',
          person: 'maya',
          time: '9:42 AM',
          html: '<p>Apple Pay is ready for a final pass. The only open question is whether the wallet row stays behind the experiment flag for another week.</p>',
          attachment: {
            type: 'pull',
            repo: 'acme/checkout',
            number: '#1284',
            state: 'Open',
            title: 'Add Apple Pay to checkout',
            stats: '+412 −87',
            check: '3/3 checks passed',
            reviews: '1 approval · your review requested',
            branch: 'feat/apple-pay',
            time: 'opened 2h ago',
            thread: [
              { person: 'jonas', origin: 'github', time: '9:50 AM', file: 'apps/checkout/src/wallet/Row.tsx:42', text: 'Can we keep this behind the flag until the retry fix lands?' },
              { person: 'maya', origin: 'relay', status: 'synced', time: '9:53 AM', text: 'Yes. The flag stays on until #1286 ships.' }
            ]
          }
        },
        {
          id: 'm2',
          type: 'message',
          person: 'jonas',
          time: '9:58 AM',
          features: 'code-blocks ide-links',
          html: '<p>Found why retries arrive twice. Reproduced locally:</p><div class="code-block"><pre><code>POST /webhooks/payments  200  38ms\nPOST /webhooks/payments  200  41ms  ← duplicate event</code></pre><button class="copy-code" type="button">Copy</button></div><p>The dedupe check is in <button class="path-link" type="button" data-path="apps/api/src/webhooks/dedupe.ts:31">apps/api/src/webhooks/dedupe.ts:31</button>. Pushing a fix now.</p>'
        },
        {
          id: 'e1',
          type: 'event',
          source: 'github',
          time: '10:01 AM',
          html: 'Jonas Berg pushed <strong>1d90be7</strong> to <strong>main</strong> · Dedupe provider events'
        },
        {
          id: 'm3',
          type: 'ci',
          time: '10:03 AM',
          attachment: {
            repo: 'acme/checkout',
            check: 'test (node 22)',
            title: 'Dedupe provider events · 1d90be7',
            step: 'Run vitest',
            brokeMain: 'since <code>1d90be7</code> by Jonas Berg',
            flaky: 'Failed 3 of 3 re-runs, so this is not flaky',
            line: 212,
            log: [
              { n: 208, text: ' ✓ webhooks/signature.test.ts (6 tests) 41ms' },
              { n: 209, text: ' ❯ webhooks/dedupe.test.ts (4 tests | 1 failed) 63ms' },
              { n: 210, text: '   × ignores a retried event with the same provider id' },
              { n: 211, text: '' },
              { n: 212, text: 'AssertionError: expected 2 "order.paid" events to equal 1', fail: true },
              { n: 213, text: ' ❯ apps/api/src/webhooks/dedupe.test.ts:58:31' }
            ],
            routedTo: 'Jonas Berg, Alex Rivera',
            routedPath: 'apps/api/src/webhooks/',
            explain: {
              text: 'The test expects one <code>order.paid</code> event but receives two. In <code>dedupe.ts</code> the provider event id is lower-cased <em>after</em> the lookup, so a retry whose id differs only in case passes the duplicate check. The change came in with 1d90be7.',
              cites: [
                { label: 'log line 212', mock: 'log line 212 in GitHub Actions' },
                { label: 'dedupe.ts:31', path: 'apps/api/src/webhooks/dedupe.ts:31' },
                { label: 'commit 1d90be7', mock: 'commit 1d90be7 on GitHub' }
              ]
            }
          }
        },
        {
          id: 'm4',
          type: 'message',
          person: 'claude',
          time: '10:06 AM',
          html: '<p>Picked up the failing dedupe test on <strong>main</strong>. I’ll post progress here.</p>',
          attachment: {
            type: 'agent',
            task: 'Fix failing dedupe test on main',
            status: 'Running',
            steps: [
              { state: 'done', text: 'Reproduced the failure locally' },
              { state: 'done', text: 'Cause: event id normalized after the duplicate lookup' },
              { state: 'active', text: 'Opening PR #1291 with the fix and a regression test' },
              { state: 'pending', text: 'Waiting for review from code owners' }
            ],
            scope: 'Token scoped to #payments · started by Jonas Berg'
          }
        },
        {
          id: 'm4b',
          type: 'message',
          person: 'jonas',
          time: '10:08 AM',
          replyTo: 'Claude Code',
          html: '<p>Also cover the mixed-case retry in the regression test, please.</p>'
        },
        {
          id: 'm5',
          type: 'message',
          person: 'priya',
          time: '10:12 AM',
          decision: { by: 'Priya Nair', doc: 'event-webhooks' },
          html: '<p>Decision: webhook acceptance and processing become separate steps. We verify, enqueue, return 202, and a worker processes with the provider event id as the idempotency key.</p>',
          attachment: { type: 'doc', docId: 'event-webhooks' }
        },
        {
          id: 'm6',
          type: 'message',
          person: 'sam',
          time: '10:20 AM',
          html: '<p>Shipping plan is in the release checklist. Targeting <strong>2.14.2</strong> once main is green.</p>',
          attachment: { type: 'doc', docId: 'release-checklist' }
        }
      ]
    },
    releases: {
      name: 'releases',
      kind: 'standard',
      description: 'Deploys and release notes, posted by the relay GitHub Action.',
      members: 31,
      avatars: ['sam', 'priya', 'maya'],
      context: [
        { icon: 'github', label: 'relay GitHub Action', note: 'posts deploys', href: '#/status/deployments', feature: 'gh-action' }
      ],
      catchUp: [
        { text: 'v2.14.1 is in production and stable after a clean canary.', cite: 'r5' },
        { text: 'Sam asked you to sanity-check the v2.15 notes.', cite: 'r2' },
        { text: 'This week: 7 PRs shipped, 2 decisions, 1 incident.', cite: 'r7' }
      ],
      messages: [
        { id: 'r1', type: 'event', source: 'github', time: '10:22 AM', features: 'gh-action', html: 'Deployed <strong>v2.15.0-rc.2</strong> to staging from <strong>main</strong> · all checks passed' },
        { id: 'r2', type: 'message', person: 'sam', time: '10:28 AM', features: 'release-notes', html: '<p>@Alex Rivera can you sanity-check the 2.15 notes? They were drafted from the merged PRs; Apple Pay stays marked experimental.</p>', attachment: { type: 'doc', docId: 'release-notes-215' } },
        { id: 'r3', type: 'message', person: 'priya', time: '10:35 AM', html: '<p>Canary is clean after 30 minutes. Error rate and p95 are unchanged from baseline.</p>' },
        { id: 'r4', type: 'event', source: 'github', time: '10:40 AM', html: 'Workflow <strong>deploy.yml</strong> passed on <strong>acme/platform</strong> · 3m 08s' },
        { id: 'r5', type: 'event', source: 'github', time: '11:02 AM', html: 'Deployed <strong>v2.14.1</strong> to production · rollout completed in 4m 12s' },
        { id: 'r6', type: 'message', person: 'priya', time: '11:08 AM', html: '<p>Production is stable. I’ll keep an eye on the error budget for the next hour, then close the release.</p>' },
        {
          id: 'r7',
          type: 'digest',
          time: 'Fri 5:00 PM',
          attachment: {
            range: 'Oct 20 – 26',
            stats: [
              { label: 'PRs shipped', value: '7' },
              { label: 'Decisions', value: '2' },
              { label: 'Incidents', value: '1' },
              { label: 'Open reviews', value: '3' }
            ],
            highlights: [
              'Retry webhook delivery shipped in v2.14.1',
              'Decided: event-driven webhooks; proposed: split billing from checkout',
              'INC-042 · checkout 5xx, mitigated in 19 min'
            ]
          }
        }
      ]
    },
    design: {
      name: 'design',
      kind: 'bridged',
      description: 'Design critiques and the decisions behind them. Bridged with Slack while the team trials Relay.',
      members: 16,
      avatars: ['maya', 'dana', 'sam'],
      context: [
        { icon: 'slack', label: 'Slack #design', note: 'two-way bridge · in sync', href: '#/settings/integrations', feature: 'slack-bridge' }
      ],
      composerNote: 'Messages here are also posted to Slack #design.',
      messages: [
        { id: 'd1', type: 'message', person: 'maya', time: '9:18 AM', html: '<p>Posted the checkout redesign exploration. Two directions: wallet-first, or split wallet and card panels. I lean split.</p>', attachment: { type: 'doc', docId: 'checkout-redesign' } },
        { id: 'd2', type: 'message', person: 'dana', via: 'slack', time: '9:26 AM', html: '<p>Split feels calmer. Can you add the empty and error states before Thursday?</p>' },
        { id: 'd3', type: 'message', person: 'maya', time: '9:31 AM', html: '<p>Already in the doc. I’ll bring the mobile version too.</p>' },
        { id: 'd4', type: 'event', source: 'clock', time: '9:35 AM', html: 'Design review moved to <strong>Thursday, 10:00</strong> · 45 min' },
        { id: 'd5', type: 'message', person: 'sam', via: 'slack', time: '9:42 AM', html: '<p>Please keep the dev-only card form visible in the prototype. It makes the empty state obvious.</p>' },
        { id: 'd6', type: 'message', person: 'maya', time: '9:45 AM', html: '<p>Will do. The mobile navigation notes are next to it.</p>', attachment: { type: 'doc', docId: 'mobile-nav' } }
      ]
    },
    'inc-042': {
      name: 'inc-042',
      kind: 'incident',
      description: 'Elevated 5xx errors on checkout · SEV 1 · Monitoring. Opened with /incident.',
      members: 9,
      avatars: ['priya', 'jonas', 'maya'],
      context: [
        { icon: 'alert', label: 'SEV 1 · Monitoring', tone: 'danger', feature: 'incident-rooms' },
        { icon: 'server', label: 'checkout-api', note: 'owners notified', href: '#/status/services', feature: 'owner-routing' },
        { icon: 'bell', label: 'PagerDuty', note: 'Priya on call', mock: 'PagerDuty incident #P8K2', feature: 'native-integrations' },
        { icon: 'doc', label: 'Runbook', note: 'On-call handbook', doc: 'on-call-handbook' },
        { icon: 'pin', label: 'Timeline', note: '4 flagged', href: '#/status/incidents' }
      ],
      catchUp: [
        { text: 'Provider timeouts caused a retry storm; 5xx peaked at 4.8% in us-east-1.', cite: 'i2' },
        { text: 'The trace points at retryDelivery in retry.ts:88 on the deployed commit.', cite: 'i4' },
        { text: 'Circuit breaker is out; error rate is below 0.2% and the room is monitoring.', cite: 'i6' }
      ],
      messages: [
        { id: 'i1', type: 'event', source: 'alert', time: '7:12 AM', flagged: true, html: 'Opened <strong>INC-042</strong> from PagerDuty · Elevated 5xx errors on checkout · <strong>SEV 1</strong>' },
        { id: 'i1b', type: 'event', source: 'bell', time: '7:12 AM', features: 'owner-routing push', html: 'Notified owners of <strong>checkout-api</strong> by push · Jonas, Maya, Alex · runbook attached' },
        { id: 'i2', type: 'message', person: 'priya', time: '7:15 AM', flagged: true, html: '<p>Pager fired at 7:12. Checkout 5xx is at 4.8% in us-east-1. I’m leading the response.</p>' },
        {
          id: 'i4',
          type: 'message',
          person: 'jonas',
          time: '7:21 AM',
          html: '<p>Top error from Sentry:</p>',
          attachment: {
            type: 'trace',
            error: 'TimeoutError: provider did not respond within 3000ms',
            commit: '8f2c1a4',
            frames: [
              { fn: 'retryDelivery', path: 'apps/api/src/webhooks/retry.ts:88' },
              { fn: 'processEvent', path: 'apps/api/src/webhooks/worker.ts:41' },
              { fn: 'Job.run', path: 'apps/api/src/jobs/runner.ts:117' },
              { fn: 'listOnTimeout', path: 'node:internal/timers:594', external: true }
            ]
          }
        },
        { id: 'i5', type: 'message', person: 'jonas', time: '7:24 AM', flagged: true, html: '<p>Provider timeouts triggered a retry storm. Rolling back the webhook worker and turning on the circuit breaker.</p>' },
        { id: 'i6', type: 'event', source: 'relay', time: '7:31 AM', flagged: true, html: 'Status changed to <strong>Monitoring</strong> · error rate back below 0.2%' },
        { id: 'i7', type: 'message', person: 'priya', time: '7:40 AM', html: '<p>Holding for 30 minutes before resolving. Steps are in the handbook.</p>', attachment: { type: 'doc', docId: 'on-call-handbook' } }
      ]
    },
    'dm-maya': {
      name: 'Maya Chen',
      kind: 'dm',
      person: 'maya',
      description: 'Design · online',
      messages: [
        { id: 'dm1', type: 'message', person: 'maya', time: '9:44 AM', html: '<p>Could you take the second review on #1284? Jonas already approved the webhook side.</p>' },
        { id: 'dm2', type: 'message', person: 'alex', time: '9:47 AM', html: '<p>On it after standup.</p>' }
      ]
    },
    'dm-jonas': {
      name: 'Jonas Berg',
      kind: 'dm',
      person: 'jonas',
      description: 'Platform · online',
      messages: [
        { id: 'dj1', type: 'message', person: 'jonas', time: '10:09 AM', html: '<p>Main is red because of my dedupe change. The agent is on it, but can you review its PR when it lands? You’re a code owner for webhooks.</p>' }
      ]
    },
    'dm-priya': {
      name: 'Priya Nair',
      kind: 'dm',
      person: 'priya',
      description: 'Infrastructure · away',
      messages: [
        { id: 'dp1', type: 'message', person: 'priya', time: '7:50 AM', html: '<p>Thanks for jumping in this morning. I’ll write up the timeline once we resolve.</p>' }
      ]
    },
    'dm-sam': {
      name: 'Sam Okafor',
      kind: 'dm',
      person: 'sam',
      description: 'Product · online',
      messages: [
        { id: 'ds1', type: 'message', person: 'sam', time: '10:30 AM', html: '<p>No rush on the release notes, end of day is fine.</p>' }
      ]
    }
  };

  const channelOrder = ['payments', 'releases', 'design', 'inc-042'];
  const dmOrder = ['dm-maya', 'dm-jonas', 'dm-priya', 'dm-sam'];
  const presence = { maya: true, jonas: true, priya: false, sam: true };

  const inboxItems = [
    { id: 'n1', group: 'Today', kind: 'reviews', unread: true, source: 'github', feature: 'review-inbox', text: '<strong>Maya Chen</strong> requested your review on <strong>Add Apple Pay to checkout</strong>', meta: 'acme/checkout · PR #1284 · 12 min ago', why: 'Review requested', route: '#/chat/payments/m1' },
    { id: 'n2', group: 'Today', kind: 'ci', unread: true, source: 'github', feature: 'owner-routing', text: '<strong>test (node 22)</strong> is failing on <strong>main</strong> after Dedupe provider events', meta: 'acme/checkout · 1d90be7 · 41 min ago', why: 'You own apps/api/src/webhooks/', route: '#/chat/payments/m3' },
    { id: 'n3', group: 'Today', kind: 'reviews', unread: true, source: 'bot', text: '<strong>Claude Code</strong> requested your review on <strong>Fix dedupe key normalization</strong>', meta: 'acme/checkout · PR #1291 · opened by an agent · 20 min ago', why: 'You own apps/api/src/webhooks/', route: '#/chat/payments/m4' },
    { id: 'n4', group: 'Today', kind: 'incidents', unread: true, source: 'alert', feature: 'push', text: '<strong>INC-042</strong> is now <strong>Monitoring</strong>: Elevated 5xx errors on checkout', meta: 'checkout-api · SEV 1 · 1 hr ago · also sent to your phone', why: 'You own checkout-api', route: '#/chat/inc-042' },
    { id: 'n5', group: 'Today', kind: 'mentions', unread: false, source: 'relay', feature: 'activity-inbox', text: '<strong>Sam Okafor</strong> mentioned you in <strong>#releases</strong>', meta: '“Can you sanity-check the 2.15 notes?” · 3 hr ago', why: '@mention', route: '#/chat/releases/r2' },
    { id: 'n6', group: 'Earlier', kind: 'reviews', unread: false, source: 'github', text: '<strong>Jonas Berg</strong> requested changes on <strong>Split webhook retries</strong>', meta: 'acme/checkout · PR #1279 · Yesterday', why: 'You authored this PR', route: '#/chat/payments' },
    { id: 'n7', group: 'Earlier', kind: 'incidents', unread: false, source: 'alert', text: '<strong>INC-039</strong> was resolved: Intermittent checkout latency', meta: 'checkout-api · SEV 2 · Yesterday', why: 'You own checkout-api', route: '#/status/incidents' },
    { id: 'n8', group: 'Earlier', kind: 'mentions', unread: false, source: 'slack', text: '<strong>Dana Lee</strong> replied to your note in <strong>#design</strong>', meta: 'via Slack bridge · “Added the empty and error states.” · Yesterday', why: 'Reply to your thread', route: '#/chat/design/d2' }
  ];

  const services = [
    { name: 'checkout-api', health: 'Degraded', tone: 'warn', owners: 'Payments · Maya, Jonas, Alex', oncall: 'Priya Nair', repo: 'acme/checkout', path: 'apps/api/', deploy: 'v2.14.1 · 18 min ago', incident: 'INC-042', runbook: 'on-call-handbook' },
    { name: 'webhook-worker', health: 'Healthy', tone: 'ok', owners: 'Platform · Jonas', oncall: 'Jonas Berg', repo: 'acme/checkout', path: 'apps/worker/', deploy: 'v2.14.1 · 18 min ago', runbook: 'on-call-handbook' },
    { name: 'web', health: 'Healthy', tone: 'ok', owners: 'Frontend · Maya, Sam', oncall: 'Sam Okafor', repo: 'acme/web', path: '/', deploy: 'v5.2.0 · Yesterday' },
    { name: 'gateway', health: 'Healthy', tone: 'ok', owners: 'Platform · Priya', oncall: 'Priya Nair', repo: 'acme/platform', path: 'gateway/', deploy: 'v1.9.3 · 3 days ago' }
  ];

  const documents = [
    {
      id: 'checkout-architecture',
      kind: 'document',
      title: 'Checkout architecture',
      summary: 'How the payment flow works, where the boundaries are, and what fails when a provider call stalls.',
      owner: 'Maya Chen',
      ownerInitials: 'MC',
      ownerTone: 'coral',
      updated: '2h ago',
      source: 'Linked in #payments',
      tags: ['architecture', 'checkout', 'payments'],
      body: `# Overview

Checkout is a thin orchestration layer. It owns the user's progress through payment, but it does **not** hold provider state. The browser talks to \`checkout-api\`, which coordinates three systems:

- **Wallet service** — tokenization and payment method storage.
- **Orders** — the final, durable source of truth.
- **Provider webhooks** — asynchronous confirmation and refunds.

# The happy path

1. The browser requests a payment intent from \`checkout-api\`.
2. \`checkout-api\` creates the order shell and a provider intent.
3. The provider SDK confirms payment in the browser.
4. A signed webhook settles the order and publishes \`order.paid\`.

> The browser confirmation is a hint, never the source of truth. Only the signed webhook marks an order as paid.

# Failure modes

| Failure | Behavior |
| --- | --- |
| Provider timeout | Retry with an idempotency key; never charge twice |
| Duplicate webhook | Deduplicated by provider event ID |
| Wallet unavailable | Card form stays available |
| Order write fails | Intent remains pending; reconciliation retries |

# Boundaries

\`checkout-api\` should not own pricing, tax or fulfilment. Those are read from the order service at intent creation. If a rule needs to be shared across checkout and subscriptions, it belongs in \`pricing\`, not here.

\`\`\`ts
// A webhook is accepted only after signature verification.
const event = verifySignature(rawBody, headers["stripe-signature"]);

if (await orders.hasEvent(event.id)) return;

await orders.applyPaymentEvent(event);
\`\`\`

The full sequence diagram lives in the repository under \`docs/checkout/sequence.md\`.`
    },
    {
      id: 'on-call-handbook',
      kind: 'document',
      title: 'On-call handbook',
      summary: 'Rotation, escalation and the first ten minutes of an incident.',
      owner: 'Priya Nair',
      ownerInitials: 'PN',
      ownerTone: 'violet',
      updated: 'Yesterday',
      source: 'Linked in #inc-042',
      tags: ['on-call', 'process', 'incidents'],
      body: `# Your job on call

Make the incident smaller. You are not expected to know every system, and you are never expected to debug alone.

# First ten minutes

1. Acknowledge the page in PagerDuty.
2. Run \`/incident\` in Relay. It opens the room, attaches this runbook and notifies the service owners.
3. Say who is leading the response, and flag key messages so they land on the timeline.
4. Post a short status update: impact, scope and what happens next.

> If you are unsure, escalate. A second pair of eyes is cheaper than a longer outage.

# Severity guide

| Severity | Meaning | Target response |
| --- | --- | --- |
| SEV 1 | Customer-facing outage or data risk | Page immediately |
| SEV 2 | Major degradation with a workaround | Acknowledge within 15 min |
| SEV 3 | Limited impact or internal only | Handle in business hours |

# During the incident

- Keep one person talking to stakeholders.
- Write times down as they happen; do not reconstruct at the end.
- Prefer reversible mitigations over perfect fixes.
- Hand off explicitly if you need to step away.

# Handoff

Include the current status, the last known-good change, open hypotheses and the next update time. The incident room is the handoff document.`
    },
    {
      id: 'release-checklist',
      kind: 'document',
      title: 'Release checklist',
      summary: 'The short list we run before every production deploy.',
      owner: 'Sam Okafor',
      ownerInitials: 'SO',
      ownerTone: 'amber',
      updated: '2d ago',
      source: 'Linked in #payments and #releases',
      tags: ['releases', 'checklist'],
      body: `# Before the window

- [ ] Release PR has two approvals and a green pipeline.
- [ ] Staging has soaked for at least 30 minutes.
- [ ] Rollback path is known and still deployable.
- [ ] Release notes are drafted.
- [ ] On-call is aware of the window.

# During the deploy

Watch error rate, p95 latency and the queue depth for ten minutes. Do not start a second deploy while the first is still rolling out.

\`\`\`sh
relay tail "#releases"            # follow deploy events
gh run watch 8421 --repo acme/checkout
\`\`\`

# After the deploy

1. Confirm the version in production.
2. Post the release note in \`#releases\`.
3. Close the release PR and update the changelog.
4. Keep an eye on the error budget for one hour.

# Rollback

Use the previous production build from GitHub. A rollback is not a failure; a slow rollback is.`
    },
    {
      id: 'api-versioning',
      kind: 'document',
      title: 'API versioning',
      summary: 'Compatibility rules for public endpoints and webhook payloads.',
      owner: 'Jonas Berg',
      ownerInitials: 'JB',
      ownerTone: 'blue',
      updated: '4d ago',
      source: 'Linked in #payments',
      tags: ['api', 'versioning', 'webhooks'],
      body: `# The rule

A version is a promise about the shape of a request and response, not about implementation. Clients should be able to upgrade on their own schedule.

# What is compatible

| Change | Allowed without a version |
| --- | --- |
| Adding an optional request field | Yes |
| Adding a response field | Yes |
| Adding a new webhook type | Yes |
| Renaming a field | No |
| Changing a status code | No |
| Removing an endpoint | No |

# Deprecation

1. Announce the change at least 90 days before removal.
2. Return a \`Sunset\` header on the deprecated endpoint.
3. Keep the old behavior available through one major version.
4. Publish a migration note in the developer changelog.

# Webhooks

Webhook payloads include an \`api_version\` field. Receivers should ignore unknown fields and verify signatures before parsing.

> Never break a webhook payload silently. A dropped field is an outage in someone else's system.`
    },
    {
      id: 'local-development',
      kind: 'document',
      title: 'Local development',
      summary: 'Run the stack, seed data, and test webhooks on your machine.',
      owner: 'Maya Chen',
      ownerInitials: 'MC',
      ownerTone: 'coral',
      updated: '1w ago',
      source: 'Linked in #payments',
      tags: ['development', 'setup'],
      body: `# Prerequisites

- Node 22 and pnpm 9
- Docker for Postgres (optional; PGlite is the default)
- The GitHub CLI if you want to exercise pull request unfurls

# Start the stack

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

The web app runs at \`http://localhost:5173\`. The API listens on \`http://localhost:3000\`.

# Seed the checkout channel

\`\`\`sh
pnpm seed:chat --workspace acme
\`\`\`

# Test a webhook

Use the forwarder to replay a signed event from the provider fixtures:

\`\`\`sh
pnpm webhooks:forward --event payment_intent.succeeded
\`\`\`

# Common issues

- **Port 3000 in use** — stop the old server or run \`PORT=3001 pnpm dev\`.
- **Empty channel** — rerun the seed command; it is safe to repeat.
- **Webhook signature errors** — the fixture and local secret must match.`
    },
    {
      id: 'release-notes-215',
      kind: 'document',
      title: 'v2.15 release notes',
      summary: 'What is shipping, what stays behind a flag, and what we are watching.',
      owner: 'Sam Okafor',
      ownerInitials: 'SO',
      ownerTone: 'amber',
      updated: '3h ago',
      source: 'Linked in #releases',
      tags: ['releases', '2.15'],
      body: `# Shipping

- **Apple Pay** — available behind the \`checkout.wallet\` flag.
- **Webhook retries** — delivery now uses a durable queue with exponential backoff.
- **Review inbox** — failing checks on code you own now appear beside review requests.
- **Faster previews** — preview environments start in under 40 seconds.

_Drafted by Relay from 7 merged PRs and 2 deploy events, then edited by Sam._

# Staying behind a flag

Apple Pay remains experimental until the wallet row has soaked for a full week. The card form is unchanged and remains the default.

# Watching after release

- Payment authorization success rate in us-east-1.
- Webhook queue depth and dead-letter count.
- p95 checkout latency on mobile Safari.

# Rollback

Disable the wallet flag first. If webhook latency is still elevated, roll back to \`v2.14.1\`.`
    },
    {
      id: 'event-webhooks',
      kind: 'decision',
      title: 'Adopt event-driven webhooks',
      summary: 'Move webhook delivery off the request path, with retries and a dead-letter queue.',
      owner: 'Priya Nair',
      ownerInitials: 'PN',
      ownerTone: 'violet',
      updated: '2h ago',
      source: 'Marked as a decision in #payments',
      tags: ['webhooks', 'reliability'],
      status: 'Decided',
      body: `# Context

Provider webhooks were processed inline. A slow provider or a transient database failure could hold the request open, and a timeout produced duplicate retries with no shared idempotency key.

During the 2.14 release, one provider timeout caused a retry storm and elevated checkout errors for 19 minutes.

# Decision

Webhook acceptance and webhook processing are separate steps.

1. The API verifies the signature and writes the raw event to a durable queue.
2. It returns \`202 Accepted\` immediately.
3. A worker processes the event with the provider event ID as its idempotency key.
4. Failed events retry with exponential backoff and land in a dead-letter queue after eight attempts.

# Consequences

- Webhook latency no longer affects checkout latency.
- Duplicate events are safe by construction.
- The team now owns queue depth, retries and dead-letter alerts.
- Replay is possible without asking the provider to resend.

# Alternatives considered

**Process inline with a shorter timeout.** Rejected because it moves the failure to the caller without solving duplicate delivery.

**Use a third-party queue immediately.** Rejected for now; Postgres-backed jobs cover our volume and keep operations simple.`
    },
    {
      id: 'split-billing',
      kind: 'decision',
      title: 'Split billing from checkout',
      summary: 'Give billing its own service before annual plans ship.',
      owner: 'Jonas Berg',
      ownerInitials: 'JB',
      ownerTone: 'blue',
      updated: '5h ago',
      source: 'Marked as a decision in #payments',
      tags: ['billing', 'architecture'],
      status: 'Proposed',
      body: `# Proposal

Extract billing into a small service before annual plans and usage-based pricing land. Checkout keeps payment collection; billing owns plans, entitlements, invoices and renewals.

# Why now

Two upcoming initiatives create the same pressure:

- annual plans need proration and scheduled changes;
- usage-based pricing needs a metering boundary independent of checkout.

Adding both to \`checkout-api\` would make the payment path depend on pricing rules that change on a different cadence.

# Boundary

\`billing\` exposes plan and entitlement reads. It may request a payment, but it does not collect payment details. Checkout remains the only service that talks to the payment provider.

# Open questions

- Where do trial-to-paid transitions live?
- Do we need a separate invoice service, or is billing sufficient?
- What is the migration path for existing subscriptions?

# Recommendation

Approve the boundary, but defer implementation until after the 2.15 release. Start with reads only and keep writes in checkout for one migration cycle.`
    },
    {
      id: 'postgres-queues',
      kind: 'decision',
      title: 'Use Postgres for background jobs',
      summary: 'Keep job infrastructure boring until throughput proves otherwise.',
      owner: 'Sam Okafor',
      ownerInitials: 'SO',
      ownerTone: 'amber',
      updated: '1d ago',
      source: 'Marked as a decision in #payments',
      tags: ['infrastructure', 'queues'],
      status: 'In review',
      body: `# Context

We need durable background jobs for webhook processing, preview cleanup and notification fan-out. The options are a managed queue, Redis with a worker library, or Postgres.

# Proposal

Use Postgres-backed jobs with \`FOR UPDATE SKIP LOCKED\` and a small worker pool. Keep the job schema next to the data it touches.

# Why this fits

- We already run Postgres and have backup and failover procedures.
- Our expected background volume is under 50 jobs per second.
- Transactional enqueue matters: a webhook event and its job should commit together.
- One fewer service to secure, monitor and page on.

# When we would revisit

Move to a dedicated queue when any of these is true for a sustained period:

- more than 200 jobs per second;
- workers need independent scaling with sub-second latency;
- job volume starts to affect primary database latency.

# Review notes

The reliability group is checking failure semantics for the dead-letter path before this moves to Decided.`
    },
    {
      id: 'pnpm-workspaces',
      kind: 'decision',
      title: 'Standardize on pnpm',
      summary: 'One package manager, one lockfile, faster installs in CI.',
      owner: 'Maya Chen',
      ownerInitials: 'MC',
      ownerTone: 'coral',
      updated: '3d ago',
      source: 'Marked as a decision in #payments',
      tags: ['tooling', 'ci'],
      status: 'Decided',
      body: `# Context

The repository used npm in CI and pnpm locally. That produced different lockfiles, slower installs and occasional dependency drift between environments.

# Decision

All workspaces use **pnpm 9**. npm and yarn lockfiles are removed.

# What changes

- CI caches the pnpm store instead of \`node_modules\`.
- Workspace dependencies use the \`workspace:\` protocol.
- New packages must be added through \`pnpm add\`.
- Engines are pinned in \`.npmrc\` and the root \`package.json\`.

# Migration notes

The migration is complete. If an editor still points at npm, reload the workspace after installing pnpm. CI will fail with a clear error when the lockfile is out of date.`
    },
    {
      id: 'trunk-based',
      kind: 'decision',
      title: 'Move to trunk-based development',
      summary: 'Small, short-lived branches with a release flag instead of long release branches.',
      owner: 'Jonas Berg',
      ownerInitials: 'JB',
      ownerTone: 'blue',
      updated: '1w ago',
      source: 'Marked as a decision in #payments',
      tags: ['process', 'release'],
      status: 'Decided',
      body: `# Decision

Production releases come from \`main\`. Work merges in small increments behind flags when it cannot ship immediately. Long-lived release branches are retired after 2.15.

# Rules

- A branch lives for less than two days where possible.
- Every change is deployable on its own, or hidden behind a flag.
- \`main\` must stay green; a red main is the team's top priority.
- Release notes are generated from merged PRs and reviewed before the window.

# Why

Release branches delayed integration, made rollbacks ambiguous and encouraged large, risky merges. The 2.14 retry incident was harder to reason about because staging and production had diverged.

# Exceptions

A release branch is still allowed for a coordinated customer migration. The exception must be recorded in the release PR and expires after one week.`
    },
    {
      id: 'checkout-redesign',
      kind: 'design',
      title: 'Checkout redesign',
      summary: 'A calmer checkout with clearer wallet and card states.',
      owner: 'Maya Chen',
      ownerInitials: 'MC',
      ownerTone: 'coral',
      updated: '1h ago',
      source: 'Linked in #design',
      tags: ['checkout', 'flow'],
      status: 'In progress',
      body: `# Direction

Two directions were explored. The split wallet and card panels tested best because each payment method keeps its own failure and empty states.

# Principles

- One decision per screen. Nothing competes with the primary action.
- Wallet and card are peers; neither looks like an upsell.
- Errors live next to the field that caused them.
- The dev-only card form stays visible in prototypes.

# Current layout

1. Order summary and total, collapsed on mobile.
2. Payment method panel with wallet first when available.
3. Billing details, prefilled and editable.
4. One primary action: **Pay**.

# Open states

- Wallet available and selected.
- Wallet available but declined; card fallback.
- No wallet; card only.
- Provider timeout with retry.

# Review

Thursday at 10:00. Bring the mobile version and the empty state.`
    },
    {
      id: 'incident-timelines',
      kind: 'design',
      title: 'Incident timeline patterns',
      summary: 'How we show what happened without turning status into a dashboard.',
      owner: 'Priya Nair',
      ownerInitials: 'PN',
      ownerTone: 'violet',
      updated: '1d ago',
      source: 'Linked in #design and #inc-042',
      tags: ['incidents', 'status'],
      status: 'Exploring',
      body: `# Goal

Give responders and stakeholders a shared sense of sequence during an incident without adding another control plane.

# Pattern

A single vertical timeline with four event types:

| Type | Example |
| --- | --- |
| Status | Investigating, Identified, Monitoring |
| Action | Rolled back webhook worker |
| Signal | Error rate below 0.2% |
| Note | Customer report from support |

# Principles

- Time is the anchor; never group events without preserving exact times.
- Status changes are visually distinct from human notes.
- Collapse resolved incidents, but keep the active timeline open.
- Link out to source systems instead of duplicating their controls.

> Relay should show the story of an incident, not offer a button to resolve it.

# Next

Prototype the active-incident view with a long timeline and a noisy set of automated signals. Check the mobile scan path before Thursday.`
    },
    {
      id: 'command-palette-v2',
      kind: 'design',
      title: 'Command palette v2',
      summary: 'One search surface for channels, docs, people and work.',
      owner: 'Sam Okafor',
      ownerInitials: 'SO',
      ownerTone: 'amber',
      updated: '1w ago',
      source: 'Linked in #design',
      tags: ['navigation', 'search'],
      status: 'Shipped',
      body: `# What shipped

A single palette opens with **⌘K** and searches:

- channels and recent conversations;
- library documents, decisions and design notes;
- linked GitHub pull requests and issues;
- features on the roadmap;
- people in the workspace.

# What we removed

Global search and command palette were separate surfaces. Running both created duplicate results and two sets of keyboard shortcuts.

# Behavior

Results are ranked by recency, then match quality. The first action is always keyboard-selectable. Empty results suggest clearing the query rather than showing a wall of unrelated links.

# Follow-up

Watch how often people use the palette to open documents versus channels. If document opens stay below 10%, consider removing the section to keep the list short.`
    },
    {
      id: 'mobile-nav',
      kind: 'design',
      title: 'Mobile navigation',
      summary: 'A smaller shell for triage on a phone.',
      owner: 'Maya Chen',
      ownerInitials: 'MC',
      ownerTone: 'coral',
      updated: '2d ago',
      source: 'Linked in #design',
      tags: ['mobile', 'navigation'],
      status: 'In progress',
      body: `# Goal

Make the primary surfaces usable on a phone without shrinking the desktop layout into an unusable grid.

# Shell

A compact top bar holds the current workspace, a channel switch and theme control. Status and Inbox are reachable from a bottom bar only when an unread or active incident exists.

# Decisions

- Do not use a hamburger menu for primary navigation.
- Chat stays the default surface.
- Tables become stacked rows; horizontal scrolling is not acceptable for status.
- The document reader is full screen.

# Open questions

- Does the bottom bar create too much chrome in chat?
- Should the inbox badge show all unread items or only mentions?
- Can the channel switch live in the chat header instead of the global bar?

# Next

Test the chat and active incident paths on a 390 px viewport.`
    }
  ];

  const state = {
    view: 'chat',
    channel: 'payments',
    inboxFilter: 'all',
    settingsTab: 'integrations',
    roadmapFilter: 'all',
    catchUpOpen: false,
    pendingFeature: null,
    libraryCollection: 'documents',
    libraryMode: { documents: 'list', decisions: 'board', design: 'board' },
    libraryQuery: '',
    activeDocId: null,
    editingDocId: null,
    editorTab: 'write',
    docTrigger: null,
    editorTrigger: null,
    editorReturnToDoc: false
  };

  const kindLabels = {
    document: 'Document',
    decision: 'Decision',
    design: 'Design'
  };

  const collectionForKind = {
    document: 'documents',
    decision: 'decisions',
    design: 'design'
  };

  const boardColumns = {
    decisions: ['Proposed', 'In review', 'Decided'],
    design: ['Exploring', 'In progress', 'Shipped']
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let toastTimer = null;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function getDoc(id) {
    return documents.find((document) => document.id === id);
  }

  function docsFor(collection) {
    return documents.filter((document) => collectionForKind[document.kind] === collection);
  }

  function kindForCollection(collection) {
    return {
      documents: 'document',
      decisions: 'decision',
      design: 'design'
    }[collection];
  }

  function firstName(name) {
    return name.split(' ')[0];
  }

  function slugify(value) {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return slug || 'untitled';
  }

  function uniqueDocId(title) {
    const base = slugify(title);
    let id = base;
    let index = 2;

    while (getDoc(id)) {
      id = `${base}-${index}`;
      index += 1;
    }

    return id;
  }

  function summaryFromBody(body) {
    const plain = body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s+.*$/gm, ' ')
      .replace(/[>*_`[\]()|#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!plain) return 'A new document in your library.';
    return plain.length > 150 ? `${plain.slice(0, 147).trim()}…` : plain;
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;

    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        textarea.remove();
      }
    });
  }

  function sourceIconHTML(source) {
    const config = sourceIcons[source] || sourceIcons.relay;
    return `<svg class="icon${config.fill ? ' icon--fill' : ''}" aria-hidden="true"><use href="#i-${config.icon}"/></svg>`;
  }

  function renderInlineMarkdown(text) {
    const codeSpans = [];
    let output = text;

    output = output.replace(/`([^`\n]+)`/g, (match, code) => {
      const token = `\uE000${codeSpans.length}\uE001`;
      codeSpans.push(`<code>${code}</code>`);
      return token;
    });

    output = output.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      const decodedUrl = url.replace(/&amp;/g, '&');

      if (!/^(https?:\/\/|\/|#)/i.test(decodedUrl)) return match;

      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    output = output.replace(/\uE000(\d+)\uE001/g, (match, index) => {
      return codeSpans[Number(index)] || '';
    });

    return output;
  }

  function splitTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
  }

  function renderMarkdown(markdown) {
    const lines = escapeHTML(String(markdown).replace(/\r\n/g, '\n')).split('\n');
    const output = [];
    let currentList = null;
    let index = 0;

    function closeList() {
      if (!currentList) return;
      output.push(`</${currentList}>`);
      currentList = null;
    }

    function openList(type) {
      if (currentList === type) return;
      closeList();
      output.push(`<${type}>`);
      currentList = type;
    }

    function isBlockStart(line) {
      return (
        !line.trim() ||
        /^```/.test(line) ||
        /^#{1,3}\s+/.test(line) ||
        /^>\s?/.test(line) ||
        /^\s*[-*]\s+/.test(line) ||
        /^\s*\d+\.\s+/.test(line) ||
        /^---+$/.test(line.trim())
      );
    }

    while (index < lines.length) {
      const line = lines[index];

      if (/^```/.test(line)) {
        closeList();
        index += 1;
        const codeLines = [];

        while (index < lines.length && !/^```/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) index += 1;

        output.push(
          `<div class="code-block"><pre><code>${codeLines.join('\n')}</code></pre>` +
          '<button class="copy-code" type="button">Copy</button></div>'
        );
        continue;
      }

      if (!line.trim()) {
        closeList();
        index += 1;
        continue;
      }

      if (isTableSeparator(lines[index + 1] || '') && line.includes('|')) {
        closeList();
        const header = splitTableRow(line);
        index += 2;
        const rows = [];

        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }

        const head = header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
        const body = rows
          .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
          .join('');

        output.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 1, 4);
        output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        closeList();
        const quoteLines = [];

        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^>\s?/, ''));
          index += 1;
        }

        output.push(`<blockquote>${quoteLines.map(renderInlineMarkdown).join('<br>')}</blockquote>`);
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        openList('ul');

        const item = line.replace(/^\s*[-*]\s+/, '');
        const task = item.match(/^\[( |x)\]\s+(.+)$/i);

        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          output.push(
            `<li class="task-item${checked ? ' is-checked' : ''}">` +
            `<span class="task-check" aria-hidden="true"></span><span>${renderInlineMarkdown(task[2])}</span></li>`
          );
        } else {
          output.push(`<li>${renderInlineMarkdown(item)}</li>`);
        }

        index += 1;
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        openList('ol');
        output.push(`<li>${renderInlineMarkdown(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
        index += 1;
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        closeList();
        output.push('<hr>');
        index += 1;
        continue;
      }

      closeList();
      const paragraph = [line];
      index += 1;

      while (index < lines.length && !isBlockStart(lines[index])) {
        paragraph.push(lines[index]);
        index += 1;
      }

      output.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    }

    closeList();
    return output.join('\n');
  }

  function updateThemeButton() {
    const button = $('#theme-toggle');
    if (!button) return;

    const isDark = document.documentElement.dataset.theme !== 'light';
    button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    button.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = nextTheme;

    try {
      localStorage.setItem('relay-theme', nextTheme);
    } catch (error) {}

    updateThemeButton();
  }

  function statusTone(status) {
    if (status === 'Decided' || status === 'Shipped') return 'work-state--green';
    if (status === 'In review' || status === 'In progress') return 'work-state--amber';
    return '';
  }

  function docIconHTML(kind) {
    const icon = kind === 'decision' ? 'decision' : kind === 'design' ? 'design' : 'doc';
    return `<svg class="icon" aria-hidden="true"><use href="#i-${icon}"/></svg>`;
  }


  function iconHTML(name, fill) {
    return `<svg class="icon${fill ? ' icon--fill' : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  function avatarHTML(personId, size) {
    const person = people[personId] || people.alex;
    const sizeClass = size ? ` avatar--${size}` : '';
    if (person.agent) {
      return `<span class="avatar avatar--agent${sizeClass}" title="${escapeHTML(person.name)}">${iconHTML('bot')}</span>`;
    }
    return `<span class="avatar avatar--${person.tone}${sizeClass}">${person.initials}</span>`;
  }

  function pathLinkHTML(path) {
    return `<button class="path-link" type="button" data-path="${escapeHTML(path)}">${escapeHTML(path)}</button>`;
  }

  function featureAttr(ids) {
    return ids ? ` data-feature="${escapeHTML(ids)}"` : '';
  }

  // Chat attachments

  function renderPullReply(reply) {
    const person = people[reply.person] || people.alex;
    let origin;

    if (reply.origin === 'github') {
      origin = `<span class="sync-badge">${iconHTML('github', true)}From GitHub review${reply.file ? ' on ' + pathLinkHTML(reply.file) : ''}</span>`;
    } else if (reply.status === 'syncing') {
      origin = `<span class="sync-badge sync-badge--pending">${iconHTML('sync')}Syncing to GitHub…</span>`;
    } else {
      origin = `<span class="sync-badge sync-badge--ok">${iconHTML('check')}Synced to GitHub</span>`;
    }

    return `
      <div class="pr-reply-item">
        ${avatarHTML(reply.person, 'xxs')}
        <div class="pr-reply-body">
          <div class="pr-reply-head"><strong>${escapeHTML(person.name)}</strong><time>${escapeHTML(reply.time)}</time>${origin}</div>
          <p>${escapeHTML(reply.text)}</p>
        </div>
      </div>
    `;
  }

  function renderPull(attachment, message) {
    const [additions, deletions] = attachment.stats.split(' ');

    return `
      <div class="work-card pr-card" data-feature="pr-threads">
        <button class="pr-card-main" type="button" data-mock-link="pull request ${escapeHTML(attachment.number)} on GitHub">
          <span class="work-head">
            ${sourceIconHTML('github')}
            <span class="work-label">${escapeHTML(attachment.repo)}</span>
            <span class="work-number">${escapeHTML(attachment.number)}</span>
            <span class="work-state work-state--green">${escapeHTML(attachment.state)}</span>
          </span>
          <span class="work-title">${escapeHTML(attachment.title)}</span>
          <span class="work-meta">
            <span class="diff-add">${escapeHTML(additions)}</span>
            <span class="diff-del">${escapeHTML(deletions)}</span>
            <span class="ok">✓ ${escapeHTML(attachment.check)}</span>
            <span>${escapeHTML(attachment.reviews)}</span>
          </span>
          <span class="work-footer">
            <span>${escapeHTML(attachment.branch)}</span>
            <span>${escapeHTML(attachment.time)}</span>
            <span class="work-open">View on GitHub ${iconHTML('arrow-up-right')}</span>
          </span>
        </button>
        <div class="pr-thread" data-feature="pr-sync">
          <div class="pr-thread-head">${iconHTML('sync')}PR conversation · synced both ways with GitHub</div>
          ${(attachment.thread || []).map(renderPullReply).join('')}
          <form class="pr-reply" data-pr-reply="${escapeHTML(message.id)}">
            <input type="text" placeholder="Reply on ${escapeHTML(attachment.number)}; it also posts to the GitHub review" aria-label="Reply on pull request ${escapeHTML(attachment.number)}" autocomplete="off">
            <button class="button button--small button--secondary" type="submit">Reply</button>
          </form>
        </div>
      </div>
    `;
  }

  function renderExplain(explain) {
    return `
      <div class="explain-box" data-feature="ai-explain">
        <div class="explain-head">${iconHTML('sparkle')}Relay AI · explanation with sources</div>
        <p>${explain.text}</p>
        <div class="cites">
          ${explain.cites.map((cite, index) => {
            const attr = cite.path ? `data-path="${escapeHTML(cite.path)}"` : `data-mock-link="${escapeHTML(cite.mock)}"`;
            return `<button class="cite" type="button" ${attr}><span>${index + 1}</span>${escapeHTML(cite.label)}</button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderCI(message) {
    const ci = message.attachment;
    const log = ci.log.map((line) => {
      return `<span class="log-line${line.fail ? ' is-fail' : ''}"><span class="log-no">${line.n}</span>${escapeHTML(line.text)}</span>`;
    }).join('\n');

    return `
      <div class="work-card ci-card" data-feature="ci-context">
        <span class="work-head">
          ${sourceIconHTML('github')}
          <span class="work-label">${escapeHTML(ci.repo)}</span>
          <span class="work-number">${escapeHTML(ci.check)}</span>
          <span class="work-state work-state--red">Failed</span>
        </span>
        <span class="work-title">${escapeHTML(ci.title)}</span>
        <div class="ci-facts">
          <span><strong>Failing step</strong>${escapeHTML(ci.step)}</span>
          <span class="ci-fact--warn"><strong>Main is red</strong>${ci.brokeMain}</span>
          <span><strong>Flaky?</strong>${escapeHTML(ci.flaky)}</span>
        </div>
        <div class="log-excerpt"><pre><code>${log}</code></pre></div>
        <div class="ci-actions">
          <button class="button button--small button--secondary" type="button" data-mock-link="log at line ${ci.line} in GitHub Actions">Open log at line ${ci.line} ${iconHTML('arrow-up-right')}</button>
          <button class="button button--small button--quiet" type="button" data-explain="${escapeHTML(message.id)}" data-feature="ai-explain" aria-expanded="${message.explained ? 'true' : 'false'}">${iconHTML('sparkle')}${message.explained ? 'Hide explanation' : 'Explain'}</button>
        </div>
        ${message.explained ? renderExplain(ci.explain) : ''}
        <div class="routed-note" data-feature="owner-routing">${iconHTML('bell')}Sent only to owners of <code>${escapeHTML(ci.routedPath)}</code> (CODEOWNERS): ${escapeHTML(ci.routedTo)}</div>
      </div>
    `;
  }

  function renderAgentRun(attachment) {
    return `
      <div class="work-card agent-card" data-feature="agents">
        <span class="work-head">
          ${iconHTML('bot')}
          <span class="work-label">Agent run</span>
          <span class="work-state work-state--amber">${escapeHTML(attachment.status)}</span>
        </span>
        <span class="work-title">${escapeHTML(attachment.task)}</span>
        <ol class="agent-steps">
          ${attachment.steps.map((step) => `<li class="is-${step.state}"><span class="step-mark" aria-hidden="true"></span><span>${escapeHTML(step.text)}</span><span class="sr-only">(${step.state})</span></li>`).join('')}
        </ol>
        <span class="work-footer">${iconHTML('key')}<span>${escapeHTML(attachment.scope)}</span></span>
      </div>
    `;
  }

  function renderTrace(attachment) {
    return `
      <div class="trace-card" data-feature="stack-traces">
        <div class="trace-error">${escapeHTML(attachment.error)}</div>
        <ol class="trace-frames">
          ${attachment.frames.map((frame) => {
            const location = frame.external
              ? `<span class="trace-external">${escapeHTML(frame.path)}</span>`
              : pathLinkHTML(frame.path);
            return `<li><span class="trace-at">at</span> <span class="trace-fn">${escapeHTML(frame.fn)}</span> ${location}</li>`;
          }).join('')}
        </ol>
        <div class="trace-foot">${iconHTML('github', true)}Frames resolved against acme/checkout @ <code>${escapeHTML(attachment.commit)}</code>, the deployed commit</div>
      </div>
    `;
  }

  function renderDigest(message) {
    const digest = message.attachment;
    return `
      <div class="work-card digest-card" data-feature="digest">
        <span class="work-head">${iconHTML('sparkle')}<span class="work-label">Weekly ship digest</span><span class="work-number">${escapeHTML(digest.range)}</span></span>
        <div class="digest-stats">
          ${digest.stats.map((stat) => `<div><strong>${escapeHTML(stat.value)}</strong><span>${escapeHTML(stat.label)}</span></div>`).join('')}
        </div>
        <ul class="digest-list">${digest.highlights.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
      </div>
    `;
  }

  function renderServiceCard(service) {
    return `
      <div class="work-card service-card" data-feature="service-catalog slash-commands">
        <span class="work-head">${iconHTML('server')}<span class="work-label mono">${escapeHTML(service.name)}</span><span class="work-state ${service.tone === 'ok' ? 'work-state--green' : 'work-state--amber'}">${escapeHTML(service.health)}</span></span>
        <dl class="service-facts">
          <div><dt>Owners</dt><dd>${escapeHTML(service.owners)}</dd></div>
          <div><dt>On call</dt><dd>${escapeHTML(service.oncall)}</dd></div>
          <div><dt>Repo</dt><dd class="mono">${escapeHTML(service.repo)}/${escapeHTML(service.path.replace(/^\//, ''))}</dd></div>
          <div><dt>Last deploy</dt><dd>${escapeHTML(service.deploy)}</dd></div>
        </dl>
      </div>
    `;
  }

  function renderDocAttachment(attachment) {
    const doc = getDoc(attachment.docId);
    if (!doc) return '';

    return `
      <button class="work-card" type="button" data-open-doc="${escapeHTML(doc.id)}" aria-label="Open ${escapeHTML(doc.title)}">
        <span class="work-head">
          <span class="work-label">${docIconHTML(doc.kind)}</span>
          <span class="work-label">${kindLabels[doc.kind]}</span>
          ${doc.status ? `<span class="work-state ${statusTone(doc.status)}">${escapeHTML(doc.status)}</span>` : ''}
        </span>
        <span class="work-title">${escapeHTML(doc.title)}</span>
        <span class="work-desc">${escapeHTML(doc.summary)}</span>
        <span class="work-footer">
          <span>${escapeHTML(doc.owner)}</span>
          <span>·</span>
          <span>Updated ${escapeHTML(doc.updated)}</span>
          <span class="work-open">Open document ${iconHTML('arrow-right')}</span>
        </span>
      </button>
    `;
  }

  function renderAttachment(message) {
    const attachment = message.attachment;
    if (!attachment) return '';
    if (attachment.type === 'pull') return renderPull(attachment, message);
    if (attachment.type === 'agent') return renderAgentRun(attachment);
    if (attachment.type === 'trace') return renderTrace(attachment);
    if (attachment.type === 'service') return renderServiceCard(attachment.service);
    if (attachment.type === 'doc') return renderDocAttachment(attachment);
    return '';
  }

  // Chat messages

  function messageActionsHTML(message) {
    if (message.ephemeral) return '';
    return `
      <div class="message-actions" role="group" aria-label="Message actions">
        <button class="message-action" type="button" data-message-action="link" data-feature="permalinks" title="Copy link to message" aria-label="Copy link to message">${iconHTML('link')}</button>
        <button class="message-action" type="button" data-message-action="issue" data-feature="msg-to-issue" title="Create GitHub issue" aria-label="Create GitHub issue">${iconHTML('github', true)}</button>
        <button class="message-action" type="button" data-message-action="decision" data-feature="decisions" title="Mark as decision" aria-label="Mark as decision">${iconHTML('decision')}</button>
        ${channels[state.channel].kind === 'incident' ? `<button class="message-action" type="button" data-message-action="flag" data-feature="incident-rooms" title="Add to incident timeline" aria-label="Add to incident timeline">${iconHTML('pin')}</button>` : ''}
      </div>
    `;
  }

  function messageChipsHTML(message) {
    const chips = [];

    if (message.decision) {
      const docAttr = message.decision.doc ? ` data-open-doc="${escapeHTML(message.decision.doc)}"` : '';
      chips.push(`<button class="msg-chip msg-chip--decision" type="button"${docAttr} data-feature="decisions">${iconHTML('decision')}Decision · marked by ${escapeHTML(message.decision.by)}</button>`);
    }
    if (message.issue) {
      chips.push(`<button class="msg-chip" type="button" data-mock-link="issue ${escapeHTML(message.issue)} on GitHub" data-feature="msg-to-issue">${iconHTML('github', true)}${escapeHTML(message.issue)} · Open</button>`);
    }
    if (message.flagged) {
      chips.push(`<a class="msg-chip msg-chip--flag" href="#/status/incidents" data-feature="incident-rooms">${iconHTML('pin')}On incident timeline</a>`);
    }

    return chips.length ? `<div class="msg-chips">${chips.join('')}</div>` : '';
  }

  function renderChatMessage(message) {
    const anchor = ` data-message-id="${escapeHTML(message.id)}"`;

    if (message.type === 'event') {
      return `
        <div class="chat-event"${anchor}${featureAttr(message.features)}>
          <span class="event-icon">${sourceIconHTML(message.source)}</span>
          <div class="event-copy">${message.html}${message.flagged ? ` <span class="event-flag" title="On incident timeline">${iconHTML('pin')}</span>` : ''}</div>
          <time class="event-time">${escapeHTML(message.time)}</time>
        </div>
      `;
    }

    if (message.type === 'ci' || message.type === 'digest') {
      return `
        <div class="chat-system"${anchor}>
          <div class="chat-system-head"><span class="event-icon">${sourceIconHTML(message.type === 'ci' ? 'github' : 'relay')}</span><span>${message.type === 'ci' ? 'GitHub Checks' : 'Relay'}</span><time>${escapeHTML(message.time)}</time></div>
          ${message.type === 'ci' ? renderCI(message) : renderDigest(message)}
        </div>
      `;
    }

    const person = people[message.person] || people.alex;
    const badges = [];
    if (person.agent) badges.push(`<span class="author-badge author-badge--agent" data-feature="agents">${iconHTML('bot')}Agent</span>`);
    if (message.via === 'slack') badges.push(`<span class="author-badge" data-feature="slack-bridge">${iconHTML('slack')}via Slack</span>`);
    if (message.ephemeral) badges.push('<span class="author-badge">Only visible to you</span>');

    const reply = message.replyTo
      ? `<div class="reply-chip" data-feature="agents">${iconHTML('reply')}To ${escapeHTML(message.replyTo)} · delivered to the agent</div>`
      : '';

    return `
      <article class="message${message.ephemeral ? ' message--ephemeral' : ''}"${anchor}${featureAttr(message.features)}>
        ${avatarHTML(message.person)}
        <div class="message-main">
          <header class="message-head">
            <span class="message-author">${escapeHTML(person.name)}</span>
            ${badges.join('')}
            <time class="message-time">${escapeHTML(message.time)}</time>
            <span class="message-role">${escapeHTML(person.role)}</span>
          </header>
          ${reply}
          <div class="message-copy">${message.html}</div>
          ${renderAttachment(message)}
          ${messageChipsHTML(message)}
        </div>
        ${messageActionsHTML(message)}
      </article>
    `;
  }

  function channelLabel(id) {
    const channel = channels[id];
    return channel.kind === 'dm' ? channel.name : `#${channel.name}`;
  }

  function renderConversationLists() {
    const channelList = $('#channel-list');
    const dmList = $('#dm-list');
    const select = $('#chat-conversation-select');

    if (channelList) {
      channelList.innerHTML = channelOrder.map((id) => {
        const channel = channels[id];
        const lead = channel.kind === 'incident'
          ? `<span class="conversation-hash conversation-hash--incident">${iconHTML('alert')}</span>`
          : '<span class="conversation-hash">#</span>';
        const trail = channel.kind === 'bridged'
          ? `<span class="conversation-trail" title="Bridged with Slack">${iconHTML('slack')}</span>`
          : channel.kind === 'repo'
            ? `<span class="conversation-trail" title="Mapped to a GitHub repo">${iconHTML('github', true)}</span>`
            : '';
        return `<a class="conversation-item" href="#/chat/${encodeURIComponent(id)}" data-conversation="${escapeHTML(id)}">${lead}<span class="conversation-name">${escapeHTML(channel.name)}</span>${trail}</a>`;
      }).join('');
    }

    if (dmList) {
      dmList.innerHTML = dmOrder.map((id) => {
        const channel = channels[id];
        const online = presence[channel.person];
        return `<a class="conversation-item" href="#/chat/${encodeURIComponent(id)}" data-conversation="${escapeHTML(id)}">${avatarHTML(channel.person, 'xxs')}<span class="conversation-name">${escapeHTML(channel.name)}</span><span class="presence-dot${online ? ' is-online' : ''}" aria-label="${online ? 'Online' : 'Away'}"></span></a>`;
      }).join('');
    }

    if (select) {
      select.innerHTML =
        `<optgroup label="Channels">${channelOrder.map((id) => `<option value="${escapeHTML(id)}">${escapeHTML(channelLabel(id))}</option>`).join('')}</optgroup>` +
        `<optgroup label="Direct messages">${dmOrder.map((id) => `<option value="${escapeHTML(id)}">${escapeHTML(channelLabel(id))}</option>`).join('')}</optgroup>`;
      select.value = state.channel;
    }

    updateActiveConversation();
  }

  function updateActiveConversation() {
    $$('[data-conversation]').forEach((item) => {
      const active = item.dataset.conversation === state.channel && state.view === 'chat';
      item.classList.toggle('is-active', active);
      if (active) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });

    const select = $('#chat-conversation-select');
    if (select) select.value = state.channel;
  }

  function renderChatContext(channel) {
    const context = $('#chat-context');
    if (!context) return;

    const chips = (channel.context || []).map((chip) => {
      const inner = `${iconHTML(chip.icon, chip.icon === 'github')}<strong>${escapeHTML(chip.label)}</strong>${chip.note ? `<span>${escapeHTML(chip.note)}</span>` : ''}`;
      const toneClass = chip.tone ? ` context-chip--${chip.tone}` : '';
      const feature = featureAttr(chip.feature);

      if (chip.href) return `<a class="context-chip${toneClass}" href="${chip.href}"${feature}>${inner}</a>`;
      if (chip.doc) return `<button class="context-chip${toneClass}" type="button" data-open-doc="${escapeHTML(chip.doc)}"${feature}>${inner}</button>`;
      if (chip.mock) return `<button class="context-chip${toneClass}" type="button" data-mock-link="${escapeHTML(chip.mock)}"${feature}>${inner}</button>`;
      return `<span class="context-chip${toneClass}"${feature}>${inner}</span>`;
    });

    context.innerHTML = chips.join('');
    context.hidden = !chips.length;
  }

  function renderCatchUp(channel) {
    if (!state.catchUpOpen || !channel.catchUp) return '';

    return `
      <section class="catch-up" data-feature="ai-catchup" aria-label="Catch-up summary">
        <header>${iconHTML('sparkle')}<strong>Catch up on ${escapeHTML(channelLabel(state.channel))}</strong><span>Since you last read · every line cites a message</span><button class="icon-button" type="button" data-close-catchup aria-label="Close summary">${iconHTML('x')}</button></header>
        <ul>
          ${channel.catchUp.map((item, index) => `<li><span>${escapeHTML(item.text)}</span><button class="cite" type="button" data-cite="${escapeHTML(item.cite)}"><span>${index + 1}</span>source</button></li>`).join('')}
        </ul>
      </section>
    `;
  }

  function renderChat(options = {}) {
    const channel = channels[state.channel];
    if (!channel) return;

    const isDM = channel.kind === 'dm';
    const hash = $('[data-chat-hash]');
    const name = $('[data-chat-name]');
    const description = $('[data-chat-description]');
    const members = $('[data-chat-members]');
    const avatars = $('[data-chat-avatars]');
    const input = $('#message-input');
    const feed = $('#chat-feed');
    const catchUp = $('#catch-up');
    const label = channelLabel(state.channel);

    if (hash) hash.textContent = isDM ? '' : channel.kind === 'incident' ? '!' : '#';
    if (name) name.textContent = channel.name;
    if (description) description.textContent = channel.description;
    if (members) members.textContent = isDM ? '' : `${channel.members} members`;
    if (avatars) avatars.innerHTML = (channel.avatars || []).map((id) => avatarHTML(id, 'xs')).join('');
    if (catchUp) catchUp.hidden = !channel.catchUp;

    renderChatContext(channel);

    if (input) {
      input.placeholder = `Message ${label}`;
      input.setAttribute('aria-label', `Message ${label}`);
    }

    const hint = $('.composer-hint');
    if (hint) {
      hint.innerHTML = channel.composerNote
        ? `<span data-feature="slack-bridge">${iconHTML('slack')}${escapeHTML(channel.composerNote)}</span>`
        : '<strong>Enter</strong> to send <span>·</span> Try <code>/service checkout-api</code> or <code>/incident Payment timeouts</code>';
    }

    if (feed) {
      feed.innerHTML =
        renderCatchUp(channel) +
        '<div class="day-divider">Today</div>' +
        channel.messages.map(renderChatMessage).join('');

      if (options.scrollBottom !== false) {
        requestAnimationFrame(() => {
          feed.scrollTop = feed.scrollHeight;
        });
      }
    }

    updateActiveConversation();
    updateSendState();
    resizeComposer();
  }

  function updateSendState() {
    const input = $('#message-input');
    const button = $('.send-button');
    if (!input || !button) return;
    button.disabled = !input.value.trim();
  }

  function resizeComposer() {
    const input = $('#message-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  }

  function selectChannel(channelId, options = {}) {
    if (!channels[channelId]) return;
    const changed = state.channel !== channelId;
    state.channel = channelId;
    if (changed) state.catchUpOpen = false;
    if (changed || options.force) renderChat();
    else updateActiveConversation();
  }

  function findMessage(messageId) {
    return channels[state.channel].messages.find((message) => message.id === messageId);
  }

  function nowLabel() {
    return 'Just now';
  }

  function runSlashCommand(text) {
    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();

    if (command === '/service') {
      const service = services.find((item) => item.name === arg) || services[0];
      channels[state.channel].messages.push({
        id: `svc-${Date.now()}`,
        type: 'message',
        person: 'alex',
        ephemeral: true,
        time: nowLabel(),
        html: `<p><code>/service ${escapeHTML(arg || service.name)}</code></p>`,
        attachment: { type: 'service', service }
      });
      renderChat();
      return true;
    }

    if (command === '/incident') {
      const number = 43 + channelOrder.filter((id) => id.startsWith('inc-') && id !== 'inc-042').length;
      const id = `inc-0${number}`;
      const title = arg || 'New incident';
      channels[id] = {
        name: id,
        kind: 'incident',
        description: `${title} · SEV 2 · Investigating. Opened with /incident.`,
        members: 4,
        avatars: ['alex', 'jonas', 'maya'],
        context: [
          { icon: 'alert', label: 'SEV 2 · Investigating', tone: 'danger', feature: 'incident-rooms' },
          { icon: 'server', label: 'checkout-api', note: 'owners notified', href: '#/status/services', feature: 'owner-routing' },
          { icon: 'doc', label: 'Runbook', note: 'On-call handbook', doc: 'on-call-handbook' }
        ],
        messages: [
          { id: `${id}-1`, type: 'event', source: 'alert', time: nowLabel(), flagged: true, html: `Opened <strong>INC-0${number}</strong> · ${escapeHTML(title)} · <strong>SEV 2</strong> by Alex Rivera` },
          { id: `${id}-2`, type: 'event', source: 'bell', time: nowLabel(), features: 'owner-routing push', html: 'Notified owners of <strong>checkout-api</strong> by push · runbook attached · PagerDuty linked' }
        ]
      };
      channelOrder.push(id);
      renderConversationLists();
      showToast(`Opened #${id} and notified the owners of checkout-api`);
      location.hash = `#/chat/${id}`;
      return true;
    }

    if (command === '/deploy') {
      showToast('Deploy cards come from CI. Add the relay GitHub Action to your deploy workflow.');
      return true;
    }

    return false;
  }

  function sendMessage(event) {
    event.preventDefault();

    const input = $('#message-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    if (text.startsWith('/') && runSlashCommand(text)) {
      updateSendState();
      input.focus();
      return;
    }

    const paragraphs = text.split(/\n{2,}/).map((paragraph) => {
      return `<p>${renderInlineMarkdown(escapeHTML(paragraph)).replace(/\n/g, '<br>')}</p>`;
    });

    channels[state.channel].messages.push({
      id: `local-${Date.now()}`,
      type: 'message',
      person: 'alex',
      time: nowLabel(),
      html: paragraphs.join('')
    });

    renderChat();
    updateSendState();
    input.focus();
  }

  function replyToPull(form) {
    const input = $('input', form);
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const message = findMessage(form.dataset.prReply);
    if (!message || !message.attachment) return;

    const reply = { person: 'alex', origin: 'relay', status: 'syncing', time: nowLabel(), text };
    message.attachment.thread.push(reply);
    renderChat({ scrollBottom: false });
    flashMessage(message.id, { scroll: false });

    window.setTimeout(() => {
      reply.status = 'synced';
      if (state.view === 'chat' && findMessage(message.id) === message) {
        renderChat({ scrollBottom: false });
        const nextInput = $(`[data-pr-reply="${message.id}"] input`);
        if (nextInput) nextInput.focus();
      }
      showToast('Reply posted to the GitHub review on #1284');
    }, 1300);
  }

  function handleMessageAction(button) {
    const article = button.closest('[data-message-id]');
    const message = article ? findMessage(article.dataset.messageId) : null;
    if (!message) return;

    const action = button.dataset.messageAction;

    if (action === 'link') {
      const url = `${location.href.split('#')[0]}#/chat/${encodeURIComponent(state.channel)}/${encodeURIComponent(message.id)}`;
      copyText(url).then(() => showToast('Message link copied')).catch(() => showToast('Could not copy the link.'));
      return;
    }

    if (action === 'issue') {
      if (message.issue) {
        showToast(`Already linked to ${message.issue}`);
        return;
      }
      message.issue = 'acme/checkout#1293';
      showToast('Created acme/checkout#1293. Its state will show here.');
    }

    if (action === 'decision') {
      message.decision = message.decision ? null : { by: 'Alex Rivera' };
      showToast(message.decision ? 'Marked as a decision · find it with is:decision' : 'Decision mark removed');
    }

    if (action === 'flag') {
      message.flagged = !message.flagged;
      showToast(message.flagged ? 'Added to the incident timeline' : 'Removed from the incident timeline');
    }

    renderChat({ scrollBottom: false });
    flashMessage(message.id, { scroll: false });
  }

  function flashElement(element, options = {}) {
    if (!element) return;
    if (options.scroll !== false) element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element.classList.remove('is-flash');
    void element.offsetWidth;
    element.classList.add('is-flash');
    window.setTimeout(() => element.classList.remove('is-flash'), 1800);
  }

  function flashMessage(messageId, options) {
    flashElement($(`#chat-feed [data-message-id="${CSS.escape(messageId)}"]`), options);
  }

  function setupChat() {
    const form = $('#composer');
    const input = $('#message-input');
    const select = $('#chat-conversation-select');
    const catchUp = $('#catch-up');

    if (form) form.addEventListener('submit', sendMessage);

    if (input) {
      input.addEventListener('input', () => {
        updateSendState();
        resizeComposer();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
    }

    if (select) {
      select.addEventListener('change', () => {
        location.hash = `#/chat/${encodeURIComponent(select.value)}`;
      });
    }

    if (catchUp) {
      catchUp.addEventListener('click', () => {
        state.catchUpOpen = !state.catchUpOpen;
        renderChat({ scrollBottom: false });
        const feed = $('#chat-feed');
        if (feed && state.catchUpOpen) feed.scrollTop = 0;
      });
    }

    document.addEventListener('submit', (event) => {
      const prForm = event.target.closest('[data-pr-reply]');
      if (!prForm) return;
      event.preventDefault();
      replyToPull(prForm);
    });

    document.addEventListener('click', (event) => {
      const path = event.target.closest('[data-path]');
      if (path) {
        const [file, line] = path.dataset.path.split(':');
        showToast(`Opens vscode://file/~/acme/checkout/${file}:${line} · or GitHub at the PR’s head commit`);
        return;
      }

      const explain = event.target.closest('[data-explain]');
      if (explain) {
        const message = findMessage(explain.dataset.explain);
        if (message) {
          message.explained = !message.explained;
          renderChat({ scrollBottom: false });
          flashMessage(message.id, { scroll: false });
        }
        return;
      }

      const cite = event.target.closest('[data-cite]');
      if (cite) {
        flashMessage(cite.dataset.cite);
        return;
      }

      if (event.target.closest('[data-close-catchup]')) {
        state.catchUpOpen = false;
        renderChat({ scrollBottom: false });
        return;
      }

      const action = event.target.closest('[data-message-action]');
      if (action) handleMessageAction(action);
    });

    renderConversationLists();
    renderChat({ scrollBottom: false });
  }

  // Inbox

  function inboxIconHTML(source) {
    const classes = {
      github: 'source-icon--github',
      alert: 'source-icon--incident',
      slack: 'source-icon--slack',
      bot: 'source-icon--agent',
      relay: 'source-icon--relay'
    };
    const labels = { github: 'GitHub', alert: 'Incident', slack: 'Slack', bot: 'Agent', relay: 'Relay' };
    return `<span class="source-icon ${classes[source] || 'source-icon--relay'}" aria-label="${labels[source] || 'Relay'}">${sourceIconHTML(source)}</span>`;
  }

  const inboxKindLabels = { reviews: 'Review', ci: 'Failing CI', mentions: 'Mention', incidents: 'Incident' };

  function renderInbox() {
    const list = $('#inbox-list');
    if (!list) return;

    const filter = state.inboxFilter;
    const visible = inboxItems.filter((item) => filter === 'all' || item.kind === filter);
    const groups = ['Today', 'Earlier'];

    list.innerHTML = groups.map((group) => {
      const items = visible.filter((item) => item.group === group);
      if (!items.length) return '';
      return `
        <section class="inbox-group">
          <h2 class="group-title">${group}</h2>
          <div class="notification-list">
            ${items.map((item) => `
              <button class="notification${item.unread ? ' is-unread' : ''}" type="button" data-notification="${item.id}"${featureAttr(item.feature)} aria-label="${item.unread ? 'Unread' : 'Read'} ${inboxKindLabels[item.kind]}: ${escapeHTML(item.text.replace(/<[^>]+>/g, ''))}">
                <span class="unread-dot" aria-hidden="true"></span>
                ${inboxIconHTML(item.source)}
                <span class="notification-content">
                  <span class="notification-text">${item.text}</span>
                  <span class="notification-meta">${escapeHTML(item.meta)}</span>
                  <span class="notification-why">${iconHTML(item.why.startsWith('You own') ? 'server' : 'bell')}${escapeHTML(item.why)}</span>
                </span>
                <span class="notification-kind">${inboxKindLabels[item.kind]}</span>
                ${iconHTML('arrow-right').replace('class="icon"', 'class="icon notification-arrow"')}
              </button>
            `).join('')}
          </div>
        </section>
      `;
    }).join('') + (filter === 'all' || filter === 'ci'
      ? `<p class="routing-footnote" data-feature="owner-routing">${iconHTML('server')}6 notifications this week went to other owners instead of you, routed by CODEOWNERS and the service catalog.</p>`
      : '');

    const empty = $('#inbox-empty');
    if (empty) empty.hidden = visible.length > 0;

    $$('[data-inbox-filter]').forEach((button) => {
      const active = button.dataset.inboxFilter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    updateInboxCounts();
  }

  function updateInboxCounts() {
    const counts = { all: inboxItems.length, reviews: 0, ci: 0, mentions: 0, incidents: 0 };
    inboxItems.forEach((item) => { counts[item.kind] += 1; });

    $$('[data-inbox-count]').forEach((element) => {
      element.textContent = String(counts[element.dataset.inboxCount] || 0);
    });

    const unread = inboxItems.filter((item) => item.unread).length;
    const badge = $('[data-inbox-badge]');
    const markAll = $('#mark-all-read');

    if (badge) {
      badge.textContent = String(unread);
      badge.hidden = unread === 0;
    }

    if (markAll) {
      markAll.disabled = unread === 0;
      markAll.textContent = unread === 0 ? 'All read' : 'Mark all read';
    }
  }

  function setupInbox() {
    $$('[data-inbox-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.inboxFilter = button.dataset.inboxFilter;
        renderInbox();
      });
    });

    const list = $('#inbox-list');
    if (list) {
      list.addEventListener('click', (event) => {
        const row = event.target.closest('[data-notification]');
        if (!row) return;
        const item = inboxItems.find((entry) => entry.id === row.dataset.notification);
        if (!item) return;
        item.unread = false;
        updateInboxCounts();
        location.hash = item.route;
      });
    }

    const markAll = $('#mark-all-read');
    if (markAll) {
      markAll.addEventListener('click', () => {
        inboxItems.forEach((item) => { item.unread = false; });
        renderInbox();
        showToast('Inbox cleared');
      });
    }

    renderInbox();
  }

  // Status

  function selectStatusTab(tabId) {
    const valid = $$('[data-status-tab]').some((button) => button.dataset.statusTab === tabId);
    const next = valid ? tabId : 'deployments';

    $$('[data-status-tab]').forEach((button) => {
      const active = button.dataset.statusTab === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });

    $$('[data-status-panel]').forEach((panel) => {
      const active = panel.dataset.statusPanel === next;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  }

  function renderServices() {
    const list = $('#service-list');
    if (!list) return;

    list.innerHTML = services.map((service) => `
      <article class="service-row">
        <div class="service-name">
          <span class="status-dot status-dot--${service.tone === 'ok' ? 'ok' : 'running'}"></span>
          <strong class="mono">${escapeHTML(service.name)}</strong>
          <span class="service-health">${escapeHTML(service.health)}${service.incident ? ` · <a href="#/chat/inc-042">${escapeHTML(service.incident)}</a>` : ''}</span>
        </div>
        <dl class="service-facts">
          <div><dt>Owners</dt><dd>${escapeHTML(service.owners)}</dd></div>
          <div><dt>On call</dt><dd>${escapeHTML(service.oncall)} <span class="muted">· PagerDuty</span></dd></div>
          <div><dt>Code</dt><dd class="mono">${escapeHTML(service.repo)}/${escapeHTML(service.path.replace(/^\//, ''))}</dd></div>
          <div><dt>Last deploy</dt><dd>${escapeHTML(service.deploy)}</dd></div>
        </dl>
        <div class="service-links">
          ${service.runbook ? `<button class="text-button" type="button" data-open-doc="${service.runbook}">${iconHTML('doc')}Runbook</button>` : ''}
          <button class="text-button" type="button" data-mock-link="${escapeHTML(service.name)} dashboard in Datadog">${iconHTML('status')}Dashboard</button>
        </div>
      </article>
    `).join('');
  }

  function setupStatus() {
    $$('[data-status-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        location.hash = `#/status/${button.dataset.statusTab}`;
      });
    });
    renderServices();
  }

  // Settings

  const settingsState = {
    push: true,
    routing: true,
    reviews: true,
    ci: true,
    incidents: true,
    mentions: true,
    dnd: true,
    agentRevoked: false,
    aiProvider: 'hosted'
  };

  function switchHTML(key, label, description, feature) {
    const on = settingsState[key];
    return `
      <div class="setting-row"${featureAttr(feature)}>
        <div><strong>${escapeHTML(label)}</strong>${description ? `<span>${escapeHTML(description)}</span>` : ''}</div>
        <button class="switch" type="button" role="switch" aria-checked="${on}" data-setting="${key}" aria-label="${escapeHTML(label)}"><span></span></button>
      </div>
    `;
  }

  function phaseChip(featureId) {
    const feature = featureById[featureId];
    if (!feature) return '';
    return `<span class="phase-chip">${escapeHTML(phaseById[feature.phase].label)}</span>`;
  }

  function renderSettingsIntegrations() {
    return `
      <section class="setting-card" data-feature="pr-threads">
        <header>${iconHTML('github', true)}<div><h2>GitHub App</h2><p>Installed on <strong>acme</strong> · 4 repositories</p></div><span class="pill pill--ok">Connected</span></header>
        <table class="data-table data-table--compact">
          <thead><tr><th>Repository</th><th>Channel</th><th>Posts</th></tr></thead>
          <tbody>
            <tr><td class="mono">acme/checkout</td><td><a href="#/chat/payments">#payments</a></td><td class="muted-cell">PR threads, failing checks on main</td></tr>
            <tr><td class="mono">acme/web</td><td><a href="#/chat/design">#design</a></td><td class="muted-cell">PR threads</td></tr>
            <tr><td class="mono">acme/platform</td><td><a href="#/chat/releases">#releases</a></td><td class="muted-cell">Deploys</td></tr>
            <tr><td class="mono">acme/mobile</td><td class="muted-cell">Not mapped</td><td><button class="text-button" type="button" data-mock-link="channel mapping for acme/mobile">Map to a channel</button></td></tr>
          </tbody>
        </table>
      </section>

      <section class="setting-card" data-feature="slack-bridge">
        <header>${iconHTML('slack')}<div><h2>Slack</h2><p>Run Relay beside Slack while the team trials it.</p></div><span class="pill pill--ok">Bridge on</span></header>
        <div class="bridge-row">
          <a href="#/chat/design" class="bridge-end">#design</a>
          <span class="bridge-arrow">${iconHTML('sync')}Two-way</span>
          <span class="bridge-end">Slack #design</span>
          <span class="muted">In sync · 0 dropped · last message 2 min ago</span>
        </div>
        <div class="setting-actions">
          <button class="button button--secondary button--small" type="button" data-mock-link="bridge setup for another Slack channel">${iconHTML('plus')}Bridge another channel</button>
          <button class="button button--secondary button--small" type="button" data-mock-link="Slack import (public channels, users, history)" data-feature="slack-import">Import from Slack ${phaseChip('slack-import')}</button>
        </div>
      </section>

      <div class="setting-grid">
        <section class="setting-card setting-card--small" data-feature="native-integrations">
          <header>${iconHTML('bell')}<div><h2>PagerDuty</h2><p>On-call for the service catalog and incident rooms.</p></div><span class="pill pill--ok">Connected</span></header>
        </section>
        <section class="setting-card setting-card--small" data-feature="native-integrations">
          <header>${iconHTML('alert')}<div><h2>Sentry</h2><p>Errors unfurl with stack frames resolved to the repo.</p></div><span class="pill pill--ok">Connected</span></header>
        </section>
        <section class="setting-card setting-card--small setting-card--muted" data-feature="gitlab">
          <header>${iconHTML('branch')}<div><h2>GitLab</h2><p>The provider interface is ready; GitHub ships first.</p></div><span class="pill">Later</span></header>
        </section>
        <section class="setting-card setting-card--small setting-card--muted" data-feature="gitlab">
          <header>${iconHTML('list')}<div><h2>Linear</h2><p>Message → issue for Linear teams.</p></div><span class="pill">Later</span></header>
        </section>
      </div>
    `;
  }

  function renderSettingsNotifications() {
    return `
      <section class="setting-card">
        <header>${iconHTML('bell')}<div><h2>Delivery</h2><p>How Relay reaches you when you’re not looking at it.</p></div></header>
        ${switchHTML('push', 'Push to this browser and your phone', 'Web Push via the installed PWA. Required for on-call.', 'push')}
        ${switchHTML('dnd', 'Do Not Disturb 22:00–08:00', 'Incidents for services you own still come through.', 'notif-rules')}
      </section>
      <section class="setting-card" data-feature="owner-routing">
        <header>${iconHTML('server')}<div><h2>Ownership routing</h2><p>Notify owners from CODEOWNERS and the service catalog, not whole channels.</p></div></header>
        ${switchHTML('routing', 'Route by ownership', 'You own apps/api/src/webhooks/ and checkout-api.')}
        ${switchHTML('reviews', 'Review requests', 'Including PRs opened by agents.')}
        ${switchHTML('ci', 'Failing checks on code I own', 'Only on main and on my PRs.')}
        ${switchHTML('incidents', 'Incidents for services I own', '')}
        ${switchHTML('mentions', '@mentions and replies', '')}
      </section>
      <section class="setting-card" data-feature="notif-rules">
        <header>${iconHTML('tag')}<div><h2>Keywords</h2><p>Also notify me when these appear in channels I’m in.</p></div></header>
        <div class="keyword-list"><span class="pill">webhook</span><span class="pill">apple pay</span><span class="pill">checkout-api</span><button class="text-button" type="button" data-mock-link="keyword editor">${iconHTML('plus')}Add</button></div>
      </section>
    `;
  }

  function renderSettingsDevelopers() {
    const agentStatus = settingsState.agentRevoked
      ? '<span class="pill pill--danger">Revoked</span>'
      : '<span class="pill pill--ok">Active</span>';

    return `
      <section class="setting-card" data-feature="tokens-webhooks">
        <header>${iconHTML('key')}<div><h2>API tokens</h2><p>Hashed at rest, scoped to this workspace, revocable.</p></div><button class="button button--secondary button--small" type="button" data-mock-link="new token form">${iconHTML('plus')}New token</button></header>
        <table class="data-table data-table--compact">
          <thead><tr><th>Name</th><th>Token</th><th>Scopes</th><th>Last used</th></tr></thead>
          <tbody>
            <tr><td>ci-deploy</td><td class="mono">rly_8f2c…a41</td><td>post</td><td class="muted-cell">18 min ago</td></tr>
            <tr><td>alex-cli</td><td class="mono">rly_c73e…0b9</td><td>read, post, search</td><td class="muted-cell">Today</td></tr>
          </tbody>
        </table>
        <div class="code-block"><pre><code>curl -X POST https://relay.dev/api/hooks/7Kq2… \\
  -d '{"channel":"#releases","text":"Deployed v2.14.1"}'</code></pre><button class="copy-code" type="button">Copy</button></div>
      </section>

      <section class="setting-card" data-feature="agents">
        <header>${iconHTML('bot')}<div><h2>Agents</h2><p>Agents post as themselves, only in the channels you allow. Every run is audited.</p></div></header>
        <div class="agent-row">
          <span class="avatar avatar--agent">${iconHTML('bot')}</span>
          <div><strong>Claude Code</strong><span>Scoped to #payments · added by Jonas Berg · last run 10:06 AM</span></div>
          ${agentStatus}
          <button class="button button--quiet button--small" type="button" data-revoke-agent ${settingsState.agentRevoked ? 'disabled' : ''}>Revoke</button>
        </div>
      </section>

      <div class="setting-grid">
        <section class="setting-card" data-feature="cli-v0 cli-v1">
          <header>${iconHTML('terminal')}<div><h2>CLI</h2><p>Post, search and tail from the terminal.</p></div></header>
          <div class="code-block"><pre><code>npm i -g @relay/cli
relay login
relay send "#releases" "Deployed v2.14.1"
relay tail "#payments"</code></pre><button class="copy-code" type="button">Copy</button></div>
        </section>
        <section class="setting-card" data-feature="mcp">
          <header>${iconHTML('plug')}<div><h2>MCP server</h2><p>Scoped read/post tools for coding agents.</p></div></header>
          <div class="code-block"><pre><code>{
  "mcpServers": {
    "relay": {
      "command": "relay",
      "args": ["mcp", "--channels", "#payments"]
    }
  }
}</code></pre><button class="copy-code" type="button">Copy</button></div>
        </section>
      </div>
    `;
  }

  function renderSettingsPlan() {
    return `
      <section class="setting-card" data-feature="entitlements">
        <header>${iconHTML('card')}<div><h2>Team trial</h2><p>9 days left. Plans are assigned by Relay during the pilot.</p></div><span class="pill pill--ok">Team</span></header>
        <ul class="entitlements">
          <li>${iconHTML('check')}Review inbox and PR threads</li>
          <li>${iconHTML('check')}Slack bridge</li>
          <li>${iconHTML('check')}CLI, MCP and agents</li>
          <li><span class="meter"><span style="width: 40%"></span></span>Integrations · 4 of 10</li>
          <li><span class="meter"><span style="width: 3%"></span></span>Files · 3.2 of 100 GB</li>
        </ul>
      </section>
      <section class="setting-card setting-card--muted" data-feature="stripe">
        <header>${iconHTML('card')}<div><h2>Billing</h2><p>Checkout, invoices and seat sync arrive with Stripe at GA. Until then nothing here asks for a card.</p></div>${phaseChip('stripe')}</header>
      </section>
      <section class="setting-card" data-feature="ai-controls">
        <header>${iconHTML('sparkle')}<div><h2>Relay AI</h2><p>Opt-in. Never trained on your data. Answers cite only what you can see.</p></div>${phaseChip('ai-controls')}</header>
        <div class="segmented" role="radiogroup" aria-label="AI provider">
          <button type="button" role="radio" aria-checked="${settingsState.aiProvider === 'hosted'}" data-ai-provider="hosted">Hosted model</button>
          <button type="button" role="radio" aria-checked="${settingsState.aiProvider === 'byo'}" data-ai-provider="byo">Bring your own key</button>
        </div>
        <div class="setting-row"><div><strong>Monthly budget</strong><span>$200 · $38 used this month</span></div><span class="meter meter--wide"><span style="width: 19%"></span></span></div>
        <div class="setting-row"><div><strong>Channels AI never reads</strong><span>#people-ops, #legal</span></div><button class="text-button" type="button" data-mock-link="AI opt-out editor">Edit</button></div>
      </section>
    `;
  }

  const settingsRenderers = {
    integrations: renderSettingsIntegrations,
    notifications: renderSettingsNotifications,
    developers: renderSettingsDevelopers,
    plan: renderSettingsPlan
  };

  function renderSettings() {
    const content = $('#settings-content');
    if (!content) return;
    const tab = settingsRenderers[state.settingsTab] ? state.settingsTab : 'integrations';

    $$('[data-settings-tab]').forEach((button) => {
      const active = button.dataset.settingsTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });

    content.innerHTML = settingsRenderers[tab]();
  }

  function setupSettings() {
    $$('[data-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        location.hash = `#/settings/${button.dataset.settingsTab}`;
      });
    });

    const content = $('#settings-content');
    if (content) {
      content.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-setting]');
        if (toggle) {
          const key = toggle.dataset.setting;
          settingsState[key] = !settingsState[key];
          toggle.setAttribute('aria-checked', String(settingsState[key]));
          return;
        }

        if (event.target.closest('[data-revoke-agent]')) {
          settingsState.agentRevoked = true;
          renderSettings();
          showToast('Claude Code’s token is revoked. Its posts stop now, and the revoke is in the audit log.');
          return;
        }

        const provider = event.target.closest('[data-ai-provider]');
        if (provider) {
          settingsState.aiProvider = provider.dataset.aiProvider;
          renderSettings();
        }
      });
    }

    renderSettings();
  }

  // Roadmap

  const decisionLabels = { build: 'Build', later: 'Later', cut: 'Cut' };
  let roadmapDecisions = {};

  function loadDecisions() {
    try {
      roadmapDecisions = JSON.parse(localStorage.getItem('relay-roadmap-v2') || '{}') || {};
    } catch (error) {
      roadmapDecisions = {};
    }
  }

  function saveDecisions() {
    try {
      localStorage.setItem('relay-roadmap-v2', JSON.stringify(roadmapDecisions));
    } catch (error) {}
  }

  function decisionFor(feature) {
    return roadmapDecisions[feature.id] || defaultDecision(feature);
  }

  function isChanged(feature) {
    return decisionFor(feature) !== defaultDecision(feature);
  }

  function renderRoadmapSummary() {
    const summary = $('#roadmap-summary');
    if (!summary) return;

    const counts = { build: 0, later: 0, cut: 0 };
    features.forEach((feature) => { counts[decisionFor(feature)] += 1; });
    const changed = features.filter(isChanged).length;
    const prototyped = features.filter((feature) => feature.route).length;

    summary.innerHTML = `
      <div class="roadmap-stats">
        <div class="stat stat--build"><strong>${counts.build}</strong><span>Build</span></div>
        <div class="stat stat--later"><strong>${counts.later}</strong><span>Later</span></div>
        <div class="stat stat--cut"><strong>${counts.cut}</strong><span>Cut</span></div>
        <div class="stat"><strong>${changed}</strong><span>Changed from plan</span></div>
        <div class="stat"><strong>${prototyped}</strong><span>Shown in prototype</span></div>
      </div>
      <div class="roadmap-callouts">
        <div class="callout callout--milestone">
          <strong>${iconHTML('github', true)}First milestone · about week 10</strong>
          <p>A design partner signs up with GitHub, sees a real PR become a thread in #payments, and replies there to have it land on GitHub.</p>
          <button class="text-button" type="button" data-goto-feature="pr-sync">See it in the prototype ${iconHTML('arrow-right')}</button>
        </div>
        <div class="callout" data-feature="kill-criteria" id="kill-criteria">
          <strong>${iconHTML('alert')}Kill criteria</strong>
          <ul>
            <li>After the Phase 2 pilot: fewer than 2 of 3 partners use PR threads weekly → re-interview before Phase 3.</li>
            <li>After Phase 3: no team moves a second channel off Slack within 30 days → investigate before Phase 4.</li>
            <li>Before Phase 6: activation below 20% → fix activation before AI.</li>
          </ul>
        </div>
      </div>
    `;
  }

  function renderRoadmap() {
    const root = $('#roadmap');
    if (!root) return;

    const filter = state.roadmapFilter;

    $$('[data-roadmap-filter]').forEach((button) => {
      const active = button.dataset.roadmapFilter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    root.innerHTML = phases.map((phase) => {
      const items = features.filter((feature) => {
        if (feature.phase !== phase.id) return false;
        if (filter === 'prototyped') return Boolean(feature.route);
        if (filter === 'changed') return isChanged(feature);
        return true;
      });
      if (!items.length) return '';

      return `
        <section class="roadmap-phase roadmap-phase--${phase.id}${phase.milestone ? ' is-milestone' : ''}" aria-labelledby="phase-${phase.id}">
          <header class="roadmap-phase-head">
            <div>
              <span class="phase-chip">${escapeHTML(phase.label)}</span>
              <h2 id="phase-${phase.id}">${escapeHTML(phase.title)}</h2>
              <p>${escapeHTML(phase.goal)}</p>
            </div>
            <span class="phase-weeks">${escapeHTML(phase.weeks)}</span>
          </header>
          <div class="roadmap-features">
            ${items.map((feature) => {
              const decision = decisionFor(feature);
              const changed = isChanged(feature);
              return `
                <div class="roadmap-feature is-${decision}${changed ? ' is-changed' : ''}">
                  <div class="roadmap-feature-copy">
                    <strong>${escapeHTML(feature.title)}${changed ? `<span class="changed-note">plan: ${decisionLabels[defaultDecision(feature)]}</span>` : ''}</strong>
                    <span>${escapeHTML(feature.desc)}</span>
                  </div>
                  ${feature.route
                    ? `<button class="button button--secondary button--small" type="button" data-goto-feature="${feature.id}">View ${iconHTML('arrow-right')}</button>`
                    : '<span class="not-prototyped">Not in prototype</span>'}
                  <div class="segmented segmented--decision" role="radiogroup" aria-label="Decision for ${escapeHTML(feature.title)}">
                    ${['build', 'later', 'cut'].map((value) => `<button type="button" role="radio" aria-checked="${decision === value}" data-decide="${feature.id}" data-value="${value}">${decisionLabels[value]}</button>`).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('') || '<div class="library-empty"><h2>Nothing changed yet</h2><p>Features you move away from the plan’s default show up here.</p></div>';

    renderRoadmapSummary();
  }

  function roadmapMarkdown() {
    const lines = ['# Relay roadmap decisions', '', '_Plan v2 · exported from the prototype_', ''];

    ['build', 'later', 'cut'].forEach((value) => {
      const items = features.filter((feature) => decisionFor(feature) === value);
      lines.push(`## ${decisionLabels[value]} (${items.length})`, '');
      items.forEach((feature) => lines.push(`- **${phaseById[feature.phase].label}** · ${feature.title}`));
      lines.push('');
    });

    const changed = features.filter(isChanged);
    lines.push('## Changed from plan', '');
    if (!changed.length) lines.push('- None');
    changed.forEach((feature) => {
      lines.push(`- ${feature.title}: plan said ${decisionLabels[defaultDecision(feature)]}, now ${decisionLabels[decisionFor(feature)]}`);
    });

    return lines.join('\n');
  }

  function setupRoadmap() {
    loadDecisions();

    $$('[data-roadmap-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.roadmapFilter = button.dataset.roadmapFilter;
        renderRoadmap();
      });
    });

    const root = $('#roadmap');
    if (root) {
      root.addEventListener('click', (event) => {
        const decide = event.target.closest('[data-decide]');
        if (!decide) return;
        const feature = featureById[decide.dataset.decide];
        if (decide.dataset.value === defaultDecision(feature)) {
          delete roadmapDecisions[feature.id];
        } else {
          roadmapDecisions[feature.id] = decide.dataset.value;
        }
        saveDecisions();
        renderRoadmap();
        const again = $(`[data-decide="${feature.id}"][data-value="${decide.dataset.value}"]`);
        if (again) again.focus();
      });
    }

    const reset = $('#roadmap-reset');
    if (reset) {
      reset.addEventListener('click', () => {
        roadmapDecisions = {};
        saveDecisions();
        renderRoadmap();
        showToast('Decisions reset to plan v2');
      });
    }

    const exportButton = $('#roadmap-export');
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        copyText(roadmapMarkdown())
          .then(() => showToast('Decisions copied as Markdown'))
          .catch(() => showToast('Could not copy to the clipboard.'));
      });
    }

    renderRoadmap();
  }

  function goToFeature(featureId) {
    const feature = featureById[featureId];
    if (!feature || !feature.route) return;
    state.pendingFeature = featureId;

    if (location.hash === feature.route) {
      handleRoute();
    } else {
      location.hash = feature.route;
    }
  }

  function flashPendingFeature() {
    const featureId = state.pendingFeature;
    if (!featureId) return;
    state.pendingFeature = null;

    const feature = featureById[featureId];
    window.setTimeout(() => {
      const selector = feature && feature.target ? `#${feature.target}` : `[data-feature~="${featureId}"]`;
      const element = $$(selector).find((item) => item.offsetParent !== null);
      if (element) {
        flashElement(element);
      }
      if (feature) showToast(`${phaseById[feature.phase].label} · ${feature.title}`);
    }, 40);
  }

  // Plan tags

  function applyPlanTags() {
    $$('[data-feature]').forEach((element) => {
      const ids = element.dataset.feature.split(/\s+/).filter((id) => featureById[id]);
      if (!ids.length) return;
      const first = featureById[ids[0]];
      const phase = phaseById[first.phase];
      const short = phase.id.startsWith('p') ? `P${phase.id.slice(1)}` : phase.label;
      const label = `${short} · ${first.title}${ids.length > 1 ? ` +${ids.length - 1}` : ''}`;
      if (element.dataset.planTag !== label) element.dataset.planTag = label;
    });
  }

  function setPlanTags(on) {
    document.body.classList.toggle('show-plan-tags', on);
    const toggle = $('#plan-tags-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(on));
      toggle.setAttribute('title', on ? 'Hide plan phase tags' : 'Show plan phase tags');
      toggle.setAttribute('aria-label', on ? 'Hide plan phase tags' : 'Show plan phase tags');
    }
    try {
      localStorage.setItem('relay-plan-tags', on ? '1' : '0');
    } catch (error) {}
  }

  function setupPlanTags() {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applyPlanTags();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    applyPlanTags();

    let saved = false;
    try {
      saved = localStorage.getItem('relay-plan-tags') === '1';
    } catch (error) {}
    setPlanTags(saved);

    const toggle = $('#plan-tags-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => setPlanTags(!document.body.classList.contains('show-plan-tags')));
    }

    document.addEventListener('click', (event) => {
      const goto = event.target.closest('[data-goto-feature]');
      if (!goto) return;
      event.preventDefault();
      goToFeature(goto.dataset.gotoFeature);
    });
  }

  // Command palette

  let paletteItems = [];
  let paletteIndex = 0;
  let paletteTrigger = null;

  function buildPaletteEntries() {
    const entries = [
      { label: 'Chat', hint: 'Screen', icon: 'chat', route: '#/chat' },
      { label: 'Inbox', hint: 'Screen', icon: 'inbox', route: '#/inbox' },
      { label: 'Status · Deployments', hint: 'Screen', icon: 'status', route: '#/status/deployments' },
      { label: 'Status · Pipelines', hint: 'Screen', icon: 'status', route: '#/status/pipelines' },
      { label: 'Status · Incidents', hint: 'Screen', icon: 'status', route: '#/status/incidents' },
      { label: 'Status · Services', hint: 'Screen', icon: 'server', route: '#/status/services' },
      { label: 'Library', hint: 'Screen', icon: 'library', route: '#/library' },
      { label: 'Settings · Integrations', hint: 'Screen', icon: 'settings', route: '#/settings/integrations' },
      { label: 'Settings · Notifications', hint: 'Screen', icon: 'settings', route: '#/settings/notifications' },
      { label: 'Settings · Tokens & agents', hint: 'Screen', icon: 'settings', route: '#/settings/developers' },
      { label: 'Settings · Plan', hint: 'Screen', icon: 'settings', route: '#/settings/plan' },
      { label: 'Roadmap', hint: 'Screen', icon: 'map', route: '#/roadmap' }
    ];

    channelOrder.concat(dmOrder).forEach((id) => {
      entries.push({ label: channelLabel(id), hint: channels[id].kind === 'dm' ? 'Direct message' : 'Channel', icon: channels[id].kind === 'dm' ? 'chat' : 'chat', route: `#/chat/${id}` });
    });

    features.filter((feature) => feature.route).forEach((feature) => {
      entries.push({ label: feature.title, hint: `${phaseById[feature.phase].label} feature`, icon: 'map', feature: feature.id });
    });

    documents.forEach((doc) => {
      entries.push({ label: doc.title, hint: kindLabels[doc.kind], icon: doc.kind === 'decision' ? 'decision' : 'doc', route: `#/library/${doc.id}` });
    });

    return entries;
  }

  function renderPalette() {
    const input = $('#palette-input');
    const results = $('#palette-results');
    if (!input || !results) return;

    const query = input.value.trim().toLowerCase();
    paletteItems = buildPaletteEntries()
      .filter((entry) => !query || `${entry.label} ${entry.hint}`.toLowerCase().includes(query))
      .slice(0, 14);

    if (paletteIndex >= paletteItems.length) paletteIndex = 0;

    results.innerHTML = paletteItems.length
      ? paletteItems.map((entry, index) => `
          <button class="palette-item${index === paletteIndex ? ' is-active' : ''}" type="button" role="option" aria-selected="${index === paletteIndex}" data-palette-index="${index}" id="palette-option-${index}">
            ${iconHTML(entry.icon)}
            <span>${escapeHTML(entry.label)}</span>
            <small>${escapeHTML(entry.hint)}</small>
          </button>
        `).join('')
      : '<p class="palette-empty">No matches. Try a channel, a feature or a doc title.</p>';

    input.setAttribute('aria-activedescendant', paletteItems.length ? `palette-option-${paletteIndex}` : '');
    const active = $('.palette-item.is-active', results);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    const overlay = $('#palette-overlay');
    const input = $('#palette-input');
    if (!overlay || !input) return;
    paletteTrigger = document.activeElement;
    overlay.hidden = false;
    input.value = '';
    paletteIndex = 0;
    renderPalette();
    requestAnimationFrame(() => input.focus());
  }

  function closePalette(options = {}) {
    const overlay = $('#palette-overlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (options.restoreFocus !== false && paletteTrigger && document.contains(paletteTrigger)) paletteTrigger.focus();
  }

  function choosePalette(index) {
    const entry = paletteItems[index];
    if (!entry) return;
    closePalette({ restoreFocus: false });
    if (entry.feature) {
      goToFeature(entry.feature);
    } else {
      location.hash = entry.route;
    }
  }

  function setupPalette() {
    const overlay = $('#palette-overlay');
    const input = $('#palette-input');
    const results = $('#palette-results');
    const trigger = $('#palette-trigger');

    if (trigger) trigger.addEventListener('click', openPalette);

    if (input) {
      input.addEventListener('input', () => {
        paletteIndex = 0;
        renderPalette();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1);
          renderPalette();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          paletteIndex = Math.max(paletteIndex - 1, 0);
          renderPalette();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          choosePalette(paletteIndex);
        }
      });
    }

    if (results) {
      results.addEventListener('click', (event) => {
        const item = event.target.closest('[data-palette-index]');
        if (item) choosePalette(Number(item.dataset.paletteIndex));
      });
    }

    if (overlay) {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closePalette();
      });
    }
  }

  function setupGlobalActions() {
    const themeToggle = $('#theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    document.addEventListener('click', (event) => {
      const docTrigger = event.target.closest('[data-open-doc]');
      if (docTrigger) {
        event.preventDefault();
        openDocument(docTrigger.dataset.openDoc, { trigger: docTrigger });
        return;
      }

      const mockLink = event.target.closest('[data-mock-link]');
      if (mockLink) {
        event.preventDefault();
        showToast(`Prototype: ${mockLink.dataset.mockLink} would open in your connected source.`);
        return;
      }

      const copyButton = event.target.closest('.copy-code');
      if (copyButton) {
        const block = copyButton.closest('.code-block');
        const code = block ? block.querySelector('code') : null;
        if (!code) return;

        copyText(code.textContent).then(() => {
          const original = copyButton.textContent;
          copyButton.textContent = 'Copied';
          window.setTimeout(() => {
            copyButton.textContent = original;
          }, 1400);
        }).catch(() => {
          showToast('Could not copy to the clipboard.');
        });
      }
    });

    updateThemeButton();
  }

  function matchesLibraryQuery(document, query) {
    if (!query) return true;

    const haystack = [
      document.title,
      document.summary,
      document.body,
      document.owner,
      document.status || '',
      (document.tags || []).join(' ')
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  }

  function renderDocRow(document) {
    const status = document.status ? `<span>${escapeHTML(document.status)}</span>` : '';

    return `
      <button class="doc-row" type="button" data-open-doc="${escapeHTML(document.id)}" aria-label="Open ${escapeHTML(document.title)}">
        <span class="doc-glyph doc-glyph--${document.kind}">${docIconHTML(document.kind)}</span>
        <span class="doc-copy">
          <span class="doc-title">${escapeHTML(document.title)}</span>
          <span class="doc-summary-text">${escapeHTML(document.summary)}</span>
          <span class="doc-meta"><span>${escapeHTML(document.owner)}</span><span>Updated ${escapeHTML(document.updated)}</span>${status}</span>
        </span>
        <svg class="icon doc-arrow" aria-hidden="true"><use href="#i-arrow-right"/></svg>
      </button>
    `;
  }

  function renderDocList(items) {
    return `<div class="doc-list">${items.map(renderDocRow).join('')}</div>`;
  }

  function renderBoardCard(document) {
    return `
      <button class="board-card" type="button" data-open-doc="${escapeHTML(document.id)}" aria-label="Open ${escapeHTML(document.title)}">
        <span class="board-card-kicker">${docIconHTML(document.kind)}${kindLabels[document.kind]}</span>
        <h4>${escapeHTML(document.title)}</h4>
        <p>${escapeHTML(document.summary)}</p>
        <span class="board-card-footer">
          <span class="avatar avatar--${document.ownerTone} avatar--xxs">${escapeHTML(document.ownerInitials)}</span>
          <span>${escapeHTML(firstName(document.owner))}</span>
          <time>${escapeHTML(document.updated)}</time>
        </span>
      </button>
    `;
  }

  function renderBoard(items, collection) {
    const columns = boardColumns[collection] || [];

    return `
      <div class="board">
        ${columns.map((column) => {
          const columnItems = items.filter((document) => document.status === column);
          return `
            <section class="board-column" aria-label="${escapeHTML(column)}">
              <header class="board-column-head">
                <h3>${escapeHTML(column)}</h3>
                <span class="count">${columnItems.length}</span>
              </header>
              <div class="board-cards">
                ${columnItems.map(renderBoardCard).join('') || '<div class="board-empty">No documents</div>'}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderLibrary() {
    const collection = state.libraryCollection;
    const query = state.libraryQuery.trim().toLowerCase();
    const isDocuments = collection === 'documents';
    const mode = isDocuments ? 'list' : state.libraryMode[collection];
    const allItems = docsFor(collection);
    const visibleItems = allItems.filter((document) => matchesLibraryQuery(document, query));

    $$('[data-library-tab]').forEach((button) => {
      const active = button.dataset.libraryTab === collection;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });

    ['documents', 'decisions', 'design'].forEach((key) => {
      const count = $(`[data-library-count="${key}"]`);
      if (count) count.textContent = String(docsFor(key).length);
    });

    const switchElement = $('#library-view-switch');
    if (switchElement) switchElement.hidden = isDocuments;

    $$('[data-library-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.libraryMode === mode));
    });

    const content = $('#library-content');
    if (!content) return;

    if (!visibleItems.length) {
      const heading = query ? 'No matches' : 'Nothing here yet';
      const copy = query
        ? `No documents match “${escapeHTML(state.libraryQuery.trim())}”.`
        : 'New documents will appear here.';
      content.innerHTML = `<div class="library-empty"><h2>${heading}</h2><p>${copy}</p></div>`;
      return;
    }

    content.innerHTML = mode === 'board' ? renderBoard(visibleItems, collection) : renderDocList(visibleItems);
  }

  function setupLibrary() {
    $$('[data-library-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.libraryCollection = button.dataset.libraryTab;
        state.libraryQuery = '';
        const search = $('#library-search');
        if (search) search.value = '';
        renderLibrary();
      });
    });

    $$('[data-library-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        if (state.libraryCollection === 'documents') return;
        state.libraryMode[state.libraryCollection] = button.dataset.libraryMode;
        renderLibrary();
      });
    });

    const search = $('#library-search');
    if (search) {
      search.addEventListener('input', () => {
        state.libraryQuery = search.value;
        renderLibrary();
      });
    }

    const newDocument = $('#new-document');
    if (newDocument) {
      newDocument.addEventListener('click', () => openEditor(null, { trigger: newDocument }));
    }

    renderLibrary();
  }

  function openDocument(id, options = {}) {
    const document = getDoc(id);
    const overlay = $('#doc-overlay');
    if (!document || !overlay) return;

    if (options.trigger) state.docTrigger = options.trigger;
    if (!state.docTrigger) state.docTrigger = document.activeElement;
    state.activeDocId = id;

    const kind = $('#doc-kind');
    const type = $('#doc-type');
    const title = $('#doc-title');
    const summary = $('#doc-summary');
    const owner = $('#doc-owner');
    const updated = $('#doc-updated');
    const source = $('#doc-source');
    const status = $('#doc-status');
    const body = $('#doc-body');
    const avatar = $('#doc-owner-avatar');

    if (kind) kind.textContent = kindLabels[document.kind];
    if (type) type.textContent = document.kind === 'decision' ? 'Decision record' : document.kind === 'design' ? 'Design note' : 'Document';
    if (title) title.textContent = document.title;
    if (summary) summary.textContent = document.summary;
    if (owner) owner.textContent = document.owner;
    if (updated) updated.textContent = `Updated ${document.updated}`;
    if (source) source.textContent = document.source;
    if (body) body.innerHTML = renderMarkdown(document.body);

    if (status) {
      status.hidden = !document.status;
      status.textContent = document.status || '';
    }

    if (avatar) {
      avatar.className = `avatar avatar--xs avatar--${document.ownerTone}`;
      avatar.textContent = document.ownerInitials;
    }

    overlay.hidden = false;

    if (state.view === 'library' && options.updateHash !== false) {
      history.replaceState(null, '', `#/library/${encodeURIComponent(document.id)}`);
    }

    if (options.focus !== false) {
      requestAnimationFrame(() => {
        const modal = $('.modal--document', overlay);
        if (modal) modal.focus();
      });
    }
  }

  function closeDocument(options = {}) {
    const overlay = $('#doc-overlay');
    if (!overlay || overlay.hidden) return;

    overlay.hidden = true;
    state.activeDocId = null;

    if (options.updateHash !== false && location.hash.startsWith('#/library/')) {
      history.replaceState(null, '', '#/library');
    }

    if (options.restoreFocus !== false) {
      const trigger = state.docTrigger;
      state.docTrigger = null;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
    }
  }

  function copyDocumentLink() {
    if (!state.activeDocId) return;

    const url = `${location.href.split('#')[0]}#/library/${encodeURIComponent(state.activeDocId)}`;

    copyText(url).then(() => {
      showToast('Document link copied');
    }).catch(() => {
      showToast('Could not copy the document link.');
    });
  }

  function setupDocumentModal() {
    const overlay = $('#doc-overlay');
    if (!overlay) return;

    const close = $('#close-doc');
    const copy = $('#copy-doc-link');
    const edit = $('#edit-doc');

    if (close) close.addEventListener('click', () => closeDocument());
    if (copy) copy.addEventListener('click', copyDocumentLink);
    if (edit) {
      edit.addEventListener('click', () => {
        if (!state.activeDocId) return;
        openEditor(state.activeDocId, { trigger: edit });
      });
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDocument();
    });
  }

  function setEditorTab(tab) {
    state.editorTab = tab;
    const content = $('#editor-content');
    const preview = $('#editor-preview');
    const isPreview = tab === 'preview';

    $$('[data-editor-tab]').forEach((button) => {
      const active = button.dataset.editorTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });

    if (!content || !preview) return;

    content.hidden = isPreview;
    preview.hidden = !isPreview;

    if (isPreview) {
      const value = content.value.trim();
      preview.innerHTML = value
        ? renderMarkdown(value)
        : '<p class="editor-empty">Nothing to preview yet.</p>';
    }
  }

  function openEditor(docId, options = {}) {
    const doc = docId ? getDoc(docId) : null;
    const overlay = $('#editor-overlay');
    if (!overlay) return;

    state.editingDocId = doc ? doc.id : null;
    state.editorTrigger = options.trigger || document.activeElement;

    const docOverlay = $('#doc-overlay');
    state.editorReturnToDoc = Boolean(docOverlay && !docOverlay.hidden);
    if (docOverlay) docOverlay.hidden = true;

    const heading = $('#editor-heading');
    const titleInput = $('#editor-title');
    const content = $('#editor-content');
    const meta = $('#editor-meta');
    const submit = $('#editor-form button[type="submit"]');

    if (heading) heading.textContent = doc ? 'Edit document' : 'New document';
    if (titleInput) {
      titleInput.value = doc ? doc.title : '';
      titleInput.removeAttribute('aria-invalid');
    }
    if (content) content.value = doc ? doc.body : '';
    if (meta) meta.textContent = doc ? `Last saved ${doc.updated}` : 'Saved to your library';
    if (submit) submit.textContent = doc ? 'Save changes' : 'Save document';

    setEditorTab('write');
    overlay.hidden = false;

    requestAnimationFrame(() => {
      if (titleInput) titleInput.focus();
    });
  }

  function closeEditor(options = {}) {
    const overlay = $('#editor-overlay');
    if (!overlay || overlay.hidden) return;

    const editingDocId = state.editingDocId;
    const returnToDoc = state.editorReturnToDoc;
    const trigger = state.editorTrigger;

    overlay.hidden = true;
    state.editingDocId = null;
    state.editorReturnToDoc = false;

    if (options.restoreDocument && editingDocId && returnToDoc) {
      openDocument(editingDocId, { updateHash: false, trigger });
      return;
    }

    if (trigger && document.contains(trigger)) {
      requestAnimationFrame(() => trigger.focus());
    }
  }

  function saveEditor(event) {
    event.preventDefault();

    const titleInput = $('#editor-title');
    const contentInput = $('#editor-content');
    if (!titleInput || !contentInput) return;

    const title = titleInput.value.trim();
    if (!title) {
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      showToast('Give the document a title before saving.');
      return;
    }

    const body = contentInput.value;
    let doc = state.editingDocId ? getDoc(state.editingDocId) : null;
    let isNew = false;

    if (doc) {
      doc.title = title;
      doc.body = body;
      doc.updated = 'Just now';
    } else {
      isNew = true;
      doc = {
        id: uniqueDocId(title),
        kind: 'document',
        title,
        summary: summaryFromBody(body),
        owner: 'Alex Rivera',
        ownerInitials: 'AR',
        ownerTone: 'teal',
        updated: 'Just now',
        source: 'Created in Library',
        tags: [],
        body
      };
      documents.unshift(doc);
      state.libraryCollection = 'documents';
      state.libraryQuery = '';
      const search = $('#library-search');
      if (search) search.value = '';
    }

    const overlay = $('#editor-overlay');
    if (overlay) overlay.hidden = true;

    state.editingDocId = null;
    state.editorReturnToDoc = false;

    renderLibrary();
    openDocument(doc.id, { trigger: state.editorTrigger });
    showToast(isNew ? 'Document created' : 'Document saved');
  }

  function setupEditor() {
    const overlay = $('#editor-overlay');
    const form = $('#editor-form');
    const close = $('#close-editor');
    const cancel = $('#cancel-editor');
    const titleInput = $('#editor-title');
    const contentInput = $('#editor-content');

    if (form) form.addEventListener('submit', saveEditor);

    if (close) close.addEventListener('click', () => closeEditor({ restoreDocument: true }));
    if (cancel) cancel.addEventListener('click', () => closeEditor({ restoreDocument: true }));

    $$('[data-editor-tab]').forEach((button) => {
      button.addEventListener('click', () => setEditorTab(button.dataset.editorTab));
    });

    if (titleInput) {
      titleInput.addEventListener('input', () => titleInput.removeAttribute('aria-invalid'));
    }

    if (contentInput) {
      contentInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeEditor({ restoreDocument: true });
      });
    }
  }


  const views = ['chat', 'inbox', 'status', 'library', 'settings', 'roadmap'];
  const viewTitles = {
    chat: 'Chat',
    inbox: 'Inbox',
    status: 'Status',
    library: 'Library',
    settings: 'Settings',
    roadmap: 'Roadmap'
  };

  function setActiveView(view) {
    const nextView = views.includes(view) ? view : 'chat';
    state.view = nextView;

    $$('.view').forEach((element) => {
      element.classList.toggle('is-active', element.dataset.view === nextView);
    });

    $$('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === nextView;
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    updateActiveConversation();
    document.title = `${viewTitles[nextView]} · Relay`;
  }

  function decodeSegment(segment) {
    try {
      return decodeURIComponent(segment);
    } catch (error) {
      return segment;
    }
  }

  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '') || 'chat';
    const segments = raw.split('/').map(decodeSegment);
    const view = views.includes(segments[0]) ? segments[0] : 'chat';
    return { view, sub: segments[1] || null, extra: segments[2] || null };
  }

  function closeOpenEditorWithoutRestore() {
    const overlay = $('#editor-overlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    state.editingDocId = null;
    state.editorReturnToDoc = false;
  }

  function handleRoute() {
    const route = parseRoute();
    closeOpenEditorWithoutRestore();
    closePalette({ restoreFocus: false });

    if (route.view === 'library' && route.sub) {
      const doc = getDoc(route.sub);

      if (doc) {
        state.libraryCollection = collectionForKind[doc.kind];
        state.libraryQuery = '';
        const search = $('#library-search');
        if (search) search.value = '';

        setActiveView('library');
        renderLibrary();
        openDocument(doc.id, { updateHash: false });
        flashPendingFeature();
        return;
      }
    }

    if (!$('#doc-overlay').hidden) {
      closeDocument({ updateHash: false, restoreFocus: false });
    }

    setActiveView(route.view);

    if (route.view === 'chat') {
      if (route.sub && channels[route.sub]) selectChannel(route.sub);
      if (route.extra) {
        window.setTimeout(() => flashMessage(route.extra), 40);
      }
    }

    if (route.view === 'status') selectStatusTab(route.sub || 'deployments');

    if (route.view === 'settings') {
      state.settingsTab = route.sub || 'integrations';
      renderSettings();
    }

    if (route.view === 'roadmap') renderRoadmap();

    flashPendingFeature();
  }

  function trapModalFocus(event, overlay) {
    if (event.key !== 'Tab' || !overlay) return;

    const modal = $('.modal', overlay);
    if (!modal) return;

    const focusable = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
      .filter((element) => !element.disabled && !element.hidden && element.offsetParent !== null);

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setupKeyboard() {
    document.addEventListener('keydown', (event) => {
      const paletteOverlay = $('#palette-overlay');
      const editorOverlay = $('#editor-overlay');
      const docOverlay = $('#doc-overlay');

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (paletteOverlay && !paletteOverlay.hidden) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (paletteOverlay && !paletteOverlay.hidden) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePalette();
          return;
        }

        trapModalFocus(event, paletteOverlay);
        return;
      }

      if (editorOverlay && !editorOverlay.hidden) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeEditor({ restoreDocument: true });
          return;
        }

        trapModalFocus(event, editorOverlay);
        return;
      }

      if (docOverlay && !docOverlay.hidden) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDocument();
          return;
        }

        trapModalFocus(event, docOverlay);
      }
    });
  }

  function setupRouter() {
    window.addEventListener('hashchange', handleRoute);

    if (!location.hash) {
      history.replaceState(null, '', '#/chat/payments');
    }

    handleRoute();
  }

  function init() {
    setupChat();
    setupInbox();
    setupStatus();
    setupLibrary();
    setupSettings();
    setupRoadmap();
    setupGlobalActions();
    setupDocumentModal();
    setupEditor();
    setupPalette();
    setupPlanTags();
    setupKeyboard();
    setupRouter();
  }

  init();
})();
