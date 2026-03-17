// Pub/Sub — SSE + WebSocket fan-out
// Agents publish messages. Dashboard subscribes via SSE. Simple.

import { randomBytes } from 'crypto';
import type { Response } from 'express';
import type { WebSocket } from 'ws';
import type { SigilMessage, SSEClient } from './types.js';
import type { MessageStore } from './store.js';

export class PubSub {
  private sseClients: Map<string, SSEClient> = new Map();
  private wsClients: Map<string, WebSocket> = new Map();
  private store: MessageStore;

  constructor(store: MessageStore) {
    this.store = store;
  }

  // Publish a message to all subscribers and persist it
  publish(msg: SigilMessage): void {
    // Persist
    this.store.add(msg);

    // Fan out to SSE clients
    const sseData = `data: ${JSON.stringify(msg)}\n\n`;
    for (const [id, client] of this.sseClients) {
      try {
        client.res.write(sseData);
        (client.res as unknown as { flush?: () => void }).flush?.();
      } catch {
        this.sseClients.delete(id);
      }
    }

    // Fan out to WebSocket clients
    const wsData = JSON.stringify(msg);
    for (const [id, ws] of this.wsClients) {
      try {
        if (ws.readyState === 1) { // OPEN
          ws.send(wsData);
        } else {
          this.wsClients.delete(id);
        }
      } catch {
        this.wsClients.delete(id);
      }
    }
  }

  // Subscribe via SSE — returns client ID for cleanup
  subscribeSSE(res: Response): string {
    const id = randomBytes(8).toString('hex');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send recent history on connect
    const history = this.store.getRecent(50);
    for (const msg of history.reverse()) {
      res.write(`data: ${JSON.stringify(msg)}\n\n`);
    }

    // Send init event with current state
    res.write(`event: connected\ndata: {"client_id":"${id}","history_count":${history.length}}\n\n`);

    this.sseClients.set(id, { id, res, topics: [] });

    // Keepalive every 30s
    const keepalive = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        clearInterval(keepalive);
        this.sseClients.delete(id);
      }
    }, 30_000);

    res.on('close', () => {
      clearInterval(keepalive);
      this.sseClients.delete(id);
    });

    return id;
  }

  // Subscribe via WebSocket
  subscribeWS(ws: WebSocket): string {
    const id = randomBytes(8).toString('hex');
    this.wsClients.set(id, ws);

    // Send history
    const history = this.store.getRecent(50);
    for (const msg of history.reverse()) {
      ws.send(JSON.stringify(msg));
    }

    ws.on('close', () => this.wsClients.delete(id));
    ws.on('error', () => this.wsClients.delete(id));

    return id;
  }

  get clientCount(): number {
    return this.sseClients.size + this.wsClients.size;
  }

  // Generate a message ID
  static messageId(): string {
    return randomBytes(6).toString('hex');
  }
}
