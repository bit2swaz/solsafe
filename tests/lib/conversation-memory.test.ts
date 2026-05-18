import { describe, expect, it, vi } from 'vitest';

import {
  createSolsafeConversationMemory,
  type ConversationMemorySupabaseClient,
} from '../../src/lib/conversation-memory.js';
import type { ConversationMemoryRow } from '../../src/lib/supabase.js';

const STORED_ROW: ConversationMemoryRow = {
  id: '8edb2f50-8ffd-48c0-af75-bdbb151ac786',
  user_id: 'telegram:1234',
  session_id: 'session-abc',
  memory_key: 'history',
  value: {
    messages: [
      {
        type: 'human',
        content: 'check wallet 8vFzX...',
      },
      {
        type: 'ai',
        content: 'Wallet 8vFzX... has been active for 234 days.',
      },
    ],
  },
  created_at: '2026-05-18T18:00:00.000Z',
  updated_at: '2026-05-18T18:00:00.000Z',
};

describe('supabase conversation memory', () => {
  it('loads persisted history as LangChain-compatible messages', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: STORED_ROW,
      error: null,
    });
    const eqMemoryKeyMock = vi.fn().mockReturnValue({
      maybeSingle: maybeSingleMock,
    });
    const eqUserIdMock = vi.fn().mockReturnValue({ eq: eqMemoryKeyMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqUserIdMock });
    const supabaseClient: ConversationMemorySupabaseClient = {
      from: vi.fn(() => ({
        select: selectMock,
        upsert: vi.fn(),
      })) as unknown as ConversationMemorySupabaseClient['from'],
    };
    const memory = createSolsafeConversationMemory({ supabaseClient });

    const memoryVariables = await memory.loadMemoryVariables({
      sessionId: 'session-abc',
      userId: 'telegram:1234',
    });

    const history = memoryVariables.history;

    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqUserIdMock).toHaveBeenCalledWith('user_id', 'telegram:1234');
    expect(eqMemoryKeyMock).toHaveBeenCalledWith('memory_key', 'history');
    expect(history).toHaveLength(2);
    expect(history[0]?.getType()).toBe('human');
    expect(history[0]?.content).toBe('check wallet 8vFzX...');
    expect(history[1]?.getType()).toBe('ai');
    expect(history[1]?.content).toBe(
      'Wallet 8vFzX... has been active for 234 days.',
    );
  });

  it('appends the latest turn before persisting conversation memory', async () => {
    const maybeSingleMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: STORED_ROW,
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...STORED_ROW,
          updated_at: '2026-05-18T18:01:00.000Z',
          value: {
            messages: [
              ...((STORED_ROW.value.messages as Array<Record<string, string>>) ?? []),
              {
                type: 'human',
                content: 'what about BONK?',
              },
              {
                type: 'ai',
                content: 'BONK scores 92/100 on RugCheck.',
              },
            ],
          },
        },
        error: null,
      });
    const eqMemoryKeyMock = vi.fn().mockReturnValue({
      maybeSingle: maybeSingleMock,
    });
    const eqUserIdMock = vi.fn().mockReturnValue({ eq: eqMemoryKeyMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqUserIdMock });
    const upsertSelectMock = vi.fn().mockResolvedValue({
      data: [
        {
          ...STORED_ROW,
          updated_at: '2026-05-18T18:01:00.000Z',
        },
      ],
      error: null,
    });
    const upsertMock = vi.fn().mockReturnValue({
      select: upsertSelectMock,
    });
    const supabaseClient: ConversationMemorySupabaseClient = {
      from: vi.fn(() => ({
        select: selectMock,
        upsert: upsertMock,
      })) as unknown as ConversationMemorySupabaseClient['from'],
    };
    const memory = createSolsafeConversationMemory({ supabaseClient });

    await memory.saveContext(
      {
        input: 'what about BONK?',
        sessionId: 'session-abc',
        userId: 'telegram:1234',
      },
      {
        output: 'BONK scores 92/100 on RugCheck.',
      },
    );

    const memoryVariables = await memory.loadMemoryVariables({
      sessionId: 'session-abc',
      userId: 'telegram:1234',
    });
    const history = memoryVariables.history;

    expect(upsertMock).toHaveBeenCalledWith(
      {
        memory_key: 'history',
        session_id: 'session-abc',
        updated_at: expect.any(String),
        user_id: 'telegram:1234',
        value: {
          messages: [
            {
              type: 'human',
              content: 'check wallet 8vFzX...',
            },
            {
              type: 'ai',
              content: 'Wallet 8vFzX... has been active for 234 days.',
            },
            {
              type: 'human',
              content: 'what about BONK?',
            },
            {
              type: 'ai',
              content: 'BONK scores 92/100 on RugCheck.',
            },
          ],
        },
      },
      { onConflict: 'user_id,memory_key' },
    );
    expect(upsertSelectMock).toHaveBeenCalledWith('*');
    expect(history).toHaveLength(4);
    expect(history[2]?.content).toBe('what about BONK?');
    expect(history[3]?.content).toBe('BONK scores 92/100 on RugCheck.');
  });
});