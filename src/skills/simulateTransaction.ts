import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type RpcResponseAndContext,
  type SimulatedTransactionResponse,
  type TransactionInstruction,
} from '@solana/web3.js';
import type { BaseWallet } from 'solana-agent-kit';

import type { SolsafeIntent, SolsafeSkill } from '../agents/solsafe-agent.js';
import { createSolsafeSolanaAgentKit } from '../lib/solana-agent-kit.js';

export const SIMULATE_TRANSACTION_SKILL_NAME = 'simulateTransaction';

const SIMULATE_TRANSACTION_INTENT: SolsafeIntent = 'transaction_simulation';
const KNOWN_PROGRAM_LABELS: Record<string, string> = {
  [SystemProgram.programId.toBase58()]: 'System Program',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Program',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program',
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: 'Jupiter',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE: 'Jupiter',
};

type SimulatableTransaction = Transaction | VersionedTransaction;

export interface SimulateTransactionInput {
  serializedTransaction: string;
}

export interface SimulatedBalanceChange {
  address: string;
  deltaSol: number;
}

export interface TransactionSimulationSnapshot {
  status: 'success' | 'error';
  feePayer: string;
  actionSummary: string;
  balanceChanges: SimulatedBalanceChange[];
  estimatedFeeSol: number | null;
  computeUnitsConsumed: number | null;
  errorSummary: string | null;
  programs: string[];
  logs: string[];
}

export interface SimulateTransactionResult {
  status: 'success';
  summary: string;
  data: TransactionSimulationSnapshot;
}

export interface TransactionSimulationDataSource {
  getTransactionSimulationSnapshot(
    input: SimulateTransactionInput,
  ): Promise<TransactionSimulationSnapshot>;
}

export interface CreateSimulateTransactionSkillOptions {
  dataSource?: TransactionSimulationDataSource;
}

export interface CreateSolanaAgentKitTransactionSimulationDataSourceOptions {
  createRpcClient?: (feePayer: PublicKey) => TransactionSimulationRpcClient;
  heliusApiKey?: string;
  rpcUrl?: string;
}

interface LamportAccountSnapshot {
  lamports: number;
}

interface TransactionSimulationRpcClient {
  getAccountInfoSnapshots(
    addresses: readonly PublicKey[],
  ): Promise<Array<LamportAccountSnapshot | null>>;
  simulateTransaction(
    transaction: SimulatableTransaction,
    addresses: readonly PublicKey[],
  ): Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;
  getEstimatedFee(transaction: SimulatableTransaction): Promise<number | null>;
}

interface ParsedSerializedTransaction {
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
  observedAddresses: PublicKey[];
  transaction: SimulatableTransaction;
}

export function createSolanaAgentKitTransactionSimulationDataSource(
  options: CreateSolanaAgentKitTransactionSimulationDataSourceOptions = {},
): TransactionSimulationDataSource {
  return {
    async getTransactionSimulationSnapshot(input) {
      const parsedTransaction = parseSerializedTransaction(
        input.serializedTransaction,
      );
      const rpcClient =
        options.createRpcClient?.(parsedTransaction.feePayer) ??
        createDefaultTransactionSimulationRpcClient(parsedTransaction.feePayer, options);

      const [preSimulationAccounts, simulation, estimatedFeeLamports] =
        await Promise.all([
          rpcClient.getAccountInfoSnapshots(parsedTransaction.observedAddresses),
          rpcClient.simulateTransaction(
            parsedTransaction.transaction,
            parsedTransaction.observedAddresses,
          ),
          getEstimatedFeeSafely(rpcClient, parsedTransaction.transaction),
        ]);

      const postSimulationAccounts = normalizePostSimulationAccounts(
        simulation.value.accounts,
        parsedTransaction.observedAddresses.length,
      );

      return {
        status: simulation.value.err ? 'error' : 'success',
        feePayer: parsedTransaction.feePayer.toBase58(),
        actionSummary: deriveActionSummary(parsedTransaction.instructions),
        balanceChanges: deriveBalanceChanges(
          parsedTransaction.observedAddresses,
          preSimulationAccounts,
          postSimulationAccounts,
        ),
        estimatedFeeSol:
          estimatedFeeLamports === null
            ? null
            : roundToDecimals(estimatedFeeLamports / LAMPORTS_PER_SOL, 9),
        computeUnitsConsumed: simulation.value.unitsConsumed ?? null,
        errorSummary: deriveErrorSummary(
          simulation.value.err,
          simulation.value.logs ?? [],
        ),
        programs: deriveProgramLabels(parsedTransaction.instructions),
        logs: simulation.value.logs ?? [],
      };
    },
  };
}

export function createSimulateTransactionSkill(
  options: CreateSimulateTransactionSkillOptions = {},
): SolsafeSkill<SimulateTransactionInput, SimulateTransactionResult> {
  const dataSource =
    options.dataSource ?? createSolanaAgentKitTransactionSimulationDataSource();

  return {
    name: SIMULATE_TRANSACTION_SKILL_NAME,
    description:
      'Uses Solana Agent Kit to simulate a serialized Solana transaction and explain the likely SOL balance changes in plain English.',
    intent: SIMULATE_TRANSACTION_INTENT,
    async execute(input) {
      const data = await dataSource.getTransactionSimulationSnapshot(input);

      return {
        status: 'success',
        summary: formatSimulationSummary(data),
        data,
      };
    },
  };
}

function createDefaultTransactionSimulationRpcClient(
  feePayer: PublicKey,
  options: CreateSolanaAgentKitTransactionSimulationDataSourceOptions,
): TransactionSimulationRpcClient {
  const { agentKit } = createSolsafeSolanaAgentKit({
    heliusApiKey: options.heliusApiKey,
    rpcUrl: options.rpcUrl,
    wallet: createReadOnlyWallet(feePayer),
  });
  const connection = agentKit.connection;

  return {
    async getAccountInfoSnapshots(addresses) {
      return await connection.getMultipleAccountsInfo(
        Array.from(addresses),
        'confirmed',
      );
    },
    async simulateTransaction(transaction, addresses) {
      if (transaction instanceof VersionedTransaction) {
        return await connection.simulateTransaction(transaction, {
          accounts: {
            addresses: addresses.map((address) => address.toBase58()),
            encoding: 'base64',
          },
          innerInstructions: true,
          replaceRecentBlockhash: true,
          sigVerify: false,
        });
      }

      return await connection.simulateTransaction(
        transaction,
        undefined,
        Array.from(addresses),
      );
    },
    async getEstimatedFee(transaction) {
      if (transaction instanceof VersionedTransaction) {
        return (await connection.getFeeForMessage(transaction.message)).value;
      }

      return await transaction.getEstimatedFee(connection);
    },
  };
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

async function getEstimatedFeeSafely(
  rpcClient: TransactionSimulationRpcClient,
  transaction: SimulatableTransaction,
): Promise<number | null> {
  try {
    return await rpcClient.getEstimatedFee(transaction);
  } catch {
    return null;
  }
}

function parseSerializedTransaction(
  serializedTransaction: string,
): ParsedSerializedTransaction {
  const normalizedSerializedTransaction = serializedTransaction.trim();

  if (!normalizedSerializedTransaction) {
    throw new Error('A valid base64-encoded Solana transaction is required.');
  }

  const transactionBytes = Buffer.from(normalizedSerializedTransaction, 'base64');

  try {
    const transaction = VersionedTransaction.deserialize(transactionBytes);
    const decompiledMessage = TransactionMessage.decompile(transaction.message);

    return {
      feePayer: decompiledMessage.payerKey,
      instructions: decompiledMessage.instructions,
      observedAddresses: collectObservedAddresses(
        decompiledMessage.payerKey,
        decompiledMessage.instructions,
      ),
      transaction,
    };
  } catch {
    try {
      const transaction = Transaction.from(transactionBytes);
      const feePayer = transaction.feePayer ?? transaction.compileMessage().accountKeys[0];

      if (!feePayer) {
        throw new Error('A valid base64-encoded Solana transaction is required.');
      }

      return {
        feePayer,
        instructions: transaction.instructions,
        observedAddresses: collectObservedAddresses(
          feePayer,
          transaction.instructions,
        ),
        transaction,
      };
    } catch {
      throw new Error('A valid base64-encoded Solana transaction is required.');
    }
  }
}

function collectObservedAddresses(
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): PublicKey[] {
  const addressMap = new Map<string, PublicKey>();

  addressMap.set(feePayer.toBase58(), feePayer);

  for (const instruction of instructions) {
    for (const key of instruction.keys) {
      addressMap.set(key.pubkey.toBase58(), key.pubkey);
    }
  }

  return Array.from(addressMap.values());
}

function normalizePostSimulationAccounts(
  accounts: SimulatedTransactionResponse['accounts'],
  expectedLength: number,
): Array<LamportAccountSnapshot | null> {
  const normalizedAccounts = accounts ?? [];

  return Array.from({ length: expectedLength }, (_, index) => {
    const account = normalizedAccounts[index];

    return account ? { lamports: account.lamports } : null;
  });
}

function deriveBalanceChanges(
  addresses: readonly PublicKey[],
  preSimulationAccounts: Array<LamportAccountSnapshot | null>,
  postSimulationAccounts: Array<LamportAccountSnapshot | null>,
): SimulatedBalanceChange[] {
  return addresses
    .map((address, index) => {
      const preLamports = preSimulationAccounts[index]?.lamports ?? 0;
      const postLamports = postSimulationAccounts[index]?.lamports ?? 0;
      const deltaLamports = postLamports - preLamports;

      if (deltaLamports === 0) {
        return null;
      }

      return {
        address: address.toBase58(),
        deltaSol: roundToDecimals(deltaLamports / LAMPORTS_PER_SOL, 9),
      };
    })
    .filter((change): change is SimulatedBalanceChange => change !== null)
    .sort((left, right) => Math.abs(right.deltaSol) - Math.abs(left.deltaSol));
}

function deriveActionSummary(instructions: TransactionInstruction[]): string {
  for (const instruction of instructions) {
    if (!instruction.programId.equals(SystemProgram.programId)) {
      continue;
    }

    try {
      const decodedInstruction = SystemInstruction.decodeTransfer(instruction);

      return `send ${formatSolAmount(lamportsToSol(decodedInstruction.lamports))} SOL from ${shortAddress(decodedInstruction.fromPubkey.toBase58())} to ${shortAddress(decodedInstruction.toPubkey.toBase58())}`;
    } catch {
      // Continue to other system instruction decoders.
    }

    try {
      const decodedInstruction =
        SystemInstruction.decodeTransferWithSeed(instruction);

      return `send ${formatSolAmount(lamportsToSol(decodedInstruction.lamports))} SOL from ${shortAddress(decodedInstruction.fromPubkey.toBase58())} to ${shortAddress(decodedInstruction.toPubkey.toBase58())}`;
    } catch {
      continue;
    }
  }

  const primaryProgram = deriveProgramLabels(instructions).find(
    (program) => program !== 'Compute Budget',
  );

  return primaryProgram ? `invoke ${primaryProgram}` : 'simulate this transaction';
}

function deriveProgramLabels(instructions: TransactionInstruction[]): string[] {
  const labels = new Map<string, string>();

  for (const instruction of instructions) {
    const programId = instruction.programId.toBase58();

    if (!labels.has(programId)) {
      labels.set(programId, KNOWN_PROGRAM_LABELS[programId] ?? shortAddress(programId));
    }
  }

  return Array.from(labels.values());
}

function deriveErrorSummary(
  error: SimulatedTransactionResponse['err'],
  logs: string[],
): string | null {
  if (!error) {
    return null;
  }

  const normalizedLogBlob = logs.join(' ').toLowerCase();

  if (
    normalizedLogBlob.includes('insufficient lamports') ||
    normalizedLogBlob.includes('insufficient funds')
  ) {
    return 'insufficient funds';
  }

  if (typeof error === 'string' && error.trim()) {
    return humanizeSimulationToken(error);
  }

  if (error && typeof error === 'object' && 'InstructionError' in error) {
    const instructionError = error.InstructionError;

    if (Array.isArray(instructionError) && typeof instructionError[0] === 'number') {
      return `instruction ${instructionError[0] + 1} failed during simulation`;
    }
  }

  return 'simulation error';
}

function formatSimulationSummary(snapshot: TransactionSimulationSnapshot): string {
  const lines = [
    snapshot.status === 'success'
      ? 'Simulation succeeded.'
      : `Simulation failed: ${ensureSentence(snapshot.errorSummary ?? 'simulation error')}`,
    `This transaction would ${snapshot.status === 'success' ? '' : 'attempt to '}${snapshot.actionSummary}.`,
    snapshot.balanceChanges.length > 0
      ? `SOL balance changes: ${snapshot.balanceChanges.map(formatBalanceChange).join('; ')}.`
      : 'No SOL balance changes were simulated.',
    formatSimulationDetails(snapshot),
  ];

  return lines.join('\n');
}

function formatBalanceChange(change: SimulatedBalanceChange): string {
  const prefix = change.deltaSol > 0 ? '+' : '';

  return `${shortAddress(change.address)} ${prefix}${formatSolAmount(change.deltaSol)} SOL`;
}

function formatSimulationDetails(snapshot: TransactionSimulationSnapshot): string {
  const details = [
    snapshot.estimatedFeeSol === null
      ? 'Estimated fee: unavailable.'
      : `Estimated fee: ${formatSolAmount(snapshot.estimatedFeeSol)} SOL.`,
  ];

  if (snapshot.computeUnitsConsumed !== null) {
    details.push(`Compute used: ${snapshot.computeUnitsConsumed.toLocaleString('en-US')} units.`);
  }

  details.push(`Programs invoked: ${snapshot.programs.join(', ')}.`);

  const highlightedLog = selectHighlightedLog(snapshot.logs);

  if (snapshot.status === 'error' && highlightedLog) {
    details.push(`Recent logs: ${ensureSentence(highlightedLog)}`);
  }

  return details.join(' ');
}

function selectHighlightedLog(logs: string[]): string | null {
  return (
    logs.find(
      (log) =>
        !/^Program [A-Za-z0-9]+ (invoke|success)/.test(log) &&
        !/^Program log:/i.test(log),
    ) ?? null
  );
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function formatSolAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 9,
  }).format(amount);
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

function humanizeSimulationToken(value: string): string {
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}