import type { BaseMemory } from '@langchain/core/memory';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';

import {
  SOLSAFE_DYOR_DISCLAIMER,
  SOLSAFE_INTENTS,
  SOLSAFE_MEMORY_KEY,
  createSolsafeAgent,
  executeSolsafeTurn,
} from '../../src/agents/solsafe-agent.js';
import { createCheckTokenSecuritySkill } from '../../src/skills/checkTokenSecurity.js';
import { createExplainProgramLogsSkill } from '../../src/skills/explainProgramLogs.js';
import { createGetWalletSummarySkill } from '../../src/skills/getWalletSummary.js';
import { createSimulateTransactionSkill } from '../../src/skills/simulateTransaction.js';

const FIXED_BLOCKHASH = '11111111111111111111111111111111';
const WALLET_ADDRESS = 'GDEkQF7UMr7RLv1KQKMtm8E2w3iafxJLtyXu3HVQZnME';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const SENDER = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const RECIPIENT = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
const FAILED_SWAP_LOGS = [
  'Program ComputeBudget111111111111111111111111111111 invoke [1]',
  'Program ComputeBudget111111111111111111111111111111 success',
  'Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE invoke [1]',
  'Program log: Instruction: Route',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]',
  'Program log: Instruction: TransferChecked',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4645 of 1382328 compute units',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
  'Program log: AnchorError occurred. Error Code: SlippageToleranceExceeded. Error Number: 6001. Error Message: Slippage tolerance exceeded.',
  'Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE consumed 78543 of 1400000 compute units',
  'Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5Xv2kV7sE failed: custom program error: 0x1771',
] as const;

describe('solsafe agent e2e flows', () => {
  it('covers the SSOT wallet lookup and BONK follow-up conversation with memory and DYOR safety', async () => {
    const memory = createInMemoryConversationMemory();
    const rateLimiter = createRateLimiterStub();
    const walletSkill = createGetWalletSummarySkill({
      dataSource: {
        getWalletSummarySnapshot: vi.fn().mockResolvedValue({
          walletAddress: WALLET_ADDRESS,
          solBalance: 12.4,
          tokenHoldings: [
            { symbol: 'USDC', amount: 1_200 },
            { symbol: 'BONK', amount: 50_000 },
          ],
          walletAgeDays: 234,
          recentTransaction: {
            relativeTime: '2 hours ago',
            summary: 'sent 0.1 SOL to Jupiter',
          },
          recentTransactionCount: 12,
        }),
      },
    });
    const tokenSkill = createCheckTokenSecuritySkill({
      dataSource: {
        getTokenSecuritySnapshot: vi.fn().mockResolvedValue({
          mintAddress: BONK_MINT,
          tokenName: 'BONK',
          tokenSymbol: 'BONK',
          trustScore: 92,
          verificationSummary: 'Verified mint',
          liquiditySummary: 'liquidity locked for 1 year',
          topHolderConcentrationPct: 18,
          assessment: 'Appears legitimate.',
          warnings: [],
          risks: [],
        }),
      },
    });
    const agent = createSolsafeAgent({
      memory,
      rateLimiter,
      skills: [walletSkill, tokenSkill],
    });

    const walletTurn = await executeSolsafeTurn({
      agent,
      message: `@SolBot check wallet ${WALLET_ADDRESS}`,
      userId: 'telegram:1234',
    });
    const tokenTurn = await executeSolsafeTurn({
      agent,
      message: 'what about the BONK token? is it safe?',
      userId: 'telegram:1234',
    });
    const memoryVariables = await memory.loadMemoryVariables({
      userId: 'telegram:1234',
    });
    const history = memoryVariables[SOLSAFE_MEMORY_KEY] as BaseMessage[];

    expect(walletTurn.intent).toBe(SOLSAFE_INTENTS.WALLET_LOOKUP);
    expect(walletTurn.response).toBe(
      [
        `Wallet ${WALLET_ADDRESS} has been active for 234 days.`,
        'Current balance: 12.4 SOL, 1,200 USDC, and 50k BONK.',
        'Last transaction: 2 hours ago (sent 0.1 SOL to Jupiter).',
        'Recent transactions: 12 recent signatures observed.',
        'Risk assessment: No interactions with known scam contracts. ✅',
        SOLSAFE_DYOR_DISCLAIMER,
      ].join('\n'),
    );
    expect(tokenTurn.intent).toBe(SOLSAFE_INTENTS.TOKEN_SECURITY);
    expect(tokenTurn.response).toBe(
      [
        'BONK (mint: DezXAZ8z7PnrnR...)',
        'RugCheck Score: 92/100. ✅ Verified mint, liquidity locked for 1 year.',
        'Top 10 holders own 18% of supply. Appears legitimate.',
        SOLSAFE_DYOR_DISCLAIMER,
      ].join('\n'),
    );
    expect(rateLimiter.assertWithinRateLimit).toHaveBeenCalledTimes(2);
    expect(history).toHaveLength(4);
    expect(history[0]?.getType()).toBe('human');
    expect(history[1]?.content).toContain(SOLSAFE_DYOR_DISCLAIMER);
    expect(history[2]?.content).toBe('what about the BONK token? is it safe?');
    expect(history[3]?.content).toContain('RugCheck Score: 92/100.');
  });

  it('covers transaction simulation end-to-end with a user-facing DYOR disclaimer', async () => {
    const serializedTransaction = createSerializedTransferTransaction(
      Math.round(0.1 * LAMPORTS_PER_SOL),
    );
    const memory = createInMemoryConversationMemory();
    const rateLimiter = createRateLimiterStub();
    const simulationSkill = createSimulateTransactionSkill({
      dataSource: {
        getTransactionSimulationSnapshot: vi.fn().mockResolvedValue({
          status: 'success',
          feePayer: SENDER.toBase58(),
          actionSummary: `send 0.1 SOL from ${shortAddress(SENDER.toBase58())} to ${shortAddress(RECIPIENT.toBase58())}`,
          balanceChanges: [
            {
              address: SENDER.toBase58(),
              deltaSol: -0.100005,
            },
            {
              address: RECIPIENT.toBase58(),
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
        }),
      },
    });
    const agent = createSolsafeAgent({
      memory,
      rateLimiter,
      skills: [simulationSkill],
    });

    const turn = await executeSolsafeTurn({
      agent,
      message: `can you simulate this transaction before i sign it? ${serializedTransaction}`,
      userId: 'telegram:1234',
    });

    expect(turn.intent).toBe(SOLSAFE_INTENTS.TRANSACTION_SIMULATION);
    expect(turn.response).toContain('Simulation succeeded.');
    expect(turn.response).toContain(SOLSAFE_DYOR_DISCLAIMER);
  });

  it('covers program log explanation end-to-end with the parser facts and DYOR disclaimer', async () => {
    const memory = createInMemoryConversationMemory();
    const rateLimiter = createRateLimiterStub();
    const logSkill = createExplainProgramLogsSkill({
      summaryClient: {
        summarizeProgramLogs: vi.fn().mockResolvedValue({
          model: 'llama-3.1-8b-instant',
          summary:
            'The Jupiter route failed because the swap moved outside the allowed slippage before it could finish.',
        }),
      },
    });
    const agent = createSolsafeAgent({
      memory,
      rateLimiter,
      skills: [logSkill],
    });

    const turn = await executeSolsafeTurn({
      agent,
      message: `can you explain these program logs?\n${FAILED_SWAP_LOGS.join('\n')}`,
      userId: 'telegram:1234',
    });

    expect(turn.intent).toBe(SOLSAFE_INTENTS.PROGRAM_LOG_EXPLANATION);
    expect(turn.response).toContain(
      'The Jupiter route failed because the swap moved outside the allowed slippage before it could finish.',
    );
    expect(turn.response).toContain(
      'Programs invoked: Compute Budget, Jupiter, Token Program.',
    );
    expect(turn.response).toContain(SOLSAFE_DYOR_DISCLAIMER);
  });
});

function createInMemoryConversationMemory(): BaseMemory {
  const messages: BaseMessage[] = [];

  return {
    memoryKeys: [SOLSAFE_MEMORY_KEY],
    async loadMemoryVariables() {
      return {
        [SOLSAFE_MEMORY_KEY]: [...messages],
      };
    },
    async saveContext(inputValues, outputValues) {
      messages.push(new HumanMessage(String(inputValues.input ?? '')));
      messages.push(new AIMessage(String(outputValues.output ?? '')));
    },
  } as BaseMemory;
}

function createRateLimiterStub() {
  return {
    assertWithinRateLimit: vi.fn().mockResolvedValue(undefined),
  };
}

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