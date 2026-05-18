import { config } from 'dotenv';
import { Bot } from 'grammy';

config();

const START_RESPONSE =
  'Welcome to SolSafe. Send a wallet, token, or transaction to inspect.';

type ReplyHandlerContext = {
  reply: (text: string) => Promise<unknown>;
};

type TextMessageHandlerContext = ReplyHandlerContext & {
  message: {
    text: string;
  };
};

export async function handleStartCommand(
  ctx: ReplyHandlerContext,
): Promise<void> {
  await ctx.reply(START_RESPONSE);
}

export async function handleTextMessage(
  ctx: TextMessageHandlerContext,
): Promise<void> {
  await ctx.reply(`Echo: ${ctx.message.text}`);
}

export function getBotToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.BOT_TOKEN;

  if (!token) {
    throw new Error('BOT_TOKEN is required to create the Telegram bot');
  }

  return token;
}

export function registerBotHandlers(bot: Bot): Bot {
  bot.command('start', (ctx) => handleStartCommand(ctx));
  bot.on('message:text', (ctx) => handleTextMessage(ctx));

  return bot;
}

export function createBot(token = getBotToken()): Bot {
  return registerBotHandlers(new Bot(token));
}