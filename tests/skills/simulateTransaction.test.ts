import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';

import { SOLSAFE_INTENTS } from '../../src/agents/solsafe-agent.js';
import {
  SIMULATE_TRANSACTION_SKILL_NAME,
  createSimulateTransactionSkill,
  createSolanaAgentKitTransactionSimulationDataSource,
} from '../../src/skills/simulateTransaction.js';

const FIXED_BLOCKHASH = '11111111111111111111111111111111';
const SENDER = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const RECIPIENT = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
const SENDER_ADDRESS = SENDER.toBase58();
const RECIPIENT_ADDRESS = RECIPIENT.toBase58();

describe('simulateTransaction skill', () => {
  it('formats a successful simulation into plain English with SOL balance changes', async () => {
    const serializedTransaction = createSerializedTransferTransaction(
      Math.round(0.1 * LAMPORTS_PER_SOL),
    );
    const getTransactionSimulationSnapshot = vi.fn().mockResolvedValue({
      status: 'success',
      feePayer: SENDER_ADDRESS,
      actionSummary: `send 0.1 SOL from ${shortAddress(SENDER_ADDRESS)} to ${shortAddress(RECIPIENT_ADDRESS)}`,
      balanceChanges: [
        {
          address: SENDER_ADDRESS,
          deltaSol: -0.100005,
        },
        {
          address: RECIPIENT_ADDRESS,
          deltaSol: 0.1,
        },
      ],
      estimatedFeeSol: 0.000005,
      computeUnitsConsumed: 500,
      errorSummary: null,
      programs: ['System Program'],
      logs: [
        `Program ${SystemProgram.programId.toBase58()} invoke [1]`,
        `Program ${SystemProgram.programId.toBase58()} success`,
      ],
    });

    const skill = createSimulateTransactionSkill({
      dataSource: {
        getTransactionSimulationSnapshot,
      },
    });

    expect(skill.name).toBe(SIMULATE_TRANSACTION_SKILL_NAME);
    expect(skill.intent).toBe(SOLSAFE_INTENTS.TRANSACTION_SIMULATION);
    expect(skill.description).toContain('simulate');
    await expect(skill.execute({ serializedTransaction })).resolves.toEqual({
      status: 'success',
      summary: [
        'Simulation succeeded.',
        `This transaction would send 0.1 SOL from ${shortAddress(SENDER_ADDRESS)} to ${shortAddress(RECIPIENT_ADDRESS)}.`,
        `SOL balance changes: ${shortAddress(SENDER_ADDRESS)} -0.100005 SOL; ${shortAddress(RECIPIENT_ADDRESS)} +0.1 SOL.`,
        'Estimated fee: 0.000005 SOL. Compute used: 500 units. Programs invoked: System Program.',
      ].join('\n'),
      data: {
        status: 'success',
        feePayer: SENDER_ADDRESS,
        actionSummary: `send 0.1 SOL from ${shortAddress(SENDER_ADDRESS)} to ${shortAddress(RECIPIENT_ADDRESS)}`,
        balanceChanges: [
          {
            address: SENDER_ADDRESS,
            deltaSol: -0.100005,
          },
          {
            address: RECIPIENT_ADDRESS,
            deltaSol: 0.1,
          },
        ],
        estimatedFeeSol: 0.000005,
        computeUnitsConsumed: 500,
        errorSummary: null,
        programs: ['System Program'],
        logs: [
          `Program ${SystemProgram.programId.toBase58()} invoke [1]`,
          `Program ${SystemProgram.programId.toBase58()} success`,
        ],
      },
    });
  });

  it('maps a real serialized SOL transfer example into a success snapshot', async () => {
    const serializedTransaction = createSerializedTransferTransaction(
      Math.round(0.1 * LAMPORTS_PER_SOL),
    );
    const getAccountInfoSnapshots = vi.fn().mockResolvedValue([
      { lamports: 2 * LAMPORTS_PER_SOL },
      { lamports: Math.round(0.25 * LAMPORTS_PER_SOL) },
    ]);
    const simulateTransaction = vi.fn().mockResolvedValue({
      context: {
        slot: 1,
      },
      value: {
        err: null,
        logs: [
          `Program ${SystemProgram.programId.toBase58()} invoke [1]`,
          `Program ${SystemProgram.programId.toBase58()} success`,
        ],
        unitsConsumed: 500,
        accounts: [
          { lamports: 1_899_995_000 },
          { lamports: 350_000_000 },
        ],
      },
    });
    const getEstimatedFee = vi.fn().mockResolvedValue(5_000);
    const createRpcClient = vi.fn().mockReturnValue({
      getAccountInfoSnapshots,
      simulateTransaction,
      getEstimatedFee,
    });
    const dataSource = createSolanaAgentKitTransactionSimulationDataSource({
      createRpcClient,
    });

    const snapshot = await dataSource.getTransactionSimulationSnapshot({
      serializedTransaction,
    });

    expect(createRpcClient).toHaveBeenCalledTimes(1);
    expect(createRpcClient.mock.calls[0]?.[0]?.toBase58()).toBe(SENDER_ADDRESS);
    expect(simulateTransaction).toHaveBeenCalledWith(
      expect.any(VersionedTransaction),
      expect.arrayContaining([SENDER, RECIPIENT]),
    );
    expect(snapshot).toEqual({
      status: 'success',
      feePayer: SENDER_ADDRESS,
      actionSummary: `send 0.1 SOL from ${shortAddress(SENDER_ADDRESS)} to ${shortAddress(RECIPIENT_ADDRESS)}`,
      balanceChanges: [
        {
          address: SENDER_ADDRESS,
          deltaSol: -0.100005,
        },
        {
          address: RECIPIENT_ADDRESS,
          deltaSol: 0.1,
        },
      ],
      estimatedFeeSol: 0.000005,
      computeUnitsConsumed: 500,
      errorSummary: null,
      programs: ['System Program'],
      logs: [
        `Program ${SystemProgram.programId.toBase58()} invoke [1]`,
        `Program ${SystemProgram.programId.toBase58()} success`,
      ],
    });
  });

  it('maps a failed serialized SOL transfer example into a plain-English failure snapshot', async () => {
    const serializedTransaction = createSerializedTransferTransaction(
      10 * LAMPORTS_PER_SOL,
    );
    const getAccountInfoSnapshots = vi.fn().mockResolvedValue([
      { lamports: 1 * LAMPORTS_PER_SOL },
      { lamports: Math.round(0.25 * LAMPORTS_PER_SOL) },
    ]);
    const simulateTransaction = vi.fn().mockResolvedValue({
      context: {
        slot: 1,
      },
      value: {
        err: {
          InstructionError: [0, 'InsufficientFunds'],
        },
        logs: [
          `Program ${SystemProgram.programId.toBase58()} invoke [1]`,
          'Transfer: insufficient lamports 1000000000, need 10000000000',
          `Program ${SystemProgram.programId.toBase58()} failed: custom program error: 0x1`,
        ],
        unitsConsumed: 650,
        accounts: [
          { lamports: 1 * LAMPORTS_PER_SOL },
          { lamports: Math.round(0.25 * LAMPORTS_PER_SOL) },
        ],
      },
    });
    const getEstimatedFee = vi.fn().mockResolvedValue(5_000);
    const createRpcClient = vi.fn().mockReturnValue({
      getAccountInfoSnapshots,
      simulateTransaction,
      getEstimatedFee,
    });
    const dataSource = createSolanaAgentKitTransactionSimulationDataSource({
      createRpcClient,
    });

    const snapshot = await dataSource.getTransactionSimulationSnapshot({
      serializedTransaction,
    });

    expect(snapshot).toEqual({
      status: 'error',
      feePayer: SENDER_ADDRESS,
      actionSummary: `send 10 SOL from ${shortAddress(SENDER_ADDRESS)} to ${shortAddress(RECIPIENT_ADDRESS)}`,
      balanceChanges: [],
      estimatedFeeSol: 0.000005,
      computeUnitsConsumed: 650,
      errorSummary: 'insufficient funds',
      programs: ['System Program'],
      logs: [
        `Program ${SystemProgram.programId.toBase58()} invoke [1]`,
        'Transfer: insufficient lamports 1000000000, need 10000000000',
        `Program ${SystemProgram.programId.toBase58()} failed: custom program error: 0x1`,
      ],
    });
  });
});

function createSerializedTransferTransaction(lamports: number): string {
  const message = new TransactionMessage({
    payerKey: SENDER,
    recentBlockhash: FIXED_BLOCKHASH,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: SENDER,
        toPubkey: RECIPIENT,
        lamports,
      }),
    ],
  }).compileToV0Message();

  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}