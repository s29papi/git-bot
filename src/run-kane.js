import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    const ffmpeg = spawn(process.env.FFMPEG_BIN || 'ffmpeg', args, { stdio: 'inherit' });
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

function runKane({ kaneBin, url, objective, cdpEndpoint }) {
  return new Promise((resolve, reject) => {
    const args = [
      'run', objective,
      '--url', url,
      '--cdp-endpoint', cdpEndpoint,
      '--agent',
      '--mode', 'agent',
    ];
    const kane = spawn(kaneBin, args, { stdio: 'inherit' });
    kane.once('error', reject);
    kane.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Kane CLI stopped by signal ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

export async function runKaneWithRecording(options) {
  const output = path.resolve(projectRoot, options.output);
  await mkdir(path.dirname(output), { recursive: true });
  const framesDir = await mkdtemp(path.join(os.tmpdir(), 'git-bot-frames-'));
  let recorder;
  let kaneExitCode = 1;

  try {
    recorder = await startRecorder({
      cdpEndpoint: options.cdpEndpoint,
      framesDir,
      fps: options.fps,
    });
    console.log(`Recording browser frames at ${options.fps} fps`);
    console.log(`Running Kane objective; MP4 will be written to ${output}`);
    try {
      kaneExitCode = await runKane(options);
    } finally {
      const frames = await recorder.stop();
      recorder = undefined;
      await runFfmpeg({ framesDir, output, fps: options.fps });
      console.log(`Saved ${frames} frames to ${output}`);
    }
    return { kaneExitCode, output };
  } finally {
    if (recorder) await recorder.stop().catch(() => {});
    await rm(framesDir, { recursive: true, force: true });
  }
}
