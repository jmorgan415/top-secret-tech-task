# Demo: Cursor SDK vulnerability remediation

This is the walkthrough for the Field Engineer prototype. The Vue app in this repo is the **target** (a dated hang-gliding school site with planted issues). The pipeline lives in [`remediation-agent/`](remediation-agent/) and uses [`@cursor/sdk`](https://cursor.com/docs/sdk/typescript) to run Cursor agents programmatically — not a skill, not an in-IDE chat.

The root [`README.md`](README.md) is only the Vue CLI app setup. This file is the demo. One-minute slides live in [`slides/index.html`](slides/index.html) — open in a browser, `F` for fullscreen, arrows to advance, `S` for speaker notes.

```text
scan (deterministic)
  → triage (Cursor SDK, read-only)
    → policy gate (deterministic; model is not the last word)
      → fix (Cursor SDK, edit, no shell)  ─┬─→ verify (rebuild + rescan)
                                           └─ fail → git revert that commit
        → report + draft PR (always human-merged)
```

SDK starts in two places only:

- [`remediation-agent/src/agents/triage.ts`](remediation-agent/src/agents/triage.ts) — `Agent.create`, tools `read` / `grep` / `glob` / `ls`
- [`remediation-agent/src/agents/fix.ts`](remediation-agent/src/agents/fix.ts) — `Agent.create`, tools `read` / `edit` / `grep` / `glob` / `ls`

Everything else is plain TypeScript.

## Why the SDK (30 seconds)

A Cursor skill needs a human in the IDE. This pipeline has to run unattended (cron / CI), with per-stage tool allowlists, a policy gate that can override the model, per-resource isolation, and a verify/revert loop that writes git history. That is orchestration around agents.

Agents are **local** (`cwd` = this repo) so they see the same checkout CI just made. They are named so `npm run activity` can list them — local agents never appear on the cursor.com cloud dashboard. Model is pinned to `composer-2.5` (Cursor's coding agent; the SDK default).

## Planted issues in the target app

| What | Where | Why it's there |
|---|---|---|
| Vulnerable, **used** dependency | `semver@7.5.1` in `package.json`; imported in [`src/main.js`](src/main.js) | Happy path: patch bump, rebuild, finding gone |
| Vulnerable, **unused** direct dep | `lodash@4.17.19` | Agent may remove it; verify can still see *transitive* lodash and revert — that is in-scope, not a scanner bug |
| Critical unused dep | `wrangler@3.18.0` | Policy downgrades `auto-fix` → `draft-for-review` because critical never auto-applies |
| Unused-only dep | `core-js` | Auto-fix without spending an agent call on triage |
| EOL base image | [`Dockerfile`](Dockerfile) `FROM node:14.21-alpine` | Human-review runtime bump |
| Hardcoded secret | [`src/config.js`](src/config.js) (`AKIAIOSFODNN7EXAMPLE`) | Always **escalate**. Scanner redacts before anything hits an LLM prompt. Rotate; do not sed. |

Transitive CVEs show up in the scan and stay in the report. They never reach the fix agent: a one-file edit cannot honestly close a nested advisory.

## Prerequisites

From the repo root:

```bash
npm install
cd remediation-agent && npm install
```

Authenticate the SDK (either works; `Agent.create` resolves `CURSOR_API_KEY`, then `~/.cursor/sdk/auth.json`):

```bash
cd remediation-agent
npm run login
# or: export CURSOR_API_KEY=cursor_...
```

`npm run fix` / `npm run remediate` require a **clean git working tree**. They create a branch `remediation/<timestamp>` and commit per resource. Docker is optional: without it, Dockerfile verification is skipped rather than failed.

## Stage-by-stage walkthrough

Run these from `remediation-agent/`. Each stage has its own script so you can stop and talk, rather than opening with a full `remediate`.

### 1. Scan — deterministic, no model

**Code:** [`src/pipeline/scan.ts`](remediation-agent/src/pipeline/scan.ts) → adapters in [`src/adapters/`](remediation-agent/src/adapters/)

Four scanners, one `Finding` schema ([`src/schema/finding.ts`](remediation-agent/src/schema/finding.ts)):

| Adapter | Finding type | What it does |
|---|---|---|
| `npm-audit.ts` | `dependency-vulnerability` | Runs `npm audit --json`, maps severity, records `direct` / `fixedVersion` |
| `dependency-hygiene.ts` | `unused-dependency` | Direct `dependencies` with no `import`/`require` under `src/` |
| `dockerfile-lint.ts` | `eol-base-image` | `FROM` tags below a supported LTS (Node 22, Python 3.11) |
| `secret-scanning.ts` | `hardcoded-secret` | AWS key shape + credential-shaped assignments; values redacted |

```bash
npm run scan:all          # all four adapters
npm run scan:npm-audit    # audit only, with direct-vs-transitive split
```

Expect on the order of ~60 findings. Most are transitive noise. That is the point of the next two stages.

### 2. Triage — Cursor SDK (read-only)

**Code:** [`src/agents/triage.ts`](remediation-agent/src/agents/triage.ts)

Not every finding gets an agent call. Candidates must be **addressable** **and** high/critical:

- Addressable means a one-file fix on the **app runtime surface**: a package in `package.json` `"dependencies"`, the Dockerfile `FROM` line, or a secret in `src/`.
- npm's `isDirect` is not enough — it is also true for `devDependencies` (`@vue/cli-plugin-eslint`, babel, vue-cli). Those stay in the scan report as `no-action`.
- Transitive CVEs stay visible; they need a batched `overrides` pass this prototype does not attempt.
- Low/medium fall through to the policy gate (unused production deps can still auto-fix without an agent call).

The agent independently greps the repo for:

1. Reachability — is this used by app code, not just the lockfile?
2. Exploitability — is the vulnerable behavior actually invoked?
3. Classification — `auto-fix` | `draft-for-review` | `escalate`, plus confidence 0–1

Sandbox is on locally and off in CI (`CI=true`; GitHub-hosted runners reject the sandbox binary). Tool allowlists still apply either way.

```bash
npm run triage
```

This is the first SDK call. If the interviewer asks “where does the SDK start?”, open this file at `Agent.create`.

### 3. Policy gate — deterministic, overrides the model

**Code:** [`src/policy/gate.ts`](remediation-agent/src/policy/gate.ts)

Triage is an input, never the final action.

| Rule | Result |
|---|---|
| Any `hardcoded-secret` | `escalate` — even if triage says unused / fake |
| `auto-fix` + critical severity | downgrade to `draft-for-review` |
| `auto-fix` + confidence &lt; 0.6 | downgrade to `draft-for-review` |
| Unused-only, never triaged (medium) | `auto-fix` without an agent call |
| Everything else below threshold or transitive-only | `no-action` |

```bash
npm run plan    # scan + triage + gate; no edits
```

Best demo opener: run `plan`, read **Policy overrides** first (secret always escalates; wrangler `auto-fix` downgraded because critical never auto-applies), then the action buckets.

### 4. Fix — Cursor SDK (edit, no shell)

**Code:** [`src/agents/fix.ts`](remediation-agent/src/agents/fix.ts), orchestrated by [`src/pipeline/fix.ts`](remediation-agent/src/pipeline/fix.ts)

One new `Agent.create` per fixable resource (`auto-fix` or `draft-for-review`). Isolation is intentional: a bad fix must not leak context into the next resource. No `Agent.resume`.

Constraints the agent does not get to ignore:

- Prompt: edit **only** `package.json` or **only** the Dockerfile `FROM` line; do not run commands; do not touch the lockfile
- After `run.wait()`, git porcelain is diffed against the pre-run dirty set. Out-of-scope files → `git checkout --` those paths, outcome `rejected`
- No file changes → `rejected`
- Run status not `finished` → revert any touches, outcome `error`

Each applied fix is committed immediately:

```text
[<action>] <resourceIdentifier>: <one-sentence summary from the agent>
```

### 5. Verify — rebuild, rescan, maybe revert

**Code:** [`src/pipeline/verify.ts`](remediation-agent/src/pipeline/verify.ts)

Runs **immediately** after that resource's commit, while the commit is still HEAD. Batching verify to the end made `git revert` conflict when several fixes all edited `package.json`.

| Resource | Checks |
|---|---|
| `package.json` | `npm install` then `npm run build`, then a fresh scan |
| `Dockerfile` | `docker build` if Docker is available; otherwise `skipped` |

A finding of the **same type** still present on the same resource → `git revert --no-edit <sha>`, outcome `failed`.

That is why lodash can apply and then revert: removing the unused *direct* dep is correct, but npm audit may still report a *transitive* lodash CVE on `package.json::lodash`. Verification is matching `(file, identifier, type)`, and the CVE type is still there.

### 6. Report (+ draft PR in CI)

**Code:** [`src/pipeline/report.ts`](remediation-agent/src/pipeline/report.ts)

Writes gitignored JSON + markdown under `remediation-agent/reports/`.

```bash
npm run remediate    # steps 1–6 in one shot
```

Orchestrator: [`src/scripts/remediate.ts`](remediation-agent/src/scripts/remediate.ts).

In GitHub Actions ([`.github/workflows/remediation.yml`](.github/workflows/remediation.yml)):

- Triggers: daily `cron` at 06:00 UTC, path-filtered `push` to `main` (`package.json`, lockfile, `Dockerfile`, `src/**`), and **workflow_dispatch** (the demo button)
- Secret: `CURSOR_API_KEY`
- Always opens a **draft** PR if the branch is ahead of `main`. Auto-fix vs draft-for-review is a local policy label on the commit, not a license to auto-merge
- Uploads `remediation-agent/reports/` as an artifact even when the job fails

## Suggested live path (keep the full run in reserve)

1. Show planted issues: `package.json`, `Dockerfile`, `src/config.js`, `src/main.js`
2. `npm run scan:all` — noise vs signal
3. `npm run plan` — stdout leads with **Policy overrides** (secret escalate, wrangler downgraded), then triage verdicts, then buckets
4. Open `agents/triage.ts` and `agents/fix.ts` at `Agent.create`
5. Either `npm run remediate` **or** skip to an existing `reports/*.md` if time is tight
6. `npm run activity` — local agent history (`Agent.list({ runtime: "local", cwd })`)

Full `remediate` is several agent runs plus `npm install` / `npm run build` per applied fix. Do not start it as the first move unless you have time to let it finish.

## After a run — what “working” looks like

From the 2026-09-01 run (62 findings). Current `isAddressable` drops the Vue CLI eslint plugin (a `devDependency`); it would now be `no-action` instead of a verified fix.

| Resource | Policy | Fix | Verify |
|---|---|---|---|
| `semver` | auto-fix | applied | verified |
| `lodash` | auto-fix | applied | **failed (reverted)** |
| `wrangler` | draft-for-review | applied | verified |
| `core-js` | auto-fix | applied | verified |
| `Dockerfile` `node` | draft-for-review | applied | verified |
| AWS key in `src/config.js` | **escalate** | not attempted | — |

If it breaks in the room: say which stage died (auth / triage JSON parse / out-of-scope edit / verify revert) and why that stage is allowed to fail closed.

## File map

| Path | Role |
|---|---|
| [`remediation-agent/src/scripts/remediate.ts`](remediation-agent/src/scripts/remediate.ts) | End-to-end orchestrator |
| [`remediation-agent/src/pipeline/scan.ts`](remediation-agent/src/pipeline/scan.ts) | Adapter fan-out |
| [`remediation-agent/src/pipeline/plan.ts`](remediation-agent/src/pipeline/plan.ts) | Scan → triage → gate |
| [`remediation-agent/src/agents/triage.ts`](remediation-agent/src/agents/triage.ts) | **SDK start (read-only)** |
| [`remediation-agent/src/policy/gate.ts`](remediation-agent/src/policy/gate.ts) | Recommendations → actions |
| [`remediation-agent/src/agents/fix.ts`](remediation-agent/src/agents/fix.ts) | **SDK start (edit)** |
| [`remediation-agent/src/pipeline/fix.ts`](remediation-agent/src/pipeline/fix.ts) | Branch, per-resource commit |
| [`remediation-agent/src/pipeline/verify.ts`](remediation-agent/src/pipeline/verify.ts) | Rebuild / rescan / revert |
| [`remediation-agent/src/pipeline/report.ts`](remediation-agent/src/pipeline/report.ts) | JSON + markdown report |
| [`remediation-agent/src/util/sandbox.ts`](remediation-agent/src/util/sandbox.ts) | Sandbox on unless `CI` |
| [`.github/workflows/remediation.yml`](.github/workflows/remediation.yml) | Unattended trigger + draft PR |
