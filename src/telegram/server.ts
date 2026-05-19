import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { type Bot } from 'grammy';

import { createBot } from './bot.js';

const TELEGRAM_WEBHOOK_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const TELEGRAM_UPDATE_TTL_MS = 15 * 60_000;

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

type TelegramUpdate = {
  update_id?: number;
  callback_query?: {
    from?: {
      id?: number | string;
    };
    message?: {
      chat?: {
        id?: number | string;
      };
    };
  };
  channel_post?: {
    chat?: {
      id?: number | string;
    };
  };
  chat_join_request?: {
    from?: {
      id?: number | string;
    };
  };
  chat_member?: {
    from?: {
      id?: number | string;
    };
  };
  chosen_inline_result?: {
    from?: {
      id?: number | string;
    };
  };
  edited_channel_post?: {
    chat?: {
      id?: number | string;
    };
  };
  edited_message?: {
    chat?: {
      id?: number | string;
    };
  };
  inline_query?: {
    from?: {
      id?: number | string;
    };
  };
  message?: {
    chat?: {
      id?: number | string;
    };
  };
  my_chat_member?: {
    from?: {
      id?: number | string;
    };
  };
  pre_checkout_query?: {
    from?: {
      id?: number | string;
    };
  };
  shipping_query?: {
    from?: {
      id?: number | string;
    };
  };
};

class TelegramUpdateQueue {
  private readonly recentUpdateIds = new Map<number, number>();
  private readonly chatQueues = new Map<string, Promise<void>>();

  enqueue(update: TelegramUpdate, task: () => Promise<void>): boolean {
    this.pruneExpiredUpdateIds();

    const updateId = typeof update.update_id === 'number' ? update.update_id : null;

    if (updateId !== null && this.recentUpdateIds.has(updateId)) {
      return false;
    }

    if (updateId !== null) {
      this.recentUpdateIds.set(updateId, Date.now() + TELEGRAM_UPDATE_TTL_MS);
    }

    const queueKey = getTelegramUpdateQueueKey(update);
    const activeQueue = this.chatQueues.get(queueKey) ?? Promise.resolve();
    const queuedTask = activeQueue
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (this.chatQueues.get(queueKey) === queuedTask) {
          this.chatQueues.delete(queueKey);
        }
      });

    this.chatQueues.set(queueKey, queuedTask);

    return true;
  }

  private pruneExpiredUpdateIds(): void {
    const now = Date.now();

    for (const [updateId, expiresAt] of this.recentUpdateIds) {
      if (expiresAt <= now) {
        this.recentUpdateIds.delete(updateId);
      }
    }
  }
}

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
  const updateQueue = new TelegramUpdateQueue();
  const handleWebhook = options.webhookHandler ?? createQueuedWebhookHandler(bot, updateQueue);

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

function createQueuedWebhookHandler(
  bot: Bot,
  updateQueue: TelegramUpdateQueue,
): WebhookHandler {
  return async (req, res) => {
    const update = await readTelegramUpdate(req);
    const accepted = updateQueue.enqueue(update, async () => {
      try {
        await bot.handleUpdate(update as never);
      } catch (error) {
        console.error('Failed to process Telegram update', error);
      }
    });

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: accepted ? 'accepted' : 'duplicate' }));
  };
}

async function readTelegramUpdate(req: IncomingMessage): Promise<TelegramUpdate> {
  const body = await readRequestBody(req);

  try {
    return JSON.parse(body) as TelegramUpdate;
  } catch {
    throw new Error('Telegram webhook payload must be valid JSON.');
  }
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function getTelegramUpdateQueueKey(update: TelegramUpdate): string {
  const chatId =
    update.message?.chat?.id ??
    update.edited_message?.chat?.id ??
    update.channel_post?.chat?.id ??
    update.edited_channel_post?.chat?.id ??
    update.callback_query?.message?.chat?.id;

  if (chatId !== undefined && chatId !== null) {
    return `chat:${String(chatId)}`;
  }

  const userId =
    update.callback_query?.from?.id ??
    update.inline_query?.from?.id ??
    update.chosen_inline_result?.from?.id ??
    update.pre_checkout_query?.from?.id ??
    update.shipping_query?.from?.id ??
    update.my_chat_member?.from?.id ??
    update.chat_member?.from?.id ??
    update.chat_join_request?.from?.id;

  if (userId !== undefined && userId !== null) {
    return `user:${String(userId)}`;
  }

  return 'global';
}