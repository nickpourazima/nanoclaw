/**
 * Minimal HTTP webhook server for NanoClaw.
 * External services can POST messages to trigger agent responses.
 *
 * - Gated: only starts if WEBHOOK_PORT env var is set
 * - Auth: Bearer token via WEBHOOK_SECRET
 * - Route: POST /webhook/:group-folder  { text, sender? }
 * - Health: GET /health (no auth)
 */
import crypto from 'crypto';
import http from 'http';

import { ASSISTANT_NAME } from './config.js';
import { storeChatMetadata, storeMessage } from './db.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

const MAX_BODY_SIZE = 64 * 1024; // 64KB

export interface WebhookDeps {
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export function startWebhookServer(
  port: number,
  secret: string,
  deps: WebhookDeps,
): http.Server {
  const startTime = Date.now();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check (no auth)
    if (req.method === 'GET' && url.pathname === '/health') {
      const groups = deps.registeredGroups();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        groups: Object.keys(groups).length,
      }));
      return;
    }

    // All other routes require POST + auth
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Auth check (constant-time comparison to prevent timing attacks)
    const authHeader = req.headers.authorization || '';
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authHeader);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Route: POST /webhook/:group-folder
    const match = url.pathname.match(/^\/webhook\/([a-zA-Z0-9_-]+)$/);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /webhook/:group-folder' }));
      return;
    }

    const targetFolder = match[1];

    // Read body
    let body = '';
    try {
      body = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => {
          data += chunk.toString();
          if (data.length > MAX_BODY_SIZE) {
            reject(new Error('Body too large'));
          }
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
    } catch {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Body too large (max 64KB)' }));
      return;
    }

    let parsed: { text?: string; sender?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!parsed.text || typeof parsed.text !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: text' }));
      return;
    }

    // Find the group by folder name
    const groups = deps.registeredGroups();
    const groupEntry = Object.entries(groups).find(([, g]) => g.folder === targetFolder);
    if (!groupEntry) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Group folder "${targetFolder}" not found` }));
      return;
    }

    const [chatJid] = groupEntry;
    const senderName = parsed.sender || 'Webhook';
    const now = new Date().toISOString();

    // Auto-prepend trigger so the message always activates the agent
    const text = `@${ASSISTANT_NAME} ${parsed.text}`;

    // Store as a regular message so the message loop picks it up
    storeChatMetadata(chatJid, now);
    storeMessage({
      id: `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      chat_jid: chatJid,
      sender: `webhook:${senderName}`,
      sender_name: senderName,
      content: text,
      timestamp: now,
      is_from_me: false,
      is_bot_message: false,
    });

    logger.info({ chatJid, targetFolder, sender: senderName, textLength: parsed.text.length }, 'Webhook message stored');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', chatJid }));
  });

  server.listen(port, () => {
    logger.info({ port }, 'Webhook server started');
  });

  return server;
}
