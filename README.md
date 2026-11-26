# git-bot: video proof of a browser bug

This is a local recording prototype for the Git bot hackathon project. It runs a
Kane CLI browser objective while a small recorder samples the same Chrome page
and encodes the samples as an MP4. It demonstrates the browser-to-video loop,
but it does **not** run the recorder in Kane's cloud browser or post to a PR.

**Kane drives the browser and judges the result. This project records the
browser.** Kane CLI's own run evidence is separate from this MP4 recorder.

## Requirements

- Node.js 18 or later
- `ffmpeg` available on `PATH` (or set `FFMPEG_BIN` to its path)
- Kane CLI installed and authenticated (`npm install -g @testmuai/kane-cli`,
  then `kane-cli login`)
- Chrome with its DevTools Protocol endpoint enabled on localhost

Install the project dependencies:

```sh
npm install
```

Start Chrome with a dedicated profile and a local-only CDP endpoint. For
example, on Linux:

```sh
google-chrome --headless=new --no-sandbox \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/git-bot-chrome about:blank
```

Keep Chrome running in that terminal. In another terminal, serve the sample
checkout page:

```sh
python3 -m http.server 8765 --directory examples/checkout-bug
```

Then run Kane and record its browser session:

```sh
npm start -- \
  --url http://127.0.0.1:8765/ \
  --objective 'Click Complete purchase. Verify a BUG payment failure with a TypeError appears instead of a success confirmation.' \
  --output recordings/checkout-bug.mp4
```

The command exits with Kane's exit code and saves the video even when Kane
detects a failure. That makes the clip available to the future PR reporter.
Choose a different output path with `--output`; set `--fps` from 1 to 10 to
change how often the page is sampled. You can use `--cdp-endpoint` and
`--kane-bin` when Chrome or Kane CLI is at a non-default location.

## How it works

1. Connect to an existing Chrome page using its local DevTools Protocol endpoint.
2. Start taking JPEG screenshots at the requested rate.
3. Run `kane-cli run` against the same endpoint.
4. Encode the screenshots with `ffmpeg` as H.264 MP4.
5. Return Kane's exit status so a CI or GitHub workflow can decide what to do.

The current recorder uses CDP `Page.captureScreenshot` because the standalone
Kane run evidence we inspected did not provide an MP4 export. It does not
change Kane CLI or depend on Kane's internal screenshot implementation.

## Important architecture gap

The current command uses `kane-cli run --cdp-endpoint` against Chrome running
beside this Node process. That is how the demo video was made. It is not the
intended cloud architecture for the PR bot.

Kane's remote `testrun` path runs the suite on HyperExecute and returns
recordings and evidence packs, but the documented pack contains screenshots,
logs, and results rather than an MP4. Kane Explore runs in the cloud and its
finding viewer has clip evidence, but this prototype does not yet retrieve or
publish those cloud clips. The next implementation step is to consume Kane's
cloud finding clip or a supported cloud recording export, then comment its
shareable link on the PR. Until that path is implemented, treat the local CDP
recorder as a feasibility demo only.

## Current scope

This prototype records one local browser run and produces an MP4. It does not
yet create GitHub checks, upload artifacts, or post PR comments.

The included checkout page is a deterministic local fixture for exercising the
recording flow; its displayed payment error is deliberately simulated.

The first captured reproduction is included at
[`examples/checkout-bug/repro.mp4`](examples/checkout-bug/repro.mp4). It shows
the checkout before and after Kane clicks the button. This checked-in clip is a
demo artifact; new recordings go to the ignored `recordings/` directory by
default.

## Coding-agent skill

Git Bot is available as a project skill in both Codex and Claude Code:

- Codex discovers `.agents/skills/git-bot/SKILL.md`; invoke it with `$git-bot`.
- Claude Code discovers `.claude/skills/git-bot/SKILL.md`; invoke it with `/git-bot`.
- `skills/git-bot/SKILL.md` is the distributable source copy. Keep the three copies in sync when changing the workflow.

The skill checks for a repository checkout, resolves a PR when possible, and guides the currently implemented local video prototype. It documents unavailable integrations and does not claim to post video to GitHub.
