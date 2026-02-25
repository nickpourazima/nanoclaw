import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { logger } from './logger.js';

const WHISPER_CLI = path.join(os.homedir(), 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const WHISPER_MODEL = path.join(os.homedir(), 'whisper.cpp', 'models', 'ggml-base.bin');

// Claude vision: images over 1568px on any edge get downscaled server-side,
// adding latency. Pre-resize to avoid that overhead.
const MAX_IMAGE_EDGE = 1568;

/**
 * Transcribe an audio file on disk using local whisper.cpp.
 * Returns the transcript text, or null if transcription is unavailable/fails.
 */
export async function transcribeAudioFile(filePath: string): Promise<string | null> {
  if (!fs.existsSync(WHISPER_CLI) || !fs.existsSync(WHISPER_MODEL)) {
    logger.warn('whisper.cpp not found, skipping voice transcription');
    return null;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return null;

  // whisper.cpp requires 16kHz WAV input — convert with ffmpeg
  const wavPath = filePath + '.wav';
  try {
    await exec('ffmpeg', ['-y', '-i', filePath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);
  } catch (err) {
    logger.warn({ err, file: filePath }, 'ffmpeg conversion failed');
    return null;
  }

  try {
    const stdout = await exec(WHISPER_CLI, [
      '-m', WHISPER_MODEL,
      '-f', wavPath,
      '--no-timestamps',
      '-t', '4',
      '-l', 'en',
    ]);

    const text = stdout.trim();
    return text || null;
  } finally {
    // Clean up temp wav
    try { fs.unlinkSync(wavPath); } catch { /* ignore */ }
  }
}

/**
 * Downscale an image if either dimension exceeds MAX_IMAGE_EDGE.
 * Writes the optimized version to a temp directory (preserving the original).
 * Returns the path to the optimized file, or the original path if no resize was needed.
 */
export async function optimizeImageForVision(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) return filePath;

  try {
    // Probe dimensions
    const probeOut = await exec('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      filePath,
    ]);
    const [w, h] = probeOut.trim().split(',').map(Number);
    if (!w || !h || (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE)) return filePath;

    // Write optimized version to temp dir (don't modify signal-cli's original)
    const tmpDir = path.join(os.tmpdir(), 'nanoclaw-optimized');
    fs.mkdirSync(tmpDir, { recursive: true });
    const optimizedPath = path.join(tmpDir, `${path.basename(filePath)}.optimized.jpg`);

    await exec('ffmpeg', [
      '-y', '-i', filePath,
      '-vf', `scale='if(gt(iw,ih),${MAX_IMAGE_EDGE},-2)':'if(gt(ih,iw),${MAX_IMAGE_EDGE},-2)'`,
      '-q:v', '2',
      optimizedPath,
    ]);

    logger.info({ file: filePath, optimized: optimizedPath, original: `${w}x${h}`, maxEdge: MAX_IMAGE_EDGE }, 'Image optimized for vision');
    return optimizedPath;
  } catch (err) {
    logger.warn({ err, file: filePath }, 'Image optimization failed, using original');
    return filePath;
  }
}

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}
