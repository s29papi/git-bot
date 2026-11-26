#!/usr/bin/env node
import { runKaneWithRecording } from './run-kane.js';

function usage() {
  console.log(`git-bot — record a video while Kane CLI reproduces a browser bug

Usage:
  npm start -- --url <url> --objective <text> [options]

Options:
  --url <url>                 Starting page for Kane
  --objective <text>          Browser flow Kane should run
  --output <path>             MP4 output (default: recordings/bug-repro.mp4)
  --cdp-endpoint <url>        Chrome DevTools endpoint (default: http://127.0.0.1:9222)
  --kane-bin <path>            Kane CLI executable (default: kane-cli)
  --fps <number>              Screenshot sample rate, 1–10 (default: 2)
  --label <text>              Persistent context label shown on every frame
  --help                       Show this help

Chrome must already be running with remote debugging enabled. The recorder
captures screenshots in parallel; Kane CLI drives the browser and reports the
run result. A video is saved even when Kane reports a failed objective.`);
}

function parseArgs(argv) {
  const options = {
    output: 'recordings/bug-repro.mp4',
    cdpEndpoint: 'http://127.0.0.1:9222',
    kaneBin: process.env.KANE_BIN || 'kane-cli',
    fps: 2,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    const names = {
      url: 'url',
      objective: 'objective',
      output: 'output',
      'cdp-endpoint': 'cdpEndpoint',
      'kane-bin': 'kaneBin',
      fps: 'fps',
      label: 'label',
    };
    if (!names[key]) throw new Error(`Unknown option: ${arg}`);
    options[names[key]] = key === 'fps' ? Number(value) : value;
  }

  if (!options.url) throw new Error('Missing required --url');
  if (!options.objective) throw new Error('Missing required --objective');
  if (!Number.isInteger(options.fps) || options.fps < 1 || options.fps > 10) {
    throw new Error('--fps must be an integer from 1 to 10');
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
  } else {
    const result = await runKaneWithRecording(options);
    process.exitCode = result.kaneExitCode;
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error('Run `npm start -- --help` for usage.');
  process.exitCode = 1;
}
