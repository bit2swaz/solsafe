import { config } from 'dotenv';
import { Bot, InlineKeyboard } from 'grammy';

import {
  appendSolsafeSafetyDisclaimer,
  createSolsafeAgent,
  executeSolsafeTurn,
  type SolsafeAgent,
} from '../agents/solsafe-agent.js';
import {
  createSupabaseIdentityBridge,
  type IdentityBridgeStore,
} from '../lib/identity-bridge.js';
import {
  createSupabaseQueryHistoryStore,
  type QueryHistoryStore,
} from '../lib/query-history.js';

config();

const START_RESPONSE =
  'Welcome to SolSafe. Send a wallet, token, or transaction to inspect.';
const CONFIRM_USAGE_RESPONSE = 'Usage: /confirm <wallet-address>';
const DEFAULT_DASHBOARD_ORIGIN = 'http://localhost:3000';
const LINK_RESPONSE = [
  'Open the SolSafe dashboard and sign in with Solana to choose the wallet you want to link.',
  'After SIWS succeeds, come back here and send /confirm <wallet-address>.',
].join('\n');
const LINK_SUCCESS_RESPONSE =
  'Refresh the dashboard to see linked history.';

type ReplyOptions = {
  reply_markup?: InlineKeyboard;
};

type ReplyHandlerContext = {
  reply: (text: string, other?: ReplyOptions) => Promise<unknown>;
};

type TelegramUserContext = ReplyHandlerContext & {
  from?: {
    id: number | string;
  };
};

type TextMessageHandlerContext = TelegramUserContext & {
  chat?: {
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
  env?: NodeJS.ProcessEnv;
  identityBridge?: IdentityBridgeStore;
  queryHistoryStore?: QueryHistoryStore;
}

export async function handleStartCommand(
  ctx: ReplyHandlerContext,
): Promise<void> {
  await ctx.reply(START_RESPONSE);
}

export async function handleLinkCommand(
  ctx: ReplyHandlerContext,
  dependencies: TelegramBotDependencies = {},
): Promise<void> {
  const keyboard = new InlineKeyboard().url(
    'Open SolSafe Dashboard',
    getDashboardUrl(dependencies.env),
  );

  await ctx.reply(LINK_RESPONSE, {
    reply_markup: keyboard,
  });
}

export async function handleConfirmCommand(
  ctx: TelegramUserContext & {
    message?: {
      text?: string;
    };
    msg?: {
      text?: string;
    };
  },
  dependencies: TelegramBotDependencies = {},
): Promise<void> {
  const walletAddress = getConfirmWalletAddress(getTelegramCommandText(ctx));

  if (!walletAddress) {
    await ctx.reply(CONFIRM_USAGE_RESPONSE);
    return;
  }

  const identityBridge =
    dependencies.identityBridge ?? createSupabaseIdentityBridge();
  const linkedWallet = await identityBridge.linkTelegramToWallet(
    getTelegramUserId(ctx),
    walletAddress,
  );

  await ctx.reply(
    `Linked your Telegram account to ${linkedWallet.wallet_address}. ${LINK_SUCCESS_RESPONSE}`,
  );
}

export async function handleTextMessage(
  ctx: TextMessageHandlerContext,
  dependencies: TelegramBotDependencies = {},
): Promise<void> {
  const message = ctx.message.text.trim();

  if (isTelegramCommand(message)) {
    return;
  }

  const userId = getTelegramUserId(ctx);
  const sessionId = getTelegramSessionId(ctx);
  const agent = dependencies.agent ?? createSolsafeAgent();
  const executeTurn = dependencies.executeTurn ?? executeSolsafeTurn;
  const queryHistoryStore =
    dependencies.queryHistoryStore ?? createSupabaseQueryHistoryStore();

  try {
    const turn = await executeTurn({
      agent,
      message,
      sessionId,
      userId,
    });
    const responseSummary = appendSolsafeSafetyDisclaimer(turn.response);

    await ctx.reply(responseSummary);
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
  } catch (error) {
    const intent = agent.routeIntent(message);
    const responseSummary = appendSolsafeSafetyDisclaimer(
      formatTelegramTurnError(error),
    );

    await ctx.reply(responseSummary);
    await queryHistoryStore.saveQueryHistoryEntry({
      intent,
      metadata: {
        error: true,
        skillName: agent.getSkillForIntent(intent)?.name ?? null,
        source: 'telegram',
      },
      queryText: message,
      responseSummary,
      sessionId,
      userId,
    });
  }
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
  bot.command('link', (ctx) => handleLinkCommand(ctx, dependencies));
  bot.command('confirm', (ctx) => handleConfirmCommand(ctx, dependencies));
  bot.on('message:text', (ctx) => handleTextMessage(ctx, dependencies));

  return bot;
}

export function createBot(
  token = getBotToken(),
  dependencies: TelegramBotDependencies = {},
): Bot {
  return registerBotHandlers(new Bot(token), dependencies);
}

function getTelegramUserId(ctx: TelegramUserContext): string {
  const userId = ctx.from?.id;

  if (userId === undefined || userId === null) {
    throw new Error('Telegram text messages require ctx.from.id');
  }

  return `telegram:${String(userId)}`;
}

function getConfirmWalletAddress(message: string): string | null {
  const match = message.trim().match(/^\/confirm(?:@\w+)?(?:\s+(.+))?$/);
  const walletAddress = match?.[1]?.trim();

  return walletAddress || null;
}

function getTelegramCommandText(
  ctx: TelegramUserContext & {
    message?: {
      text?: string;
    };
    msg?: {
      text?: string;
    };
  },
): string {
  return ctx.message?.text ?? ctx.msg?.text ?? '';
}

function getDashboardUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawUrl = env.SIWS_ORIGIN?.trim() || DEFAULT_DASHBOARD_ORIGIN;

  try {
    return new URL(rawUrl).toString().replace(/\/$/, '');
  } catch {
    throw new Error('SIWS_ORIGIN must be a valid URL for Telegram linking.');
  }
}

function isTelegramCommand(message: string): boolean {
  return /^\/\w+/.test(message.trim());
}

function getTelegramSessionId(ctx: TextMessageHandlerContext): string {
  const chatId = ctx.chat?.id;

  if (chatId === undefined || chatId === null) {
    throw new Error('Telegram text messages require ctx.chat.id');
  }

  return `telegram-chat:${String(chatId)}`;
}

function formatTelegramTurnError(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message.trim() : '';

  if (/valid base64-encoded Solana transaction/i.test(errorMessage)) {
    return 'I could not parse that transaction. Send the full base64-encoded Solana transaction you want simulated.';
  }

  if (/I couldn't resolve .* token mint address/i.test(errorMessage)) {
    return errorMessage;
  }

  if (/token mint address or known token symbol is required/i.test(errorMessage)) {
    return 'I could not resolve that token. Send the token mint address to run a token security check.';
  }

  if (/At least one Solana program log line is required/i.test(errorMessage)) {
    return 'I could not find any Solana program log lines in that message. Paste the raw logs you want explained.';
  }

  if (/valid Solana wallet address/i.test(errorMessage)) {
    return 'I could not find a valid Solana wallet address in that message. Send the wallet address you want inspected.';
  }

  return 'I could not complete that request. Please try again with a wallet address, token mint, base64 transaction, or raw program logs.';
}