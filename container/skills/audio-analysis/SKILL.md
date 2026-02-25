---
name: audio-analysis
description: Analyze audio files — detect tempo/BPM, estimate musical key, generate spectrograms and waveform visualizations, extract audio features. Use whenever you receive audio files or need to inspect sound.
allowed-tools: Bash(python3:*)
---

# Audio Analysis with Python

## Quick start

```bash
python3 -c "
import librosa
y, sr = librosa.load('/workspace/group/song.mp3')
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
print(f'Tempo: {tempo:.1f} BPM')
"
```

## Loading audio

```python
import librosa

# Load audio (automatically resamples to 22050 Hz mono)
y, sr = librosa.load('audio.mp3')

# Load with original sample rate
y, sr = librosa.load('audio.mp3', sr=None)

# Load specific duration (seconds)
y, sr = librosa.load('audio.mp3', duration=30)

# Get duration
duration = librosa.get_duration(y=y, sr=sr)
print(f'Duration: {duration:.1f}s')
```

Supported formats: mp3, wav, ogg, flac, m4a (via ffmpeg).

## Tempo / BPM

```python
import librosa

y, sr = librosa.load('audio.mp3')
tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
print(f'Tempo: {tempo:.1f} BPM')

# Beat timestamps
beat_times = librosa.frames_to_time(beat_frames, sr=sr)
```

## Key estimation

```python
import librosa
import numpy as np

y, sr = librosa.load('audio.mp3')
chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
chroma_avg = chroma.mean(axis=1)

keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Major profile (Krumhansl-Kessler)
major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
minor = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

best_corr, best_key = -1, ''
for i in range(12):
    shifted = np.roll(chroma_avg, -i)
    maj_corr = np.corrcoef(shifted, major)[0, 1]
    min_corr = np.corrcoef(shifted, minor)[0, 1]
    if maj_corr > best_corr:
        best_corr, best_key = maj_corr, f'{keys[i]} major'
    if min_corr > best_corr:
        best_corr, best_key = min_corr, f'{keys[i]} minor'

print(f'Key: {best_key} (confidence: {best_corr:.2f})')
```

## Spectrogram (save as image)

```python
import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np

y, sr = librosa.load('audio.mp3')
S = librosa.feature.melspectrogram(y=y, sr=sr)
S_dB = librosa.power_to_db(S, ref=np.max)

fig, ax = plt.subplots(figsize=(12, 4))
librosa.display.specshow(S_dB, sr=sr, x_axis='time', y_axis='mel', ax=ax)
ax.set(title='Mel Spectrogram')
fig.colorbar(ax.collections[0], ax=ax, format='%+2.0f dB')
fig.tight_layout()
fig.savefig('spectrogram.png', dpi=150)
print('Saved spectrogram.png')
```

## Waveform visualization

```python
import librosa
import librosa.display
import matplotlib.pyplot as plt

y, sr = librosa.load('audio.mp3')

fig, ax = plt.subplots(figsize=(12, 3))
librosa.display.waveshow(y, sr=sr, ax=ax)
ax.set(title='Waveform')
fig.tight_layout()
fig.savefig('waveform.png', dpi=150)
print('Saved waveform.png')
```

## Full analysis example

```python
import librosa
import numpy as np

y, sr = librosa.load('audio.mp3')

# Duration
duration = librosa.get_duration(y=y, sr=sr)

# Tempo
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

# RMS energy
rms = librosa.feature.rms(y=y).mean()

# Spectral centroid (brightness)
centroid = librosa.feature.spectral_centroid(y=y, sr=sr).mean()

# Zero crossing rate (noisiness)
zcr = librosa.feature.zero_crossing_rate(y).mean()

print(f'Duration: {duration:.1f}s')
print(f'Tempo: {tempo:.1f} BPM')
print(f'RMS Energy: {rms:.4f}')
print(f'Spectral Centroid: {centroid:.0f} Hz')
print(f'Zero Crossing Rate: {zcr:.4f}')
```

## Format conversion (ffmpeg)

```bash
# Convert to wav
ffmpeg -i input.m4a output.wav -y -loglevel error

# Extract segment
ffmpeg -i input.mp3 -ss 30 -t 10 segment.wav -y -loglevel error

# Get file info
ffmpeg -i audio.mp3 2>&1 | grep -E 'Duration|Stream'
```
