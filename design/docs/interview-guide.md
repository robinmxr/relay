# Problem interview guide

For the 8–10 Phase 0 interviews. The goal is to learn how work happens today, **not** to pitch Relay. Talk about the past, not hypotheticals: "tell me about the last time…" beats "would you use…".

Length: 40 minutes · Two people: one asks, one takes notes · Record only with consent

---

## Screener (before booking)

Book only if all are true:

- [ ] Company has 10–100 engineers
- [ ] Code is on GitHub (note if GitLab, for open decision D4)
- [ ] Team uses Slack daily
- [ ] Interviewee is an engineering manager, staff/senior engineer, or on-call/SRE
- [ ] They have a real CI pipeline and review PRs weekly

Aim for a mix: at least 3 EMs or CTOs (buyers) and at least 4 hands-on engineers (users).

## Script

### 1. Context (5 min)

- What does your team build? How many engineers, how many teams?
- Walk me through the tools you have open on a normal day.

### 2. The last PR (10 min) — tests R1, R2

- Tell me about the last PR you reviewed that needed discussion. Where did the discussion happen?
- How did you find out it needed your review? How long did it wait?
- When a check failed on it, how did you find out why? What did you open?
- Does the GitHub app post into Slack? What do people do with those messages?

*Listen for:* tab-switching, missed review requests, discussions split between Slack and GitHub, "I muted that channel".

### 3. The last incident or bad deploy (8 min) — tests R1, hypothesis 4

- Tell me about the last time something broke in production. Where did coordination happen?
- What tools did you use? Who was paged and how?
- Afterwards, how did you find what was decided?

*Listen for:* incident tooling already in place (don't build), or none at all (opportunity).

### 4. Decisions and context (5 min)

- When did you last ask "why did we do it this way?" How did you find the answer?

### 5. Agents (4 min) — tests R5

- Do you or your team use coding agents (Claude Code, Cursor, Copilot agents)? Where does their output go? Who sees it?

### 6. Switching and buying (6 min) — tests R3, R4, R7

- If a better tool existed, how would your team try it? All at once, or one channel first?
- Who approves a new tool? What does security ask for?
- What do you pay for Slack and dev tools today? What felt expensive?
- *(EMs only)* At what price per seat would a tool like this be… a bargain / acceptable / getting expensive / too expensive to consider?

### 7. Close (2 min)

- What's the most annoying part of your week that we didn't talk about?
- Can we show you something in a few weeks? Would your team try it for 30 days?

## Do and don't

| Do | Don't |
|---|---|
| Ask for the last specific instance | Ask "would you use X?" |
| Let silences run | Fill silences with your idea |
| Ask "why?" twice | Accept "it's fine" without an example |
| Note exact quotes | Paraphrase in your own words |
| Ask to see their screen or Slack channel | Show the prototype before section 7 |

## Note template (fill within 24 hours)

```markdown
# Interview: <role>, <company size>, <date>

## Context
- Team size / tools / GitHub or GitLab / incident tooling:

## Top pains (ranked by them, not us)
1.
2.
3.

## Evidence for each research question
- R1 (biggest context switch):
- R2 (would reply in chat?):
- R3 (trial alongside Slack?):
- R4 (price band):
- R5 (agents):
- R7 (security requirements):

## Hypotheses (held / broken / unclear)
1.  2.  3.  4.  5.

## Best quotes
- ""

## Design partner?
- Interested in a 30-day pilot: yes / no / maybe — next step:
```
