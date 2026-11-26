# Git Bot

**A hackathon prototype for pull request bug videos.** Git Bot gives a coding agent a reusable skill for reviewing a PR with Kane CLI. For a bug-fix PR, the agent derives one browser objective from the PR and its issue, runs that same objective against the base and PR head, and compares Kane's results. Git Bot records each local browser run as an annotated MP4.

The base run is the bug evidence; the head run checks whether the PR fixes it. For example, this repository's checkout fixture shows a simulated payment `TypeError` on the base version. The corresponding fix should show a confirmation for order #1042 and $49.00.

## What is implemented

- **Coding-agent skill:** Codex and Claude Code can accept a PR URL or number. The agent reads PR context, chooses one user-visible flow, and writes a Kane objective with an observable expected result.
- **Base/head review for bug fixes:** The agent uses the same objective on both versions. A confirmed application failure on base and a pass on head means the bug was reproduced and the fix verified. Other result combinations are reported as regression, not reproduced, or inconclusive.
- **Local browser recording:** Kane drives Chrome through its local CDP endpoint. Git Bot samples the browser with `Page.captureScreenshot`, adds the objective/action/result captions and a matching click-target callout, and encodes the frames as H.264 MP4.
- **One-run CLI:** The recorder runs one Kane objective per invocation. The skill composes two invocations for a bug-fix comparison.

This is a local feasibility prototype. It does not record in Kane's cloud browser, create GitHub checks, upload video, or comment on a PR. Migration checks, preview review, README gap detection, and automated bisect are not implemented.

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

Kane CLI requires Chrome. Git Bot's recorder also needs a Chrome DevTools Protocol (CDP) endpoint so it can capture the same browser that Kane controls. On Linux, start Chrome with a dedicated temporary profile and a localhost-only endpoint:

```sh
google-chrome --headless=new \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/git-bot-chrome \
  about:blank
```

If your Chrome executable is named `google-chrome-stable`, use that command instead. Keep Chrome running while recording. For other platforms, start Chrome with the equivalent remote-debugging port and a separate user-data directory.

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

## Optional: smoke-test one local recording

This is a one-run check of the screenshot-to-MP4 recorder against the deliberately broken local fixture. It does not inspect a PR, derive an objective, or compare branches. For the full base/head PR workflow, use [Review a PR with the skill](#review-a-pr-with-the-skill) or follow [Reproduce the base/head demo for PR #2](#reproduce-the-basehead-demo-for-pr-2).

The included checkout fixture is deliberately broken. Start a local server in one terminal from the Git Bot repository:

```sh
python3 -m http.server 8765 \
  --bind 127.0.0.1 \
  --directory examples/pr-checkout-fixture
```

In another terminal, run a Kane objective that expects the correct purchase confirmation:

```sh
npm start -- \
  --url http://127.0.0.1:8765/ \
  --objective 'Click Complete purchase and verify it confirms order #1042 for $49.00.' \
  --output recordings/checkout-bug.mp4 \
  --cdp-endpoint http://127.0.0.1:9222
```

Kane should report a failure because the fixture displays the simulated payment error. The command returns Kane's exit status but still writes the MP4 when the objective fails. New recordings go in the ignored `recordings/` directory.

The CLI options are:

```text
--url <url>              Starting page
--objective <text>       Browser objective for Kane
--output <path>          MP4 path (default: recordings/bug-repro.mp4)
--cdp-endpoint <url>     Chrome endpoint (default: http://127.0.0.1:9222)
--kane-bin <path>         Kane executable (default: kane-cli)
--fps <number>           Screenshot sample rate, 1–10 (default: 2)
```

Run `npm start -- --help` for the current command help. `FFMPEG_BIN` can override the bundled FFmpeg executable if needed.

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
2. Resolves the base and head apps from previews or isolated temporary checkouts, following the target repository's setup instructions.
3. For a bug-fix PR, runs the same objective against both versions in comparable clean states. It saves separate clips, for example `recordings/pr-42-base.mp4` and `recordings/pr-42-head.mp4`.
4. Reads Kane's structured result and evidence for each run, then reports whether the bug was reproduced and the fix verified. A feature PR is reported as feature verification; the expected absence of a new feature on base is not labeled a bug.

The skill handles one browser objective at a time. If the PR covers multiple independent user flows, it picks the flow tied to the stated issue or explains the limitation. The agent reports blockers such as missing GitHub access, Kane authentication, Chrome/CDP, or safe app setup instead of claiming an unperformed comparison.

## Reproduce the base/head demo for PR #2

[PR #2](https://github.com/s29papi/git-bot/pull/2) is the real-repository demo: the `main` version of the fixture shows a simulated payment `TypeError`; `fix/checkout-fixture-issue-1` shows the order confirmation. The objective below is intentionally the same for both versions. Kane should fail on base and pass on the PR head.

These commands use detached Git worktrees. They check out the two refs side by side without switching or changing the branch in your current working tree. Run them from the Git Bot checkout:

```sh
git fetch origin main fix/checkout-fixture-issue-1
WORKTREES=$(mktemp -d /tmp/git-bot-pr2.XXXXXX)
git worktree add --detach "$WORKTREES/base" origin/main
git worktree add --detach "$WORKTREES/head" origin/fix/checkout-fixture-issue-1
```

Start Chrome as shown in [Install and configure](#install-and-configure). Keep using the same terminal where you created the worktrees; the following commands use the `WORKTREES` variable set there. Start a local server for each version:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 \
  --directory "$WORKTREES/base/examples/pr-checkout-fixture" \
  > /tmp/git-bot-pr2-base-server.log 2>&1 &
BASE_SERVER=$!

python3 -m http.server 8766 --bind 127.0.0.1 \
  --directory "$WORKTREES/head/examples/pr-checkout-fixture" \
  > /tmp/git-bot-pr2-head-server.log 2>&1 &
HEAD_SERVER=$!
```

Run the same Kane objective against base and head. The first run is expected to return Kane's failure exit code. Capture both exit codes and continue to the head run even when base fails:

```sh
BASE_STATUS=0
npm start -- \
  --url http://127.0.0.1:8765/ \
  --objective 'On the checkout page, click Complete purchase and verify it confirms order #1042 for $49.00.' \
  --output recordings/pr-2-base.mp4 \
  --cdp-endpoint http://127.0.0.1:9222 || BASE_STATUS=$?

HEAD_STATUS=0
npm start -- \
  --url http://127.0.0.1:8766/ \
  --objective 'On the checkout page, click Complete purchase and verify it confirms order #1042 for $49.00.' \
  --output recordings/pr-2-head.mp4 \
  --cdp-endpoint http://127.0.0.1:9222 || HEAD_STATUS=$?

printf 'Kane exit codes: base=%s head=%s\n' "$BASE_STATUS" "$HEAD_STATUS"
```

Expected results:

- **Base (`origin/main`):** Kane clicks the button and observes the simulated payment `TypeError`. Kane reports a failed objective, and Git Bot still writes `recordings/pr-2-base.mp4`.
- **Head (`origin/fix/checkout-fixture-issue-1`):** Kane clicks the button and verifies the confirmation for order #1042 and $49.00. Kane reports a pass and Git Bot writes `recordings/pr-2-head.mp4`.

Stop the local servers and remove only the temporary worktrees when finished:

```sh
kill "$BASE_SERVER" "$HEAD_SERVER"
git worktree remove "$WORKTREES/base"
git worktree remove "$WORKTREES/head"
rmdir "$WORKTREES"
```

If you close the terminal before cleanup, use `git worktree list` to find the temporary paths and remove them with `git worktree remove <path>`.

## Demo artifact

[`examples/checkout-bug/repro.mp4`](examples/checkout-bug/repro.mp4) is a checked-in sample of the checkout failure. New runs are written under `recordings/`, which is ignored by Git. The PR comparison videos are local artifacts unless you explicitly copy or publish them yourself.

## How capture works

1. The recorder connects to Chrome over CDP and navigates directly to the supplied app URL before taking the first frame.
2. It captures JPEG screenshots while Kane drives the browser and emits action/result events.
3. `sharp` adds explanatory captions and, when the target can be matched to a visible control, a click-target callout.
4. `ffmpeg-static` encodes the annotated frames to MP4.

Kane performs the browser actions and judges the objective. Git Bot handles the local screenshot capture and video rendering; it does not replace Kane's own run evidence.

## Links

- [Kane CLI installation](https://www.testmuai.com/docs/kane-cli-installation)
- [Kane CLI quickstart](https://www.testmuai.com/docs/kane-cli-quickstart)
- [Kane CLI command reference](https://www.testmuai.com/docs/kane-cli-cli-reference)
- [Kane CLI troubleshooting](https://www.testmuai.com/docs/kane-cli-troubleshooting)
