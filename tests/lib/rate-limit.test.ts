import { describe, expect, it, vi } from 'vitest';

import {
  createSupabaseRateLimiter,
  type RateLimitSupabaseClient,
} from '../../src/lib/rate-limit.js';

describe('supabase rate limiter', () => {
  it('allows a request when the user is under the configured limit', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-05-18T18:00:10.000Z',
          id: '2068456b-c626-4f57-af94-c58d9e74e0b2',
        },
      ],
      error: null,
    });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const gteMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabaseClient: RateLimitSupabaseClient = {
      from: vi.fn(() => ({
        select: selectMock,
      })) as unknown as RateLimitSupabaseClient['from'],
    };
    const rateLimiter = createSupabaseRateLimiter({
      maxRequests: 2,
      now: () => new Date('2026-05-18T18:00:30.000Z'),
      supabaseClient,
      windowMs: 60_000,
    });

    await expect(
      rateLimiter.assertWithinRateLimit({ userId: 'telegram:1234' }),
    ).resolves.toBeUndefined();

    expect(selectMock).toHaveBeenCalledWith('id, created_at');
    expect(eqMock).toHaveBeenCalledWith('user_id', 'telegram:1234');
    expect(gteMock).toHaveBeenCalledWith(
      'created_at',
      '2026-05-18T17:59:30.000Z',
    );
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(2);
  });

  it('rejects a request when the user has exhausted the current rate-limit window', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-05-18T18:00:20.000Z',
          id: 'dcdb65fb-61c8-41eb-a23a-72374606695b',
        },
        {
          created_at: '2026-05-18T18:00:00.000Z',
          id: '8e62428e-fbde-4a83-9635-82b25d17f2bd',
        },
      ],
      error: null,
    });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const gteMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabaseClient: RateLimitSupabaseClient = {
      from: vi.fn(() => ({
        select: selectMock,
      })) as unknown as RateLimitSupabaseClient['from'],
    };
    const rateLimiter = createSupabaseRateLimiter({
      maxRequests: 2,
      now: () => new Date('2026-05-18T18:00:30.000Z'),
      supabaseClient,
      windowMs: 60_000,
    });

    await expect(
      rateLimiter.assertWithinRateLimit({ userId: 'telegram:1234' }),
    ).rejects.toThrow(
      'Per-user rate limit exceeded for telegram:1234. Retry after 30 seconds.',
    );
  });

  it('surfaces Supabase read failures with rate-limit-specific context', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'permission denied for table query_history',
      },
    });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const gteMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqMock = vi.fn().mockReturnValue({ gte: gteMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabaseClient: RateLimitSupabaseClient = {
      from: vi.fn(() => ({
        select: selectMock,
      })) as unknown as RateLimitSupabaseClient['from'],
    };
    const rateLimiter = createSupabaseRateLimiter({ supabaseClient });

    await expect(
      rateLimiter.assertWithinRateLimit({ userId: 'telegram:1234' }),
    ).rejects.toThrow(
      'Failed to read Supabase rate-limit state: permission denied for table query_history',
    );
  });
});