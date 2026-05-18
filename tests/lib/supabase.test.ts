import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

import {
  createSolsafeSupabaseClient,
  getSupabaseEnv,
} from '../../src/lib/supabase.js';

describe('supabase client wrapper', () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it('initializes the Supabase client with server-safe defaults', () => {
    const fakeClient = { from: vi.fn() };
    createClientMock.mockReturnValue(fakeClient);

    const client = createSolsafeSupabaseClient({
      supabaseUrl: 'https://solsafe.supabase.co',
      supabaseServiceRoleKey: 'service-role-key',
    });

    expect(client).toBe(fakeClient);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://solsafe.supabase.co',
      'service-role-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
      },
    );
  });

  it('reads Supabase configuration from the environment', () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = 'https://env-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'env-service-role-key';

    expect(getSupabaseEnv()).toEqual({
      supabaseUrl: 'https://env-project.supabase.co',
      supabaseServiceRoleKey: 'env-service-role-key',
    });

    process.env.SUPABASE_URL = previousUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  it('requires both Supabase URL and service role key', () => {
    expect(() =>
      createSolsafeSupabaseClient({
        supabaseUrl: '',
        supabaseServiceRoleKey: 'service-role-key',
      }),
    ).toThrow('SUPABASE_URL is required to initialize the Supabase client.');

    expect(() =>
      createSolsafeSupabaseClient({
        supabaseUrl: 'https://solsafe.supabase.co',
        supabaseServiceRoleKey: '',
      }),
    ).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY is required to initialize the Supabase client.',
    );
  });
});