# Changelog

All notable changes to this fork are documented here.

## Signal Support (2025-02 – 2026-02)

### Added

- **Signal channel** via signal-cli JSON-RPC (`src/channels/signal.ts`)
  - Dual-channel architecture: Signal and WhatsApp run simultaneously
  - Auto-registration of new groups/contacts on first message
  - `/chatid` command for group discovery
  - `/add-signal` skill for guided setup
- **Typing indicators** with auto-resend (Signal expires indicators after ~15s)
- **Reactions** — send and receive emoji reactions with target message tracking
- **Replies** — quoted reply support with author/timestamp context
- **Polls** — create Signal polls via `sendPollCreate` RPC
- **Text styling** — bold, italic, monospace, strikethrough via Signal's UTF-16 textStyle API (`src/signal-formatting.ts`)
- **Voice transcription** — local transcription via whisper.cpp, auto-triggers on audio attachments (`src/media.ts`)
- **Attachment support** — send/receive images, files, audio; image optimization for Claude vision
- **Audio analysis** — librosa-based BPM, key detection, spectrograms (container skill)
- **Webhook server** — HTTP endpoint for external services to trigger agent responses (`src/webhook.ts`)
- **Group metadata** — fetch Signal group members, admins, descriptions via `listGroups` RPC
- **Sender access control** — per-group allowlist to restrict who can trigger the agent
- **Session stats** — track token usage, duration, model per agent session
- **yt-dlp** — available in agent containers for media downloads
- **Model passthrough** — per-group model override via container config
- **U+FFFC mention resolution** — decode signal-cli's mention placeholders into `@name` text

### Changed

- Default trigger renamed from `@Andy` to `@Echo`
- Channel interface (`src/types.ts`) extended with `setTyping`, `sendReaction`, `sendReply`, `sendPoll`
- IPC system supports reactions, replies, polls, and attachment paths across mount boundaries
- Container runner mounts signal-cli attachments directory when Signal is configured

### Security

- Path traversal: replaced string-based `includes('..')` with `path.resolve` + `startsWith` validation
- Webhook auth: constant-time token comparison via `crypto.timingSafeEqual`
- Buffer handling: discard partial JSON lines after stdout buffer truncation
- IPC file size: reject files over 1MB to prevent memory exhaustion
- Attachment files: write optimized images to temp dir instead of overwriting signal-cli originals
- Attachment lookup: tightened from `startsWith(id)` to exact ID match to prevent short-ID collisions
