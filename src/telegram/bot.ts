import { config } from 'dotenv';
import { Bot } from 'grammy';

import {
  appendSolsafeSafetyDisclaimer,
  createSolsafeAgent,
  executeSolsafeTurn,
  type SolsafeAgent,
} from '../agents/solsafe-agent.js';
import {
  createSupabaseQueryHistoryStore,
  type QueryHistoryStore,
} from '../lib/query-history.js';

config();

const START_RESPONSE =
  'Welcome to SolSafe. Send a wallet, token, or transaction to inspect.';

type ReplyHandlerContext = {
  reply: (text: string) => Promise<unknown>;
};

type TextMessageHandlerContext = ReplyHandlerContext & {
  chat?: {
    id: number | string;
  };
  from?: {
    id: number | string;
  };
  message: {
    text: string;
  };
};

type ExecuteTurn = typeof executeSolsafeTurn;

export interface TelegramBotDependencies {
  agent?: SolsafeAgent;
  executeTurn?: ExecuteTurn;
  queryHistoryStore?: QueryHistoryStore;
}

export async function handleStartCommand(
  ctx: ReplyHandlerContext,
): Promise<void> {
  await ctx.reply(START_RESPONSE);
}

export async function handleTextMessage(
  ctx: TextMessageHandlerContext,
  dependencies: TelegramBotDependencies = {},
): Promise<void> {
  const message = ctx.message.text.trim();
  const userId = getTelegramUserId(ctx);
  const sessionId = getTelegramSessionId(ctx);
  const agent = dependencies.agent ?? createSolsafeAgent();
  const executeTurn = dependencies.executeTurn ?? executeSolsafeTurn;
  const queryHistoryStore =
    dependencies.queryHistoryStore ?? createSupabaseQueryHistoryStore();
  const turn = await executeTurn({
    agent,
    message,
    sessionId,
    userId,
  });
  const responseSummary = appendSolsafeSafetyDisclaimer(turn.response);

  await queryHistoryStore.saveQueryHistoryEntry({
    intent: turn.intent,
    metadata: {
      skillName: turn.skillName,
      source: 'telegram',
    },
    queryText: message,
    responseSummary,
    sessionId,
    userId,
  });
  await ctx.reply(responseSummary);
}

export function getBotToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.BOT_TOKEN;

  if (!token) {
    throw new Error('BOT_TOKEN is required to create the Telegram bot');
  }

  return token;
}

export function registerBotHandlers(
  bot: Bot,
  dependencies: TelegramBotDependencies = {},
): Bot {
  bot.command('start', (ctx) => handleStartCommand(ctx));
  bot.on('message:text', (ctx) => handleTextMessage(ctx, dependencies));

  return bot;
}

export function createBot(
  token = getBotToken(),
  dependencies: TelegramBotDependencies = {},
): Bot {
  return registerBotHandlers(new Bot(token), dependencies);
}

function getTelegramUserId(ctx: TextMessageHandlerContext): string {
  const userId = ctx.from?.id;

  if (userId === undefined || userId === null) {
    throw new Error('Telegram text messages require ctx.from.id');
  }

  return `telegram:${String(userId)}`;
}

function getTelegramSessionId(ctx: TextMessageHandlerContext): string {
  const chatId = ctx.chat?.id;

  if (chatId === undefined || chatId === null) {
    throw new Error('Telegram text messages require ctx.chat.id');
  }

  return `telegram-chat:${String(chatId)}`;
}