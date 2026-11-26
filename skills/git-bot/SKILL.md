---
name: git-bot
description: Run Git Bot's PR bug-video workflow from a repository checkout, or explain which PR review checks are available. Use when asked to reproduce a PR bug, capture a Kane browser run, or run Git Bot checks.
---

# Git Bot

Use this workflow to run the Git Bot PR review prototype from the current project. The skill is an interface to the project; it does not grant repository, GitHub, preview, or Kane access.

## Invocation

Pass a PR URL or number and, optionally, the check to run and a symptom to reproduce. Accept either a full URL such as `https://github.com/acme/app/pull/42` or a number such as `42`. Supported check names are `video`, `migrations`, `preview`, `docs`, `bisect`, and `all`.

- Claude Code: `/git-bot [PR URL or number] [video|migrations|preview|docs|bisect|all] [symptom]`
- Codex: `$git-bot [PR URL or number] [video|migrations|preview|docs|bisect|all] [symptom]`

Examples:

- `/git-bot 42 video "checkout fails after applying a coupon"`
- `$git-bot https://github.com/acme/app/pull/42 video "checkout fails after applying a coupon"`
- `/git-bot 42 all`

The host may also select the skill through its skill picker or automatic skill discovery.

## Workflow

1. **Check repository context before doing anything else.** Run `git rev-parse --show-toplevel` from the agent session's active working directory. Do not treat the directory containing this skill as the target checkout unless it is also the active working directory. If the command fails, stop before looking up a PR or running Kane, and say:

   > Git Bot needs a repository checkout. Open the project in your coding agent, or `cd` into its checkout, then retry the same Git Bot command (for example, `$git-bot 45` in Codex or `/git-bot 45` in Claude Code).

2. **Parse the request and resolve the target.** Extract the PR URL or number and requested check from the user's message, regardless of whether they use the example order. If no check is specified, use `video`. Use an explicitly provided PR target; if absent, try to identify the PR for the current branch with the available GitHub CLI. If it cannot be identified, pause and ask:

   > I found the repository, but couldn't identify a pull request. What PR URL or number should I review?

   Do not guess a repository or PR or start a PR-specific check until the user provides the target.

3. **Check what the project actually supports.** Read the repository's current README and `package.json` (or the relevant project configuration) before running a workflow. Treat those files and the implemented CLI as the source of truth; do not claim planned checks are available.

4. **Choose the requested check.** If no check is specified, use `video`, the current prototype's implemented workflow. For `all`, report the status of each check and run only implemented checks.

5. **Run the video workflow only when its inputs are available.** The current prototype requires a browser URL reachable from the local machine, Kane CLI authenticated locally, Chrome with its local CDP endpoint enabled, and `ffmpeg`. Find the exact supported CLI arguments in the project's README or `npm start -- --help`. If the preview URL or symptom is missing, ask for it rather than inventing a reproduction. Run the existing command, preserve its exit status, and report the generated MP4 path and Kane result. A failed Kane run can still produce useful video evidence.

6. **Report the integration boundary.** The current prototype records a local browser run. It does not run recording in Kane's cloud, create GitHub checks, upload video, or comment on a PR. Do not claim the video was posted to GitHub. The migration safety, preview review, README gap detection, and automated bisect checks are not implemented in this prototype; report them as unavailable rather than simulating a pass.

## Response

Summarize the target PR (if resolved), check attempted, Kane outcome, and evidence path. State any missing inputs or unavailable checks plainly. For the no-repository case, give the checkout instruction above and stop.
