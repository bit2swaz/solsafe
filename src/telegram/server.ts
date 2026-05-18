import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { type Bot, webhookCallback } from 'grammy';

import { createBot } from './bot.js';

const TELEGRAM_WEBHOOK_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

type WebhookHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

type CreateTelegramServerOptions = {
  bot?: Bot;
  webhookHandler?: WebhookHandler;
  webhookSecret?: string;
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

export function getWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';

  if (!webhookSecret) {
    throw new Error(
      'TELEGRAM_WEBHOOK_SECRET is required to configure the Telegram webhook',
    );
  }

  return webhookSecret;
}

export function getWebhookPath(webhookUrl = getWebhookUrl()): string {
  return new URL(webhookUrl).pathname || '/';
}

export function createTelegramServer(
  options: CreateTelegramServerOptions = {},
): Server {
  const webhookUrl = options.webhookUrl ?? getWebhookUrl();
  const webhookSecret = options.webhookSecret ?? getWebhookSecret();
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
      if (!hasValidTelegramWebhookSecret(req, webhookSecret)) {
        res.statusCode = 403;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid Telegram webhook secret.' }));
        return;
      }

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
  const webhookSecret = options.webhookSecret ?? getWebhookSecret();
  const webhookUrl = options.webhookUrl ?? getWebhookUrl();
  const port = options.port ?? getPort();
  const server = createTelegramServer({
    bot,
    webhookHandler: options.webhookHandler,
    webhookSecret,
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
    await bot.api.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
    });
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

function hasValidTelegramWebhookSecret(
  req: IncomingMessage,
  expectedSecret: string,
): boolean {
  const receivedSecretHeader = req.headers[TELEGRAM_WEBHOOK_SECRET_HEADER];
  const receivedSecret = Array.isArray(receivedSecretHeader)
    ? receivedSecretHeader[0] ?? ''
    : receivedSecretHeader ?? '';

  return safeCompareSecrets(receivedSecret, expectedSecret);
}

function safeCompareSecrets(receivedSecret: string, expectedSecret: string): boolean {
  const receivedBuffer = Buffer.from(receivedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}