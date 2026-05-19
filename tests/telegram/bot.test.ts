import { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import {
  SOLSAFE_INTENTS,
  type SolsafeAgent,
} from '../../src/agents/solsafe-agent.js';
import type { QueryHistoryStore } from '../../src/lib/query-history.js';
import {
  createBot,
      handleConfirmCommand,
  handleLinkCommand,
  handleStartCommand,
  handleTextMessage,
  registerBotHandlers,
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

  it('responds to /link with SIWS instructions and a dashboard button', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await handleLinkCommand(
      { reply } as never,
      {
        env: {
          SIWS_ORIGIN: 'https://dashboard.solsafe.example',
        } as NodeJS.ProcessEnv,
      },
    );

    expect(reply).toHaveBeenCalledWith(
      [
        'Open the SolSafe dashboard and sign in with Solana to choose the wallet you want to link.',
        'After SIWS succeeds, come back here and send /confirm <wallet-address>.',
      ].join('\n'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({
                text: 'Open SolSafe Dashboard',
                url: 'https://dashboard.solsafe.example',
              }),
            ],
          ],
        }),
      }),
    );
  });

  it('links the Telegram user to a wallet on /confirm', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const walletAddress = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
    const linkTelegramToWallet = vi.fn().mockResolvedValue({
      telegram_user_id: '42',
      wallet_address: walletAddress,
    });

    await handleConfirmCommand(
      {
        from: { id: 42 },
        message: { text: `/confirm ${walletAddress}` },
        reply,
      } as never,
      {
        identityBridge: {
          getWalletByTelegramId: vi.fn(),
          linkTelegramToWallet,
          listTelegramIdsByWallet: vi.fn(),
        },
      },
    );

    expect(linkTelegramToWallet).toHaveBeenCalledWith(
      'telegram:42',
      walletAddress,
    );
    expect(reply).toHaveBeenCalledWith(
      `Linked your Telegram account to ${walletAddress}. Refresh the dashboard to see linked history.`,
    );
  });

  it('shows /confirm usage when no wallet address is provided', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const linkTelegramToWallet = vi.fn();

    await handleConfirmCommand(
      {
        from: { id: 42 },
        message: { text: '/confirm' },
        reply,
      } as never,
      {
        identityBridge: {
          getWalletByTelegramId: vi.fn(),
          linkTelegramToWallet,
          listTelegramIdsByWallet: vi.fn(),
        },
      },
    );

    expect(linkTelegramToWallet).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      'Usage: /confirm <wallet-address>',
    );
  });

  it('registers /link and /confirm handlers alongside the text handler', () => {
    const command = vi.fn().mockReturnThis();
    const on = vi.fn().mockReturnThis();
    const bot = {
      command,
      on,
    } as unknown as Bot;

    const registeredBot = registerBotHandlers(bot);

    expect(command).toHaveBeenNthCalledWith(1, 'start', expect.any(Function));
    expect(command).toHaveBeenNthCalledWith(2, 'link', expect.any(Function));
    expect(command).toHaveBeenNthCalledWith(3, 'confirm', expect.any(Function));
    expect(on).toHaveBeenCalledWith('message:text', expect.any(Function));
    expect(registeredBot).toBe(bot);
  });

  it('passes text messages to the SolSafe agent and persists query history', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const agent = { id: 'agent-stub' } as unknown as SolsafeAgent;
    const executeTurn = vi.fn().mockResolvedValue({
      intent: SOLSAFE_INTENTS.WALLET_LOOKUP,
      response: 'Wallet summary ready.',
      skillName: 'getWalletSummary',
    });
    const saveQueryHistoryEntry = vi.fn().mockResolvedValue({
      id: 'history-row-id',
    });

    await handleTextMessage({
      chat: { id: 9001 },
      from: { id: 42 },
      message: { text: 'check wallet GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME' },
      reply,
    } as never, {
      agent,
      executeTurn,
      queryHistoryStore: {
        listRecentQueryHistory: vi.fn(),
        saveQueryHistoryEntry,
      } as unknown as QueryHistoryStore,
    });

    expect(executeTurn).toHaveBeenCalledWith({
      agent,
      message: 'check wallet GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME',
      sessionId: 'telegram-chat:9001',
      userId: 'telegram:42',
    });
    expect(reply).toHaveBeenCalledWith(
      [
        'Wallet summary ready.',
        'Always DYOR — this is not financial advice.',
      ].join('\n'),
    );
    expect(saveQueryHistoryEntry).toHaveBeenCalledWith({
      intent: SOLSAFE_INTENTS.WALLET_LOOKUP,
      metadata: {
        skillName: 'getWalletSummary',
        source: 'telegram',
      },
      queryText: 'check wallet GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME',
      responseSummary: [
        'Wallet summary ready.',
        'Always DYOR — this is not financial advice.',
      ].join('\n'),
      sessionId: 'telegram-chat:9001',
      userId: 'telegram:42',
    });
  });

  it('does not duplicate the DYOR line when the agent already includes it', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const executeTurn = vi.fn().mockResolvedValue({
      intent: SOLSAFE_INTENTS.TOKEN_SECURITY,
      response: [
        'BONK looks okay so far.',
        'Always DYOR — this is not financial advice.',
      ].join('\n'),
      skillName: 'checkTokenSecurity',
    });
    const saveQueryHistoryEntry = vi.fn().mockResolvedValue({
      id: 'history-row-id',
    });

    await handleTextMessage({
      chat: { id: 12 },
      from: { id: 7 },
      message: { text: 'is BONK safe?' },
      reply,
    } as never, {
      agent: {} as SolsafeAgent,
      executeTurn,
      queryHistoryStore: {
        listRecentQueryHistory: vi.fn(),
        saveQueryHistoryEntry,
      } as unknown as QueryHistoryStore,
    });

    expect(reply).toHaveBeenCalledWith(
      [
        'BONK looks okay so far.',
        'Always DYOR — this is not financial advice.',
      ].join('\n'),
    );
    expect(saveQueryHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        responseSummary: [
          'BONK looks okay so far.',
          'Always DYOR — this is not financial advice.',
        ].join('\n'),
      }),
    );
  });

  it('replies with a user-facing error when transaction simulation input is invalid', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const executeTurn = vi
      .fn()
      .mockRejectedValue(
        new Error('A valid base64-encoded Solana transaction is required.'),
      );
    const saveQueryHistoryEntry = vi.fn().mockResolvedValue({
      id: 'history-row-id',
    });
    const agent = {
      getSkillForIntent: vi.fn().mockReturnValue({
        name: 'simulateTransaction',
      }),
      routeIntent: vi.fn().mockReturnValue(
        SOLSAFE_INTENTS.TRANSACTION_SIMULATION,
      ),
    } as unknown as SolsafeAgent;

    await handleTextMessage({
      chat: { id: 21 },
      from: { id: 7 },
      message: {
        text: 'can you simulate this transaction before i sign it? bad-transaction',
      },
      reply,
    } as never, {
      agent,
      executeTurn,
      queryHistoryStore: {
        listRecentQueryHistory: vi.fn(),
        saveQueryHistoryEntry,
      } as unknown as QueryHistoryStore,
    });

    expect(reply).toHaveBeenCalledWith(
      [
        'I could not parse that transaction. Send the full base64-encoded Solana transaction you want simulated.',
        'Always DYOR — this is not financial advice.',
      ].join('\n'),
    );
    expect(saveQueryHistoryEntry).toHaveBeenCalledWith({
      intent: SOLSAFE_INTENTS.TRANSACTION_SIMULATION,
      metadata: {
        error: true,
        skillName: 'simulateTransaction',
        source: 'telegram',
      },
      queryText: 'can you simulate this transaction before i sign it? bad-transaction',
      responseSummary: [
        'I could not parse that transaction. Send the full base64-encoded Solana transaction you want simulated.',
        'Always DYOR — this is not financial advice.',
      ].join('\n'),
      sessionId: 'telegram-chat:21',
      userId: 'telegram:7',
    });
  });
});