import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { type Bot, webhookCallback } from 'grammy';

import { createBot } from './bot.js';

type WebhookHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

type CreateTelegramServerOptions = {
  bot?: Bot;
  webhookHandler?: WebhookHandler;
  webhookUrl?: string;
};

type StartTelegramServerOptions = CreateTelegramServerOptions & {
  port?: number;
};

export function getPort(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.PORT ?? '3000';
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 0) {
    throw new Error('PORT must be a non-negative integer');
  }

  return port;
}

export function getWebhookUrl(env: NodeJS.ProcessEnv = process.env): string {
  const webhookUrl = env.WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error('WEBHOOK_URL is required to configure the Telegram webhook');
  }

  return webhookUrl;
}

export function getWebhookPath(webhookUrl = getWebhookUrl()): string {
  return new URL(webhookUrl).pathname || '/';
}

export function createTelegramServer(
  options: CreateTelegramServerOptions = {},
): Server {
  const webhookUrl = options.webhookUrl ?? getWebhookUrl();
  const bot = options.bot ?? createBot();
  const webhookPath = getWebhookPath(webhookUrl);
  const handleWebhook =
    options.webhookHandler ?? webhookCallback(bot, 'http');

  return createServer(async (req, res) => {
    const requestUrl = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`,
    );

    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === webhookPath) {
      try {
        await handleWebhook(req, res);
      } catch {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
        }

        if (!res.writableEnded) {
          res.end(JSON.stringify({ error: 'Webhook handling failed' }));
        }
      }

      return;
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

export async function startTelegramServer(
  options: StartTelegramServerOptions = {},
): Promise<Server> {
  const bot = options.bot ?? createBot();
  const webhookUrl = options.webhookUrl ?? getWebhookUrl();
  const port = options.port ?? getPort();
  const server = createTelegramServer({
    bot,
    webhookHandler: options.webhookHandler,
    webhookUrl,
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    await bot.api.setWebhook(webhookUrl);
  } catch (error) {
    await new Promise<void>((resolve, reject) => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve();
      });
    });

    throw error;
  }

  return server;
}