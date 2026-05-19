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

const WEBHOOK_SECRET = 'telegram-secret-token';

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
      webhookSecret: WEBHOOK_SECRET,
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
    const server = createTelegramServer({
      webhookHandler,
      webhookSecret: WEBHOOK_SECRET,
      webhookUrl,
    });

    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}${getWebhookPath(webhookUrl)}`, {
      body: JSON.stringify({ update_id: 1 }),
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(webhookHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects POST requests with an invalid Telegram webhook secret before handling the update', async () => {
    const webhookHandler = vi.fn(async (_req, res) => {
      res.statusCode = 200;
      res.end('accepted');
    });
    const webhookUrl = 'https://example.com/telegram/webhook';
    const server = createTelegramServer({
      webhookHandler,
      webhookSecret: WEBHOOK_SECRET,
      webhookUrl,
    });

    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}${getWebhookPath(webhookUrl)}`, {
      body: JSON.stringify({ update_id: 1 }),
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'bad-secret',
      },
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Invalid Telegram webhook secret.',
    });
    expect(webhookHandler).not.toHaveBeenCalled();
  });

  it('registers the webhook URL when the server starts', async () => {
    const bot = new Bot('test-token');
    const webhookUrl = 'https://example.com/telegram/webhook';
    vi.spyOn(bot.api, 'getMe').mockResolvedValue({
      can_connect_to_business: false,
      can_join_groups: true,
      can_read_all_group_messages: false,
      first_name: 'SolSafe',
      has_main_web_app: false,
      id: 1,
      is_bot: true,
      supports_inline_queries: false,
      username: 'solsafe_test_bot',
    } as never);
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
      webhookSecret: WEBHOOK_SECRET,
      webhookUrl,
    });

    activeServers.add(server);

    expect(setWebhook).toHaveBeenCalledWith(webhookUrl, {
      secret_token: WEBHOOK_SECRET,
    });
  });

  it('initializes the bot before processing queued updates so /start replies successfully', async () => {
    const webhookUrl = 'https://example.com/telegram/webhook';
    const bot = new Bot('test-token');
    const handledStart = Promise.withResolvers<void>();
    const init = vi.spyOn(bot, 'init').mockImplementation(async () => {
      bot.botInfo = {
        can_connect_to_business: false,
        can_join_groups: true,
        can_read_all_group_messages: false,
        first_name: 'SolSafe',
        has_main_web_app: false,
        id: 1,
        is_bot: true,
        supports_inline_queries: false,
        username: 'solsafe_test_bot',
      } as never;
    });

    bot.command('start', () => {
      handledStart.resolve();
    });

    const server = createTelegramServer({
      bot,
      webhookSecret: WEBHOOK_SECRET,
      webhookUrl,
    });

    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}${getWebhookPath(webhookUrl)}`, {
      body: JSON.stringify({
        update_id: 7,
        message: {
          chat: {
            id: 123,
            type: 'private',
          },
          date: 1,
          entities: [
            {
              length: 6,
              offset: 0,
              type: 'bot_command',
            },
          ],
          from: {
            first_name: 'Test',
            id: 42,
            is_bot: false,
          },
          message_id: 1,
          text: '/start',
        },
      }),
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      },
      method: 'POST',
    });

    expect(response.status).toBe(200);

    await handledStart.promise;

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('acknowledges webhook updates immediately and ignores duplicate update ids while processing', async () => {
    const webhookUrl = 'https://example.com/telegram/webhook';
    const duplicateUpdate = {
      update_id: 99,
      message: {
        chat: {
          id: 42,
          type: 'private',
        },
        date: 1,
        from: {
          first_name: 'Test',
          id: 42,
          is_bot: false,
        },
        message_id: 1,
        text: 'check wallet GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME',
      },
    };
    let releaseUpdateProcessing: (() => void) | undefined;
    const updateProcessingStarted = Promise.withResolvers<void>();
    const updateProcessingReleased = new Promise<void>((resolve) => {
      releaseUpdateProcessing = resolve;
    });
    const handleUpdate = vi.fn(async () => {
      updateProcessingStarted.resolve();
      await updateProcessingReleased;
    });
    const bot = {
      api: {
        setWebhook: vi.fn(),
      },
      handleUpdate,
    } as unknown as Bot;
    const server = createTelegramServer({
      bot,
      webhookSecret: WEBHOOK_SECRET,
      webhookUrl,
    });

    const baseUrl = await listen(server);
    const firstResponse = await fetch(`${baseUrl}${getWebhookPath(webhookUrl)}`, {
      body: JSON.stringify(duplicateUpdate),
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      },
      method: 'POST',
    });

    expect(firstResponse.status).toBe(200);
    await updateProcessingStarted.promise;

    const duplicateResponse = await fetch(
      `${baseUrl}${getWebhookPath(webhookUrl)}`,
      {
        body: JSON.stringify(duplicateUpdate),
        headers: {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
        },
        method: 'POST',
      },
    );

    expect(duplicateResponse.status).toBe(200);
    expect(handleUpdate).toHaveBeenCalledTimes(1);

    releaseUpdateProcessing?.();
  });
});