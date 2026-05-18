import { createBot } from './telegram/bot.js';

const bot = createBot();

bot.catch((error) => {
  console.error('SolSafe bot error', error.error);
});

process.once('SIGINT', () => {
  void bot.stop();
});

process.once('SIGTERM', () => {
  void bot.stop();
});

console.log('Starting SolSafe Telegram bot...');

await bot.start();