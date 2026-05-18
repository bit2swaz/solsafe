import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from '@solana/web3.js';
import type { BaseWallet } from 'solana-agent-kit';

import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';
import {
  createHeliusRpcUrl,
  createSolsafeSolanaAgentKit,
} from '../lib/solana-agent-kit.js';

export const GET_WALLET_SUMMARY_SKILL_NAME = 'getWalletSummary';

const GET_WALLET_SUMMARY_INTENT: SolsafeIntent = 'wallet_lookup';
const DEFAULT_CACHE_TTL_MS = 300_000;
const DEFAULT_RECENT_SIGNATURE_LIMIT = 10;
const DEFAULT_SIGNATURE_PAGE_LIMIT = 1_000;
const DEFAULT_MAX_SIGNATURE_PAGES = 10;
const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD6tDc5sWc5oAWnqLBaQx2R: 'USDT',
};
const KNOWN_ADDRESS_LABELS: Record<string, string> = {
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: 'Jupiter',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE: 'Jupiter',
};

export interface GetWalletSummaryInput {
  walletAddress: string;
}

export interface WalletTokenHolding {
  amount: number;
  mintAddress?: string;
  symbol: string;
}

export interface WalletRecentTransaction {
  relativeTime: string;
  signature?: string;
  summary: string;
}

export interface WalletSummarySnapshot {
  walletAddress: string;
  solBalance: number;
  tokenHoldings: WalletTokenHolding[];
  walletAgeDays: number;
  recentTransaction: WalletRecentTransaction;
  recentTransactionCount?: number;
}

export interface GetWalletSummaryResult {
  status: 'success';
  cached: boolean;
  summary: string;
  walletAddress: string;
  data: WalletSummarySnapshot;
}

export interface WalletSummaryDataSource {
  getWalletSummarySnapshot(
    input: GetWalletSummaryInput,
  ): Promise<WalletSummarySnapshot>;
}

export interface WalletSummaryCache {
  get(cacheKey: string): Promise<GetWalletSummaryResult | null>;
  set(cacheKey: string, result: GetWalletSummaryResult): Promise<void>;
}

export interface CreateGetWalletSummarySkillOptions {
  cache?: WalletSummaryCache;
  dataSource?: WalletSummaryDataSource;
}

export interface CreateInMemoryWalletSummaryCacheOptions {
  now?: () => Date;
  ttlMs?: number;
}

export interface CreateHeliusWalletSummaryDataSourceOptions {
  heliusApiKey?: string;
  maxSignaturePages?: number;
  now?: () => Date;
  recentTransactionLimit?: number;
  rpcUrl?: string;
}

interface CacheEntry {
  expiresAt: number;
  result: GetWalletSummaryResult;
}

interface ParsedInstructionInfo {
  info?: Record<string, unknown>;
  type?: string;
}

export function createInMemoryWalletSummaryCache(
  options: CreateInMemoryWalletSummaryCacheOptions = {},
): WalletSummaryCache {
  const cache = new Map<string, CacheEntry>();
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? (() => new Date());

  return {
    async get(cacheKey) {
      const cacheEntry = cache.get(cacheKey);

      if (!cacheEntry) {
        return null;
      }

      if (cacheEntry.expiresAt <= now().getTime()) {
        cache.delete(cacheKey);
        return null;
      }

      return cacheEntry.result;
    },
    async set(cacheKey, result) {
      cache.set(cacheKey, {
        expiresAt: now().getTime() + ttlMs,
        result,
      });
    },
  };
}

export function createHeliusWalletSummaryDataSource(
  options: CreateHeliusWalletSummaryDataSourceOptions = {},
): WalletSummaryDataSource {
  return {
    async getWalletSummarySnapshot(input) {
      const walletAddress = normalizeWalletAddress(input.walletAddress);
      const owner = new PublicKey(walletAddress);
      const rpcUrl =
        options.rpcUrl ??
        createHeliusRpcUrl(options.heliusApiKey ?? process.env.HELIUS_API_KEY ?? '');
      const connection = new Connection(rpcUrl, 'confirmed');
      const now = options.now ?? (() => new Date());
      const recentTransactionLimit =
        options.recentTransactionLimit ?? DEFAULT_RECENT_SIGNATURE_LIMIT;
      const recentSignatures = await connection.getSignaturesForAddress(
        owner,
        {
          limit: recentTransactionLimit,
        },
        'confirmed',
      );
      const latestSignature = recentSignatures[0] ?? null;

      const [solBalance, tokenHoldings, walletAgeDays, recentTransaction] =
        await Promise.all([
          getWalletSolBalance(connection, rpcUrl, owner),
          getWalletTokenHoldings(connection, owner),
          getWalletAgeDays(connection, owner, now, options.maxSignaturePages),
          getRecentTransactionSummary(connection, walletAddress, latestSignature, now),
        ]);

      return {
        walletAddress,
        solBalance,
        tokenHoldings,
        walletAgeDays,
        recentTransaction,
        recentTransactionCount: recentSignatures.length,
      };
    },
  };
}

export function createGetWalletSummarySkill(
  options: CreateGetWalletSummarySkillOptions = {},
): SolsafeSkill<GetWalletSummaryInput, GetWalletSummaryResult> {
  const cache = options.cache ?? createInMemoryWalletSummaryCache();
  const dataSource = options.dataSource ?? createHeliusWalletSummaryDataSource();

  return {
    name: GET_WALLET_SUMMARY_SKILL_NAME,
    description:
      'Summarizes SOL balance, token holdings, wallet age, and recent transaction activity for a Solana wallet.',
    intent: GET_WALLET_SUMMARY_INTENT,
    async execute(input) {
      const walletAddress = normalizeWalletAddress(input.walletAddress);
      const cacheKey = `wallet-summary:${walletAddress}`;
      const cachedResult = await cache.get(cacheKey);

      if (cachedResult) {
        return {
          ...cachedResult,
          cached: true,
        };
      }

      const data = await dataSource.getWalletSummarySnapshot({
        walletAddress,
      });
      const result: GetWalletSummaryResult = {
        status: 'success',
        cached: false,
        walletAddress,
        summary: formatWalletSummary(data),
        data,
      };

      await cache.set(cacheKey, result);

      return result;
    },
  };
}

function normalizeWalletAddress(walletAddress: string): string {
  const normalizedWalletAddress = walletAddress.trim();

  if (!normalizedWalletAddress) {
    throw new Error('A valid Solana wallet address is required.');
  }

  try {
    return new PublicKey(normalizedWalletAddress).toBase58();
  } catch {
    throw new Error('A valid Solana wallet address is required.');
  }
}

function formatWalletSummary(snapshot: WalletSummarySnapshot): string {
  return [
    `Wallet ${snapshot.walletAddress} has been active for ${snapshot.walletAgeDays} days.`,
    formatBalanceLine(snapshot.solBalance, snapshot.tokenHoldings),
    `Last transaction: ${formatRecentTransaction(snapshot.recentTransaction)}.`,
  ].join('\n');
}

function formatBalanceLine(
  solBalance: number,
  tokenHoldings: WalletTokenHolding[],
): string {
  const balanceParts = [
    `${formatAmount(solBalance)} SOL`,
    ...tokenHoldings
      .slice()
      .slice(0, 3)
      .map((holding) => `${formatAmount(holding.amount)} ${holding.symbol}`),
  ];

  return `Current balance: ${joinWithOxfordComma(balanceParts)}.`;
}

function formatRecentTransaction(transaction: WalletRecentTransaction): string {
  if (!transaction.summary) {
    return 'No recent transactions found';
  }

  return `${transaction.relativeTime} (${transaction.summary})`;
}

function joinWithOxfordComma(items: string[]): string {
  if (items.length === 0) {
    return '0 SOL';
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function formatAmount(amount: number): string {
  const absoluteAmount = Math.abs(amount);
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  });

  if (absoluteAmount >= 10_000) {
    const abbreviatedAmount = absoluteAmount / 1_000;
    const formattedAmount = Number.isInteger(abbreviatedAmount)
      ? abbreviatedAmount.toString()
      : formatter.format(abbreviatedAmount).replace(/\.0$/, '');

    return `${amount < 0 ? '-' : ''}${formattedAmount}k`;
  }

  return formatter.format(amount);
}

async function getWalletSolBalance(
  connection: Connection,
  rpcUrl: string,
  publicKey: PublicKey,
): Promise<number> {
  try {
    const balanceClient = createSolsafeSolanaAgentKit({
      rpcUrl,
      wallet: createReadOnlyWallet(publicKey),
    });
    const solBalance = await balanceClient.getBalance();

    return Number(solBalance);
  } catch (error) {
    if (!isMissingBalanceMethodError(error)) {
      throw error;
    }

    const lamports = await connection.getBalance(publicKey, 'confirmed');
    return lamports / LAMPORTS_PER_SOL;
  }
}

function createReadOnlyWallet(publicKey: PublicKey): BaseWallet {
  const throwReadOnlyWalletError = async <T>(value?: T): Promise<T> => {
    void value;
    throw new Error('Read-only wallets cannot sign or send transactions.');
  };

  return {
    publicKey,
    signTransaction: throwReadOnlyWalletError as BaseWallet['signTransaction'],
    signAllTransactions:
      throwReadOnlyWalletError as BaseWallet['signAllTransactions'],
    signAndSendTransaction:
      throwReadOnlyWalletError as BaseWallet['signAndSendTransaction'],
    signMessage: throwReadOnlyWalletError as BaseWallet['signMessage'],
  };
}

function isMissingBalanceMethodError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /getbalance|not a function|undefined/i.test(error.message);
}

async function getWalletTokenHoldings(
  connection: Connection,
  owner: PublicKey,
): Promise<WalletTokenHolding[]> {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    owner,
    {
      programId: TOKEN_PROGRAM_ID,
    },
    'confirmed',
  );
  const holdings: WalletTokenHolding[] = [];

  for (const tokenAccount of tokenAccounts.value) {
    const parsedInfo = tokenAccount.account.data.parsed.info as {
      mint: string;
      tokenAmount: {
        uiAmount?: number | null;
        uiAmountString?: string;
      };
    };
    const amount = Number(
      parsedInfo.tokenAmount.uiAmountString ?? parsedInfo.tokenAmount.uiAmount ?? 0,
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    holdings.push({
        amount,
        mintAddress: parsedInfo.mint,
        symbol: KNOWN_TOKEN_SYMBOLS[parsedInfo.mint] ?? shortenPublicKey(parsedInfo.mint),
      });
  }

  return holdings.sort((left, right) => right.amount - left.amount).slice(0, 3);
}

async function getWalletAgeDays(
  connection: Connection,
  owner: PublicKey,
  now: () => Date,
  maxSignaturePages = DEFAULT_MAX_SIGNATURE_PAGES,
): Promise<number> {
  let before: string | undefined;
  let oldestBlockTime: number | null = null;

  for (let pageIndex = 0; pageIndex < maxSignaturePages; pageIndex += 1) {
    const signatures = await connection.getSignaturesForAddress(
      owner,
      {
        before,
        limit: DEFAULT_SIGNATURE_PAGE_LIMIT,
      },
      'confirmed',
    );

    if (signatures.length === 0) {
      break;
    }

    for (const signatureInfo of signatures.slice().reverse()) {
      if (typeof signatureInfo.blockTime === 'number') {
        oldestBlockTime = signatureInfo.blockTime;
        break;
      }
    }

    if (signatures.length < DEFAULT_SIGNATURE_PAGE_LIMIT) {
      break;
    }

    before = signatures.at(-1)?.signature;
  }

  if (oldestBlockTime === null) {
    return 0;
  }

  const ageInMilliseconds = now().getTime() - oldestBlockTime * 1_000;

  return Math.max(0, Math.floor(ageInMilliseconds / 86_400_000));
}

async function getRecentTransactionSummary(
  connection: Connection,
  walletAddress: string,
  latestSignature: ConfirmedSignatureInfo | null,
  now: () => Date,
): Promise<WalletRecentTransaction> {
  if (!latestSignature) {
    return {
      relativeTime: 'just now',
      summary: 'No recent transactions found',
    };
  }

  return {
    relativeTime: formatRelativeTime(latestSignature.blockTime ?? null, now),
    signature: latestSignature.signature,
    summary: await describeTransaction(
      connection,
      walletAddress,
      latestSignature.signature,
    ),
  };
}

async function describeTransaction(
  connection: Connection,
  walletAddress: string,
  signature: string,
): Promise<string> {
  const transaction = await connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction) {
    return `recent activity for ${shortenPublicKey(signature)}`;
  }

  for (const instruction of transaction.transaction.message.instructions) {
    const description = describeInstruction(walletAddress, instruction, transaction);

    if (description) {
      return description;
    }
  }

  return `signature ${shortenPublicKey(signature)}`;
}

function describeInstruction(
  walletAddress: string,
  instruction: ParsedInstruction | PartiallyDecodedInstruction,
  transaction: ParsedTransactionWithMeta,
): string | null {
  if (!isParsedInstruction(instruction)) {
    return null;
  }

  const parsedInstruction = instruction.parsed as ParsedInstructionInfo;
  const instructionInfo = parsedInstruction.info ?? {};

  if (instruction.program === 'system' && parsedInstruction.type === 'transfer') {
    return describeSystemTransfer(walletAddress, instructionInfo);
  }

  if (
    instruction.program === 'spl-token' &&
    (parsedInstruction.type === 'transfer' ||
      parsedInstruction.type === 'transferChecked')
  ) {
    return describeSplTokenTransfer(walletAddress, instructionInfo, transaction);
  }

  return null;
}

function isParsedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction,
): instruction is ParsedInstruction {
  return 'parsed' in instruction;
}

function describeSystemTransfer(
  walletAddress: string,
  instructionInfo: Record<string, unknown>,
): string | null {
  const source = getString(instructionInfo.source);
  const destination = getString(instructionInfo.destination);
  const lamports = Number(instructionInfo.lamports ?? 0);
  const amountInSol = lamports / LAMPORTS_PER_SOL;

  if (!Number.isFinite(amountInSol) || amountInSol <= 0) {
    return null;
  }

  if (source === walletAddress) {
    return `sent ${formatAmount(amountInSol)} SOL${formatCounterparty('to', destination)}`;
  }

  if (destination === walletAddress) {
    return `received ${formatAmount(amountInSol)} SOL${formatCounterparty('from', source)}`;
  }

  return null;
}

function describeSplTokenTransfer(
  walletAddress: string,
  instructionInfo: Record<string, unknown>,
  transaction: ParsedTransactionWithMeta,
): string | null {
  const sourceAuthority = getString(
    instructionInfo.authority ?? instructionInfo.owner ?? instructionInfo.sourceOwner,
  );
  const destinationAuthority = getString(
    instructionInfo.destinationOwner ?? instructionInfo.destinationAuthority,
  );
  const mintAddress =
    getString(instructionInfo.mint) ?? getTokenMintFromTransaction(transaction, walletAddress);
  const tokenSymbol = mintAddress
    ? KNOWN_TOKEN_SYMBOLS[mintAddress] ?? shortenPublicKey(mintAddress)
    : 'tokens';
  const amount = getTokenTransferAmount(instructionInfo);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  if (sourceAuthority === walletAddress) {
    return `sent ${formatAmount(amount)} ${tokenSymbol}`;
  }

  if (destinationAuthority === walletAddress) {
    return `received ${formatAmount(amount)} ${tokenSymbol}`;
  }

  return null;
}

function getTokenMintFromTransaction(
  transaction: ParsedTransactionWithMeta,
  walletAddress: string,
): string | null {
  const ownedTokenBalance = transaction.meta?.postTokenBalances?.find(
    (tokenBalance) => tokenBalance.owner === walletAddress,
  );

  return ownedTokenBalance?.mint ?? null;
}

function getTokenTransferAmount(
  instructionInfo: Record<string, unknown>,
): number {
  const tokenAmountInfo =
    typeof instructionInfo.tokenAmount === 'object' && instructionInfo.tokenAmount !== null
      ? (instructionInfo.tokenAmount as {
          amount?: string;
          decimals?: number;
          uiAmount?: number | null;
          uiAmountString?: string;
        })
      : null;

  if (tokenAmountInfo) {
    if (typeof tokenAmountInfo.uiAmountString === 'string') {
      return Number(tokenAmountInfo.uiAmountString);
    }

    if (typeof tokenAmountInfo.uiAmount === 'number') {
      return tokenAmountInfo.uiAmount;
    }

    if (
      typeof tokenAmountInfo.amount === 'string' &&
      typeof tokenAmountInfo.decimals === 'number'
    ) {
      return Number(tokenAmountInfo.amount) / 10 ** tokenAmountInfo.decimals;
    }
  }

  if (typeof instructionInfo.amount === 'string') {
    return Number(instructionInfo.amount);
  }

  if (typeof instructionInfo.amount === 'number') {
    return instructionInfo.amount;
  }

  return 0;
}

function formatCounterparty(
  preposition: 'from' | 'to',
  address: string | null,
): string {
  if (!address) {
    return '';
  }

  const label = KNOWN_ADDRESS_LABELS[address] ?? shortenPublicKey(address);

  return ` ${preposition} ${label}`;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function shortenPublicKey(publicKey: string): string {
  if (publicKey.length <= 10) {
    return publicKey;
  }

  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
}

function formatRelativeTime(
  blockTime: number | null,
  now: () => Date,
): string {
  if (blockTime === null) {
    return 'an unknown time ago';
  }

  const deltaInSeconds = Math.max(
    0,
    Math.floor((now().getTime() - blockTime * 1_000) / 1_000),
  );

  if (deltaInSeconds < 60) {
    return 'just now';
  }

  if (deltaInSeconds < 3_600) {
    const minutes = Math.floor(deltaInSeconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (deltaInSeconds < 86_400) {
    const hours = Math.floor(deltaInSeconds / 3_600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(deltaInSeconds / 86_400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}