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
 * Overwrites the file in place with an optimized JPEG.
 * Returns true if the image was resized, false if already small enough or on error.
 */
export async function optimizeImageForVision(filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;

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
    if (!w || !h || (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE)) return false;

    // Resize preserving aspect ratio, cap longest edge at MAX_IMAGE_EDGE
    const optimizedPath = filePath + '.optimized.jpg';
    await exec('ffmpeg', [
      '-y', '-i', filePath,
      '-vf', `scale='if(gt(iw,ih),${MAX_IMAGE_EDGE},-2)':'if(gt(ih,iw),${MAX_IMAGE_EDGE},-2)'`,
      '-q:v', '2',
      optimizedPath,
    ]);

    // Replace original with optimized version
    fs.renameSync(optimizedPath, filePath);
    logger.info({ file: filePath, original: `${w}x${h}`, maxEdge: MAX_IMAGE_EDGE }, 'Image optimized for vision');
    return true;
  } catch (err) {
    logger.warn({ err, file: filePath }, 'Image optimization failed, using original');
    return false;
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
