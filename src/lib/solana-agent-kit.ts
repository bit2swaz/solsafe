import { SolanaAgentKit } from 'solana-agent-kit';

const HELIUS_RPC_HOSTS = {
  devnet: 'https://devnet.helius-rpc.com/',
  mainnet: 'https://mainnet.helius-rpc.com/',
} as const;

type HeliusNetwork = keyof typeof HELIUS_RPC_HOSTS;
type SolanaAgentKitWallet = ConstructorParameters<typeof SolanaAgentKit>[0];
type SolanaAgentKitConfig = ConstructorParameters<typeof SolanaAgentKit>[2];
type SolanaAgentKitWithBalance = InstanceType<typeof SolanaAgentKit> & {
  methods: {
    getBalance: (tokenMint?: unknown) => Promise<unknown>;
  };
};

export interface CreateSolsafeSolanaAgentKitOptions {
  wallet: SolanaAgentKitWallet;
  heliusApiKey?: string;
  rpcUrl?: string;
  config?: SolanaAgentKitConfig;
  network?: HeliusNetwork;
}

export interface SolsafeSolanaAgentKitClient {
  agentKit: SolanaAgentKitWithBalance;
  rpcUrl: string;
  getBalance(tokenMint?: unknown): Promise<unknown>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown Solana Agent Kit error';
}

function normalizeSolanaAgentKitError(error: unknown, operation: string): Error {
  const errorMessage = getErrorMessage(error);
  const normalizedMessage = errorMessage.toLowerCase();

  if (
    normalizedMessage.includes('429') ||
    normalizedMessage.includes('too many requests') ||
    normalizedMessage.includes('rate limit')
  ) {
    return new Error(
      `Helius free-tier rate limit hit while calling ${operation}. Retry after the rate-limit window resets.`,
    );
  }

  return error instanceof Error ? error : new Error(errorMessage);
}

export function createHeliusRpcUrl(
  apiKey: string,
  network: HeliusNetwork = 'mainnet',
): string {
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    throw new Error('HELIUS_API_KEY is required to build the Helius RPC URL.');
  }

  return `${HELIUS_RPC_HOSTS[network]}?api-key=${encodeURIComponent(normalizedApiKey)}`;
}

export function createSolsafeSolanaAgentKit(
  options: CreateSolsafeSolanaAgentKitOptions,
): SolsafeSolanaAgentKitClient {
  const rpcUrl =
    options.rpcUrl ??
    createHeliusRpcUrl(options.heliusApiKey ?? process.env.HELIUS_API_KEY ?? '', options.network);
  const agentKit = new SolanaAgentKit(
    options.wallet,
    rpcUrl,
    options.config ?? {},
  ) as SolanaAgentKitWithBalance;

  return {
    agentKit,
    rpcUrl,
    async getBalance(tokenMint?: unknown) {
      try {
        return await agentKit.methods.getBalance(tokenMint);
      } catch (error) {
        throw normalizeSolanaAgentKitError(error, 'getBalance');
      }
    },
  };
}