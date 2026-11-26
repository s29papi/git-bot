# Git Bot

**A hackathon prototype for pull request bug videos.** Git Bot gives a coding agent a reusable skill for reviewing a PR with Kane CLI. For a bug-fix PR, the agent derives one browser objective from the PR and its issue, runs that same objective against the base and PR head, and compares Kane's results. Git Bot records each local browser run as an annotated MP4.

The base run is the bug evidence; the head run checks whether the PR fixes it. For example, this repository's checkout fixture shows a simulated payment `TypeError` on the base version. The corresponding fix should show a confirmation for order #1042 and $49.00.

## What is implemented

- **Coding-agent skill:** Codex and Claude Code can accept a PR URL or number. The agent reads PR context, chooses one user-visible flow, and writes a Kane objective with an observable expected result.
- **Base/head review for bug fixes:** The agent uses the same objective on both versions. A confirmed application failure on base and a pass on head means the bug was reproduced and the fix verified. Other result combinations are reported as regression, not reproduced, or inconclusive.
- **Git bisect on autopilot:** For a confirmed regression with known-good and known-bad revisions, the agent uses native `git bisect` in a disposable worktree, prepares each candidate app, and runs the same Kane objective at each step. Every candidate recording is annotated with its short commit hash.
- **Local browser recording:** Kane drives Chrome through its local CDP endpoint. Git Bot samples the browser with `Page.captureScreenshot`, adds the objective/action/result captions and a matching click-target callout, and encodes the frames as H.264 MP4.
- **One-run CLI:** The recorder runs one Kane objective per invocation. The skill composes two invocations for a bug-fix comparison.

This is a local feasibility prototype. It does not record in Kane's cloud browser, create GitHub checks, upload video, or comment on a PR. Migration checks, preview review, and README gap detection are not implemented. Bisect requires evidence-backed good and bad endpoints; a fix PR whose base is bad and head is good is a base/head comparison, not a regression range.

## Requirements

- Node.js 18 or newer and npm
- Git and GitHub CLI (`gh`) for PR discovery; authenticate with `gh auth login`
- Kane CLI and a Kane account for browser runs
- Google Chrome (Kane CLI requires Chrome)
- A local app or preview environment that is safe to exercise

The project installs `ffmpeg-static`, `sharp`, and `ws` from `package-lock.json`; you do not need to install FFmpeg separately.

## Install and configure

Clone the project and install its dependencies:

```sh
git clone https://github.com/s29papi/git-bot.git
cd git-bot
npm ci
```

Install Kane CLI and complete its browser sign-in:

```sh
npm install -g @testmuai/kane-cli
kane-cli --version
kane-cli login
kane-cli whoami
```

Kane CLI requires Google Chrome. Git Bot also needs a local Chrome DevTools Protocol (CDP) endpoint so its recorder can capture the browser Kane controls. During a skill run, the agent starts Chrome with a dedicated temporary profile and localhost-only CDP endpoint when one is not already available, then stops the browser it started after recording. You do not need to start a server, switch branches, or run the recorder yourself.

For PR-based skill use, authenticate GitHub CLI as well:

```sh
gh auth login
gh auth status
```

The agent needs read access to the PR, its linked issues, and the base/head source. For private repositories, the user's GitHub credentials must provide that access.

## Install the coding-agent skill

The skill is already available when you open this repository as the project in Codex or Claude Code:

- **Codex:** `.agents/skills/git-bot/SKILL.md`, invoked as `$git-bot`
- **Claude Code:** `.claude/skills/git-bot/SKILL.md`, invoked as `/git-bot`
- **Distributable source:** `skills/git-bot/SKILL.md`

To use the skill from another project, copy the distributable skill into that project's agent skill directory. From the Git Bot checkout, set `APP_REPO` to the path of the project you want to work in:

```sh
APP_REPO=/path/to/your/project

# Codex
mkdir -p "$APP_REPO/.agents/skills/git-bot"
cp skills/git-bot/SKILL.md "$APP_REPO/.agents/skills/git-bot/SKILL.md"

# Claude Code (use this instead of the Codex destination above)
mkdir -p "$APP_REPO/.claude/skills/git-bot"
cp skills/git-bot/SKILL.md "$APP_REPO/.claude/skills/git-bot/SKILL.md"
```

Keep the Git Bot checkout installed with `npm ci`; the skill uses this repository's CLI to record the run. When the skill is copied into a different project, set `GIT_BOT_HOME` to the absolute path of this checkout before launching the coding agent so it can find the CLI. For example, in a terminal on macOS/Linux:

```sh
cd /path/to/your/project
export GIT_BOT_HOME=/path/to/git-bot
codex  # or: claude
```

Open the application repository in the coding agent, then invoke the skill with a PR URL or number.

## Review a PR with the skill

From the application project in Codex or Claude Code, run:

```text
$git-bot https://github.com/owner/repository/pull/42 video
```

In Claude Code, use `/git-bot` instead of `$git-bot`. A PR number also works when the current checkout identifies its GitHub repository:

```text
$git-bot 42 video
```

The agent then:

1. Reads the PR, linked issue/specification, diff, and relevant checks to derive the expected browser behavior and Kane objective.
2. Resolves the base and head apps from previews or isolated temporary checkouts, following the target repository's setup instructions. For `bisect`, it establishes a passing good ref and failing bad ref, then uses a disposable worktree to prepare each native Git bisect candidate.
3. For a bug-fix PR, runs the same objective against both versions in comparable clean states. It saves separate clips, for example `recordings/pr-42-base.mp4` and `recordings/pr-42-head.mp4`. For bisect, it saves a clip per candidate with the short commit hash on every frame.
4. Reads Kane's structured result and evidence for each run, then reports whether the bug was reproduced and the fix verified. A feature PR is reported as feature verification; the expected absence of a new feature on base is not labeled a bug.

For a regression, use the same invocation shape with `bisect`, for example `$git-bot https://github.com/owner/repository/pull/42 bisect`. The agent derives the browser objective, establishes evidence-backed good and bad revisions, creates a temporary bisect worktree, prepares each candidate app, and runs the same Kane check. It records each candidate with its short commit hash annotated on every frame, then reports the first bad commit and the associated clips. The user does not run the recorder separately.

The skill handles one browser objective at a time. If the PR covers multiple independent user flows, it picks the flow tied to the stated issue or explains the limitation. Bisect skips setup or Kane infrastructure errors rather than counting them as application failures. If it cannot establish good/bad endpoints or enough candidate outcomes, it reports the blocker instead of claiming an unperformed bisect. The agent also reports blockers such as missing GitHub access, Kane authentication, Chrome/CDP, or safe app setup instead of claiming an unperformed comparison.

## Demo PR #2

[PR #2](https://github.com/s29papi/git-bot/pull/2) was used to demonstrate the full agent workflow. The agent generated the purchase-confirmation objective from the PR and linked issue, ran it against the base and PR head, and produced a bug clip and a fix-verification clip. Kane observed the simulated payment `TypeError` on base and passed on the head, which confirms the fix for this flow. These videos are local artifacts under the ignored `recordings/` directory; the agent does not upload or comment them on GitHub.

## Demo regression for Git bisect

[`examples/bisect-checkout-fixture`](examples/bisect-checkout-fixture) is the passing checkout flow on `main`. The `demo/bisect-checkout-regression` PR changes its confirmation into an error after a harmless earlier commit, giving the bisect skill a known-good base and known-bad head with a real commit range to inspect. Run `$git-bot <demo PR URL> bisect` once; the agent generates the same Kane objective at each commit, saves a labeled recording per candidate, and reports the first bad commit. The fixture is local and does not process payments.

## Demo artifact

[`examples/checkout-bug/repro.mp4`](examples/checkout-bug/repro.mp4) is a checked-in sample of the checkout failure. The PR skill creates new recordings under the ignored `recordings/` directory.

## How capture works

1. The recorder connects to Chrome over CDP and navigates directly to the supplied app URL before taking the first frame.
2. It captures JPEG screenshots while Kane drives the browser and emits action/result events.
3. `sharp` adds explanatory captions and, when the target can be matched to a visible control, a click-target callout. Bisect runs can also burn a candidate commit label into every frame.
4. `ffmpeg-static` encodes the annotated frames to MP4.

Kane performs the browser actions and judges the objective. Git Bot handles the local screenshot capture and video rendering; it does not replace Kane's own run evidence.

## Links

- [Kane CLI installation](https://www.testmuai.com/docs/kane-cli-installation)
- [Kane CLI quickstart](https://www.testmuai.com/docs/kane-cli-quickstart)
- [Kane CLI command reference](https://www.testmuai.com/docs/kane-cli-cli-reference)
- [Kane CLI troubleshooting](https://www.testmuai.com/docs/kane-cli-troubleshooting)
