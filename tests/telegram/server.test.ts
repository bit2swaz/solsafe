import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Bot } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTelegramServer,
  getWebhookPath,
  startTelegramServer,
} from '../../src/telegram/server.js';

const activeServers = new Set<Server>();

afterEach(async () => {
  await Promise.all([...activeServers].map(closeServer));
  activeServers.clear();
});

async function listen(server: Server): Promise<string> {
  activeServers.add(server);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe('telegram webhook server', () => {
  it('serves a health check endpoint', async () => {
    const server = createTelegramServer({
      webhookHandler: async (_req, res) => {
        res.statusCode = 200;
        res.end('ok');
      },
      webhookUrl: 'https://example.com/telegram/webhook',
    });

    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('routes POST requests on the webhook path to the Telegram handler', async () => {
    const webhookHandler = vi.fn(async (_req, res) => {
      res.statusCode = 200;
      res.end('accepted');
    });

    const webhookUrl = 'https://example.com/telegram/webhook';
    const server = createTelegramServer({ webhookHandler, webhookUrl });

    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}${getWebhookPath(webhookUrl)}`, {
      body: JSON.stringify({ update_id: 1 }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(webhookHandler).toHaveBeenCalledTimes(1);
  });

  it('registers the webhook URL when the server starts', async () => {
    const bot = new Bot('test-token');
    const webhookUrl = 'https://example.com/telegram/webhook';
    const setWebhook = vi
      .spyOn(bot.api, 'setWebhook')
      .mockResolvedValue(true as never);

    const server = await startTelegramServer({
      bot,
      port: 0,
      webhookHandler: async (_req, res) => {
        res.statusCode = 200;
        res.end('accepted');
      },
      webhookUrl,
    });

    activeServers.add(server);

    expect(setWebhook).toHaveBeenCalledWith(webhookUrl);
  });
});