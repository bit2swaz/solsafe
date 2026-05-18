import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseQueryHistoryStore,
  type QueryHistorySupabaseClient,
  type QueryHistoryRow,
} from '../../src/lib/query-history.js';

const INSERTED_ROW: QueryHistoryRow = {
  id: 'f839eef1-18c2-4e57-a0ea-c78dd0722d89',
  user_id: 'telegram:1234',
  session_id: 'session-abc',
  intent: 'wallet_lookup',
  query_text: 'check wallet 8vFzX...',
  response_summary: 'Wallet 8vFzX... has been active for 234 days.',
  metadata: {
    source: 'telegram',
    skillName: 'getWalletSummary',
  },
  created_at: '2026-05-18T17:00:00.000Z',
};

describe('query history store', () => {
  let selectMock: ReturnType<typeof vi.fn>;
  let insertMock: ReturnType<typeof vi.fn>;
  let fromMock: ReturnType<typeof vi.fn>;
  let supabaseClient: QueryHistorySupabaseClient;

  beforeEach(() => {
    selectMock = vi.fn();
    insertMock = vi.fn();
    fromMock = vi.fn((tableName: string) => {
      if (tableName === 'query_history') {
        return {
          insert: insertMock,
          select: selectMock,
        };
      }

      throw new Error(`Unexpected table requested in test: ${tableName}`);
    });
    supabaseClient = {
      from: fromMock as unknown as QueryHistorySupabaseClient['from'],
    };
  });

  it('stores a query history entry and returns the inserted record', async () => {
    const insertedSelectMock = vi.fn().mockResolvedValue({
      data: [INSERTED_ROW],
      error: null,
    });
    insertMock.mockReturnValue({
      select: insertedSelectMock,
    });
    const store = createSupabaseQueryHistoryStore({
      supabaseClient,
    });

    await expect(
      store.saveQueryHistoryEntry({
        userId: 'telegram:1234',
        sessionId: 'session-abc',
        intent: 'wallet_lookup',
        queryText: 'check wallet 8vFzX...',
        responseSummary: 'Wallet 8vFzX... has been active for 234 days.',
        metadata: {
          source: 'telegram',
          skillName: 'getWalletSummary',
        },
      }),
    ).resolves.toEqual(INSERTED_ROW);

    expect(fromMock).toHaveBeenCalledWith('query_history');
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'telegram:1234',
      session_id: 'session-abc',
      intent: 'wallet_lookup',
      query_text: 'check wallet 8vFzX...',
      response_summary: 'Wallet 8vFzX... has been active for 234 days.',
      metadata: {
        source: 'telegram',
        skillName: 'getWalletSummary',
      },
    });
    expect(insertedSelectMock).toHaveBeenCalledWith('*');
  });

  it('retrieves recent query history for a user in newest-first order', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        INSERTED_ROW,
        {
          ...INSERTED_ROW,
          id: '2d13b635-a4c7-464a-95cc-7286f0f0d9f8',
          intent: 'token_security',
          query_text: 'is BONK safe?',
          response_summary: 'BONK scores 92/100 on RugCheck.',
          created_at: '2026-05-18T16:59:00.000Z',
        },
      ],
      error: null,
    });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    selectMock.mockReturnValue({ eq: eqMock });
    const store = createSupabaseQueryHistoryStore({
      supabaseClient,
    });

    await expect(
      store.listRecentQueryHistory({
        userId: 'telegram:1234',
        limit: 2,
      }),
    ).resolves.toEqual([
      INSERTED_ROW,
      {
        ...INSERTED_ROW,
        id: '2d13b635-a4c7-464a-95cc-7286f0f0d9f8',
        intent: 'token_security',
        query_text: 'is BONK safe?',
        response_summary: 'BONK scores 92/100 on RugCheck.',
        created_at: '2026-05-18T16:59:00.000Z',
      },
    ]);

    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('user_id', 'telegram:1234');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(2);
  });

  it('surfaces Supabase insert failures with storage-specific context', async () => {
    const insertedSelectMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint',
      },
    });
    insertMock.mockReturnValue({
      select: insertedSelectMock,
    });
    const store = createSupabaseQueryHistoryStore({
      supabaseClient,
    });

    await expect(
      store.saveQueryHistoryEntry({
        userId: 'telegram:1234',
        sessionId: 'session-abc',
        intent: 'wallet_lookup',
        queryText: 'check wallet 8vFzX...',
        responseSummary: 'Wallet 8vFzX... has been active for 234 days.',
      }),
    ).rejects.toThrow(
      'Failed to store query history in Supabase: duplicate key value violates unique constraint',
    );
  });
});