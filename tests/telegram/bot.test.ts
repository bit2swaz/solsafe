import { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import {
  SOLSAFE_INTENTS,
  type SolsafeAgent,
} from '../../src/agents/solsafe-agent.js';
import type { QueryHistoryStore } from '../../src/lib/query-history.js';
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
});