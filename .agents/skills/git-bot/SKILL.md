---
name: git-bot
description: Review a pull request with Git Bot by deriving a Kane browser objective, recording a bug-fix comparison, or reporting which checks are available.
---

# Git Bot

Use the Git Bot prototype to review a pull request from a coding-agent session. The skill does not grant GitHub, repository, preview, or Kane access; use the access and tools available in the session.

## Invocation

Accept a PR URL or a number that can be resolved from the current repository. If omitted, use the PR for the current branch when GitHub CLI can identify one. The default check is `video`.

- Claude Code: `/git-bot [PR URL or number] [video|migrations|preview|docs|bisect|all]`
- Codex: `$git-bot [PR URL or number] [video|migrations|preview|docs|bisect|all]`

Examples: `/git-bot 42 video` · `$git-bot https://github.com/acme/app/pull/42`

## Workflow

1. **Resolve the PR and repository.** Try the active checkout first. A full PR URL can identify a public or accessible repository through GitHub CLI even when the session is outside a checkout. Resolve a bare number only when a repository context is unambiguous, including the checkout that contains this skill. If no PR can be resolved, ask for a full PR URL or the project checkout; do not guess.

2. **Check what is implemented.** Read the Git Bot project's README and `package.json` and follow its current CLI. The local recorder supports one Kane run per invocation. The `video` skill workflow may compose two invocations for a bug-fix PR. Migration, preview review, docs-gap detection, and bisect are not implemented; report them unavailable, including under `all`.

3. **Derive one objective from PR evidence.** Read the PR title/body, linked issue and acceptance criteria, relevant discussion, changed files/diff, and useful docs or tests. State the expected user-visible result using the issue/spec or established behavior, not just the PR's implementation. Use a concise Kane objective with an observable result. Mention which evidence supports it. If there are multiple independent flows, select the one tied to the PR's stated purpose or explain that the prototype handles one objective at a time.

4. **Choose the right comparison.** For a bug-fix PR, the objective describes the behavior the base is supposed to lack and the PR head is supposed to satisfy. Run that same objective on base and head. For a feature PR, do not call the expected absence on base a bug: verify the feature on the head and describe the result as feature verification. Do not claim a fix or reproduced bug if PR evidence does not establish that intent.

5. **Prepare comparable, safe app versions.** Find preview URLs for the needed refs in deployment checks, PR comments, or repository configuration. If unavailable, use separate disposable checkouts at the exact base and head refs; do not switch or overwrite the user's checkout. Follow the target project's setup instructions and use its lockfile. Serve static fixtures at the app route itself. Use a local or preview environment with disposable data, never production or real user data. Keep the two runs in equivalent clean state; do not execute deploys, migrations, real purchases, or other irreversible actions. If an app cannot be prepared safely, report the blocker rather than improvising.

6. **Run Kane and record each run.** Use `GIT_BOT_HOME` when set to find the Git Bot CLI checkout; otherwise locate the checkout containing this skill. Follow that checkout's README and run `npm start` from its root. Ensure Kane is authenticated and Git Bot dependencies are installed. If no suitable local Chrome CDP endpoint is available, start Chrome with a dedicated temporary profile and a localhost-only remote-debugging endpoint; stop the Chrome process when the comparison is finished. For each version, invoke the recorder once with that version's URL, the same objective (for bug-fix comparisons), and a distinct output path, such as `recordings/pr-42-base.mp4` and `recordings/pr-42-head.mp4`. The CLI shape is `npm start -- --url <url> --objective '<objective>' --output <path> --cdp-endpoint <endpoint>`. The recorder loads the URL before capture and annotates the video with Kane's objective, action steps, result, and a matching click-target callout. Do not ask the user for an objective, URL, or start command when the PR and repository provide enough evidence to derive them.

7. **Interpret and compare Kane's results.** Read each Kane `run_end` status and its summary/reason/verdict. A nonzero exit or `failed` status alone is not proof of an application bug: classify it as a confirmed app failure only when Kane's evidence attributes the outcome to the application. Setup, navigation, and agent/tool errors are inconclusive. For a bug-fix comparison:

   - Confirmed app failure on base + pass on head: bug reproduced and fix verified.
   - Confirmed app failure on base + app failure on head: bug reproduced; fix not verified. Check whether the head failure is the same defect before drawing that conclusion.
   - Pass on base + app failure on head: regression for this objective.
   - Pass on both: the expected behavior already worked on base; no bug was reproduced.
   - Any inconclusive run: report the observed results and blocker; do not claim a complete comparison.

   Never weaken the objective to force a pass. A base failure is the bug evidence; the PR-head run verifies whether the change fixes it.

8. **Report results and limits.** Give the PR, objective, evidence for the expected result, each Kane status, the comparison conclusion, and the corresponding MP4 paths. Say clearly when a clip is only a feature verification or when a run is inconclusive. This prototype records locally: it does not run the recorder in Kane's cloud, create GitHub checks, upload videos, or comment on a PR. Do not imply those integrations happened.

If the repository or PR cannot be resolved, ask for a full PR URL or project checkout. If a required preview, local setup, Kane login, or browser endpoint is unavailable, state the specific blocker and report only the work that actually completed.
