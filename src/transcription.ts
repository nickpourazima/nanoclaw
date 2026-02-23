import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { logger } from './logger.js';

const WHISPER_CLI = path.join(os.homedir(), 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const WHISPER_MODEL = path.join(os.homedir(), 'whisper.cpp', 'models', 'ggml-base.bin');

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
