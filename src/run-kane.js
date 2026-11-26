import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { annotateFrames } from './annotate-frames.js';
import { startRecorder } from './recorder.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runFfmpeg({ framesDir, output, fps }) {
  const inputPattern = path.join(framesDir, '%06d.jpg');
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-framerate', String(fps), '-i', inputPattern,
      '-r', '10',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
    ];
    const ffmpeg = spawn(process.env.FFMPEG_BIN || ffmpegPath || 'ffmpeg', args, { stdio: 'inherit' });
    ffmpeg.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('ffmpeg was not found. Install ffmpeg or set FFMPEG_BIN to its executable path.'));
      } else {
        reject(error);
      }
    });
    ffmpeg.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with status ${code}`));
    });
  });
}

function describeStep(remark) {
  const separator = remark.indexOf(':');
  if (separator < 0) return remark;
  const action = remark.slice(0, separator).trim().toLowerCase();
  const detail = remark.slice(separator + 1).trim();
  if (action === 'click') return detail.replace(/^Clicking\s+/i, 'Clicked ');
  if (action === 'navigate') return detail.replace(/^Navigate to\s+/i, 'Opened ');
  if (action === 'assert') return `Verified ${detail}`;
  if (action === 'analyze') return `Checked ${detail}`;
  return detail;
}

function clickTargetFromObjective(objective) {
  const match = objective.match(/\bclick\s+(?:on\s+)?(?:the\s+)?(.+?)(?=,|\s+and\s+verify|\s+then|\.|$)/i);
  return match?.[1].replace(/["'`*]/g, '').trim() || null;
}

function runKane({ kaneBin, objective, cdpEndpoint }, annotationEvents, captureStartedAt) {
  return new Promise((resolve, reject) => {
    const args = [
      'run', objective,
      '--cdp-endpoint', cdpEndpoint,
      '--agent',
      '--mode', 'agent',
      '--allow-missing-url',
    ];
    const kane = spawn(kaneBin, args, { stdio: ['inherit', 'pipe', 'inherit'] });
    let pending = '';
    const consumeLine = (line) => {
      process.stdout.write(`${line}\n`);
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      const at = Date.now() - captureStartedAt;
      if (event.type === 'run_end') {
        const summaryLines = String(event.summary || event.status || 'Run finished')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        annotationEvents.push({
          at,
          tag: event.status === 'passed' ? 'Kane verified' : 'Kane result',
          message: summaryLines.at(-1) || 'Run finished',
          status: event.status === 'passed' ? 'passed' : 'failed',
        });
      } else if (event.status === 'done' && event.remark) {
        annotationEvents.push({
          at,
          tag: `Kane step ${event.step ?? ''}`.trim(),
          message: describeStep(event.remark),
          status: 'step',
        });
      }
    };
    kane.stdout.setEncoding('utf8');
    kane.stdout.on('data', (chunk) => {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        consumeLine(pending.slice(0, newline).trim());
        pending = pending.slice(newline + 1);
      }
    });
    kane.once('error', reject);
    kane.once('close', (code, signal) => {
      if (pending.trim()) consumeLine(pending.trim());
      if (signal) reject(new Error(`Kane CLI stopped by signal ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

export async function runKaneWithRecording(options) {
  const output = path.resolve(projectRoot, options.output);
  await mkdir(path.dirname(output), { recursive: true });
  const framesDir = await mkdtemp(path.join(os.tmpdir(), 'git-bot-frames-'));
  const annotationEvents = [];
  let recorder;
  let kaneExitCode = 1;

  try {
    recorder = await startRecorder({
      cdpEndpoint: options.cdpEndpoint,
      framesDir,
      fps: options.fps,
      url: options.url,
      targetText: clickTargetFromObjective(options.objective),
    });
    const captureStartedAt = recorder.startedAt;
    console.log(`Recording browser frames at ${options.fps} fps`);
    console.log(`Running Kane objective; MP4 will be written to ${output}`);
    try {
      kaneExitCode = await runKane(options, annotationEvents, captureStartedAt);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const { frameCount, frameTimes, targetBoxes } = await recorder.stop();
      recorder = undefined;
      await annotateFrames({
        framesDir,
        frameTimes,
        targetBoxes,
        targetText: clickTargetFromObjective(options.objective),
        objective: options.objective,
        label: options.label,
        events: annotationEvents,
      });
      await runFfmpeg({ framesDir, output, fps: options.fps });
      console.log(`Annotated and saved ${frameCount} frames to ${output}`);
    }
    return { kaneExitCode, output };
  } finally {
    if (recorder) await recorder.stop().catch(() => {});
    await rm(framesDir, { recursive: true, force: true });
  }
}
