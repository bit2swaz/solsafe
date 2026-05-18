import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBalanceMock, SolanaAgentKitMock } = vi.hoisted(() => {
  const getBalanceMock = vi.fn();
  const SolanaAgentKitMock = vi.fn(function SolanaAgentKit() {
    return {
      methods: {
        getBalance: getBalanceMock,
      },
    };
  });

  return {
    getBalanceMock,
    SolanaAgentKitMock,
  };
});

vi.mock('solana-agent-kit', () => ({
  SolanaAgentKit: SolanaAgentKitMock,
}));

import {
  createHeliusRpcUrl,
  createSolsafeSolanaAgentKit,
} from '../../src/lib/solana-agent-kit.js';

describe('solana agent kit wrapper', () => {
  beforeEach(() => {
    SolanaAgentKitMock.mockClear();
    getBalanceMock.mockReset();
  });

  it('initializes SolanaAgentKit with a Helius RPC URL', () => {
    const wallet = { publicKey: 'wallet' } as never;
    const rpcUrl = createHeliusRpcUrl('helius-test-key');

    const client = createSolsafeSolanaAgentKit({
      heliusApiKey: 'helius-test-key',
      wallet,
    });

    expect(rpcUrl).toBe('https://mainnet.helius-rpc.com/?api-key=helius-test-key');
    expect(SolanaAgentKitMock).toHaveBeenCalledWith(wallet, rpcUrl, {});
    expect(client.rpcUrl).toBe(rpcUrl);
  });

  it('proxies getBalance to the underlying SolanaAgentKit methods', async () => {
    const wallet = { publicKey: 'wallet' } as never;
    getBalanceMock.mockResolvedValueOnce(12.34);

    const client = createSolsafeSolanaAgentKit({
      heliusApiKey: 'helius-test-key',
      wallet,
    });

    await expect(client.getBalance()).resolves.toBe(12.34);
    expect(getBalanceMock).toHaveBeenCalledWith(undefined);
  });

  it('wraps Helius free-tier rate limit errors with a clearer message', async () => {
    const wallet = { publicKey: 'wallet' } as never;
    getBalanceMock.mockRejectedValueOnce(new Error('429 Too Many Requests'));

    const client = createSolsafeSolanaAgentKit({
      heliusApiKey: 'helius-test-key',
      wallet,
    });

    await expect(client.getBalance()).rejects.toThrow(
      'Helius free-tier rate limit hit while calling getBalance. Retry after the rate-limit window resets.',
    );
  });
});