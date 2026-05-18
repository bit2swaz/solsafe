import { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import {
  createBot,
  handleStartCommand,
  handleTextMessage,
} from '../../src/telegram/bot.js';

describe('telegram bot', () => {
  it('creates a grammY bot instance', () => {
    const bot = createBot('test-token');

    expect(bot).toBeInstanceOf(Bot);
  });

  it('responds to /start', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await handleStartCommand({ reply } as never);

    expect(reply).toHaveBeenCalledWith(
      'Welcome to SolSafe. Send a wallet, token, or transaction to inspect.',
    );
  });

  it('echoes text messages', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await handleTextMessage({
      message: { text: 'gm solsafe' },
      reply,
    } as never);

    expect(reply).toHaveBeenCalledWith('Echo: gm solsafe');
  });
});