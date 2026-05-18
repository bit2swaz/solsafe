import type { BaseMemory } from '@langchain/core/memory';

import {
  createSolsafeConversationMemory,
  type CreateSolsafeConversationMemoryOptions,
} from '../lib/conversation-memory.js';
import {
  createSupabaseRateLimiter,
  type CreateSupabaseRateLimiterOptions,
  type RateLimitCheckInput,
  type SolsafeRateLimiter,
} from '../lib/rate-limit.js';
import type { SolsafeSupabaseClient } from '../lib/supabase.js';
import {
  type AssessWalletRiskInput,
  createAssessWalletRiskSkill,
} from '../skills/assessWalletRisk.js';
import {
  type CheckTokenSecurityInput,
  createCheckTokenSecuritySkill,
} from '../skills/checkTokenSecurity.js';
import {
  type ExplainProgramLogsInput,
  createExplainProgramLogsSkill,
} from '../skills/explainProgramLogs.js';
import {
  type GetWhaleAlertsInput,
  createGetWhaleAlertsSkill,
} from '../skills/getWhaleAlerts.js';
import {
  KNOWN_TOKEN_SYMBOLS,
  type GetWalletSummaryInput,
  createGetWalletSummarySkill,
} from '../skills/getWalletSummary.js';
import {
  type NaturalLanguageSwapInput,
  createNaturalLanguageSwapSkill,
} from '../skills/naturalLanguageSwap.js';
import {
  type SimulateTransactionInput,
  createSimulateTransactionSkill,
} from '../skills/simulateTransaction.js';

export const SOLSAFE_MEMORY_KEY = 'history';
export const SOLSAFE_INPUT_KEY = 'input';
export const SOLSAFE_OUTPUT_KEY = 'output';
export const SOLSAFE_DYOR_DISCLAIMER =
  'Always DYOR. This is not financial advice.';

export const SOLSAFE_INTENTS = {
  NATURAL_LANGUAGE_SWAP: 'natural_language_swap',
  UNKNOWN: 'unknown',
  PROGRAM_LOG_EXPLANATION: 'program_log_explanation',
  TOKEN_SECURITY: 'token_security',
  TRANSACTION_SIMULATION: 'transaction_simulation',
  WALLET_RISK: 'wallet_risk',
  WALLET_LOOKUP: 'wallet_lookup',
  WHALE_ALERTS: 'whale_alerts',
} as const;

export type SolsafeIntent =
  (typeof SOLSAFE_INTENTS)[keyof typeof SOLSAFE_INTENTS];

export interface SolsafeSkill<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  intent: SolsafeIntent;
  execute(input: TInput): Promise<TOutput>;
}

const WALLET_LOOKUP_PATTERNS = [
  /\bwallet\b/i,
  /\baddress\b/i,
  /\bbalance\b/i,
  /\bholdings\b/i,
  /\bportfolio\b/i,
  /\b[a-hj-np-z1-9]{32,44}\b/i,
];

const TOKEN_SECURITY_PATTERNS = [
  /\btoken\b/i,
  /\bmint\b/i,
  /\brug\b/i,
  /\brugcheck\b/i,
  /\bliquidity\b/i,
  /\bholders?\b/i,
  /\bis it safe\b/i,
];

const PROGRAM_LOG_EXPLANATION_PATTERNS = [
  /\bprogram logs?\b/i,
  /\blogs?\b/i,
  /\bcustom program error\b/i,
  /\banchorerror\b/i,
  /\bexplain .*logs?\b/i,
];

const TRANSACTION_SIMULATION_PATTERNS = [
  /\bsimulate\b/i,
  /\bsimulation\b/i,
  /\btransaction\b/i,
  /\bbefore i sign\b/i,
  /\bsigned? tx\b/i,
];

const NATURAL_LANGUAGE_SWAP_PATTERNS = [
  /\bswap\s+\d+(?:\.\d+)?\s+[a-z0-9]+\s+(?:for|to)\s+[a-z0-9]+\b/i,
  /\btrade\s+\d+(?:\.\d+)?\s+[a-z0-9]+\s+(?:for|to)\s+[a-z0-9]+\b/i,
];

const WALLET_RISK_PATTERNS = [
  /\bassess wallet risk\b/i,
  /\bwallet risk\b/i,
  /\brisky wallet\b/i,
  /\brisk assessment\b/i,
];

const WHALE_ALERT_PATTERNS = [
  /\bwhale alerts?\b/i,
  /\bmonitor whale\b/i,
  /\blarge movements?\b/i,
];

const SOLANA_ADDRESS_PATTERN = /\b[A-HJ-NP-Za-km-z1-9]{32,44}\b/g;
const SERIALIZED_TRANSACTION_PATTERN = /[A-Za-z0-9+/=]{80,}/g;
const KNOWN_TOKEN_MINTS_BY_SYMBOL = Object.fromEntries(
  Object.entries(KNOWN_TOKEN_SYMBOLS).map(([mintAddress, symbol]) => [
    symbol.toUpperCase(),
    mintAddress,
  ]),
);

export type SolsafeAgent = {
  assertWithinRateLimit: (input: RateLimitCheckInput) => Promise<void>;
  memory: BaseMemory;
  memoryKey: typeof SOLSAFE_MEMORY_KEY;
  rateLimiter: SolsafeRateLimiter;
  routeIntent: (message: string) => SolsafeIntent;
  skills: SolsafeSkill[];
  getSkillForIntent: (intent: SolsafeIntent) => SolsafeSkill | undefined;
};

export type CreateSolsafeAgentOptions = {
  memory?: BaseMemory;
  memoryOptions?: Omit<
    CreateSolsafeConversationMemoryOptions,
    'supabaseClient'
  >;
  rateLimiter?: SolsafeRateLimiter;
  rateLimitOptions?: Omit<CreateSupabaseRateLimiterOptions, 'supabaseClient'>;
  skills?: SolsafeSkill[];
  supabaseClient?: SolsafeSupabaseClient;
};

export interface ExecuteSolsafeTurnInput {
  agent: SolsafeAgent;
  message: string;
  sessionId?: string;
  userId: string;
}

export interface ExecuteSolsafeTurnResult {
  intent: SolsafeIntent;
  response: string;
  skillName: string | null;
}

export type { SolsafeRateLimiter } from '../lib/rate-limit.js';

export function createSolsafeMemory(
  options: CreateSolsafeConversationMemoryOptions = {},
): BaseMemory {
  return createSolsafeConversationMemory({
    inputKey: SOLSAFE_INPUT_KEY,
    memoryKey: SOLSAFE_MEMORY_KEY,
    outputKey: SOLSAFE_OUTPUT_KEY,
    ...options,
  });
}

function matchesAnyPattern(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function appendSolsafeSafetyDisclaimer(summary: string): string {
  const normalizedSummary = summary.trim();

  if (!normalizedSummary) {
    return SOLSAFE_DYOR_DISCLAIMER;
  }

  if (normalizedSummary.includes(SOLSAFE_DYOR_DISCLAIMER)) {
    return normalizedSummary;
  }

  return `${normalizedSummary}\n${SOLSAFE_DYOR_DISCLAIMER}`;
}

export function routeSolsafeIntent(message: string): SolsafeIntent {
  const normalizedMessage = message.trim();

  if (matchesAnyPattern(normalizedMessage, PROGRAM_LOG_EXPLANATION_PATTERNS)) {
    return SOLSAFE_INTENTS.PROGRAM_LOG_EXPLANATION;
  }

  if (matchesAnyPattern(normalizedMessage, TRANSACTION_SIMULATION_PATTERNS)) {
    return SOLSAFE_INTENTS.TRANSACTION_SIMULATION;
  }

  if (matchesAnyPattern(normalizedMessage, NATURAL_LANGUAGE_SWAP_PATTERNS)) {
    return SOLSAFE_INTENTS.NATURAL_LANGUAGE_SWAP;
  }

  if (matchesAnyPattern(normalizedMessage, WHALE_ALERT_PATTERNS)) {
    return SOLSAFE_INTENTS.WHALE_ALERTS;
  }

  if (matchesAnyPattern(normalizedMessage, WALLET_RISK_PATTERNS)) {
    return SOLSAFE_INTENTS.WALLET_RISK;
  }

  if (matchesAnyPattern(normalizedMessage, TOKEN_SECURITY_PATTERNS)) {
    return SOLSAFE_INTENTS.TOKEN_SECURITY;
  }

  if (matchesAnyPattern(normalizedMessage, WALLET_LOOKUP_PATTERNS)) {
    return SOLSAFE_INTENTS.WALLET_LOOKUP;
  }

  return SOLSAFE_INTENTS.UNKNOWN;
}

export function createSolsafeAgent(
  options: CreateSolsafeAgentOptions = {},
): SolsafeAgent {
  const supabaseClient = options.supabaseClient;
  const skills = options.skills ?? [
    createGetWalletSummarySkill(),
    createCheckTokenSecuritySkill(),
    createSimulateTransactionSkill(),
    createExplainProgramLogsSkill(),
    createGetWhaleAlertsSkill(),
    createAssessWalletRiskSkill(),
    createNaturalLanguageSwapSkill(),
  ];
  const memory =
    options.memory ??
    createSolsafeMemory({
      ...options.memoryOptions,
      supabaseClient: supabaseClient as unknown as CreateSolsafeConversationMemoryOptions['supabaseClient'],
    });
  const rateLimiter =
    options.rateLimiter ??
    createSupabaseRateLimiter({
      ...options.rateLimitOptions,
      supabaseClient: supabaseClient as unknown as CreateSupabaseRateLimiterOptions['supabaseClient'],
    });

  return {
    assertWithinRateLimit(input) {
      return rateLimiter.assertWithinRateLimit(input);
    },
    memory,
    memoryKey: SOLSAFE_MEMORY_KEY,
    rateLimiter,
    routeIntent: routeSolsafeIntent,
    skills,
    getSkillForIntent(intent) {
      return skills.find((skill) => skill.intent === intent);
    },
  };
}

export async function executeSolsafeTurn(
  input: ExecuteSolsafeTurnInput,
): Promise<ExecuteSolsafeTurnResult> {
  const message = normalizeRequiredValue(input.message, 'message');

  await input.agent.assertWithinRateLimit({
    userId: input.userId,
  });

  const memoryVariables = await input.agent.memory.loadMemoryVariables({
    sessionId: input.sessionId,
    userId: input.userId,
  });
  const intent = input.agent.routeIntent(message);

  if (intent === SOLSAFE_INTENTS.UNKNOWN) {
    const response = appendSolsafeSafetyDisclaimer(
      'I can help with wallet lookups, token security checks, transaction simulations, program log explanations, whale alert planning, wallet risk reviews, and swap previews.',
    );

    await saveSolsafeTurnToMemory(input.agent.memory, {
      message,
      response,
      sessionId: input.sessionId,
      userId: input.userId,
    });

    return {
      intent,
      response,
      skillName: null,
    };
  }

  const skill = input.agent.getSkillForIntent(intent);

  if (!skill) {
    throw new Error(`No Solsafe skill registered for intent: ${intent}`);
  }

  const skillInput = resolveSolsafeSkillInput(
    intent,
    message,
    memoryVariables[input.agent.memoryKey],
  );
  const skillResult = await skill.execute(skillInput as never);
  const response = appendSolsafeSafetyDisclaimer(
    extractSkillSummary(skillResult),
  );

  await saveSolsafeTurnToMemory(input.agent.memory, {
    message,
    response,
    sessionId: input.sessionId,
    userId: input.userId,
  });

  return {
    intent,
    response,
    skillName: skill.name,
  };
}

function resolveSolsafeSkillInput(
  intent: SolsafeIntent,
  message: string,
  memoryValue: unknown,
):
  | AssessWalletRiskInput
  | CheckTokenSecurityInput
  | ExplainProgramLogsInput
  | GetWhaleAlertsInput
  | GetWalletSummaryInput
  | NaturalLanguageSwapInput
  | SimulateTransactionInput {
  switch (intent) {
    case SOLSAFE_INTENTS.WALLET_LOOKUP:
      return {
        walletAddress: extractSolanaAddress(message, 'wallet address'),
      };
    case SOLSAFE_INTENTS.TOKEN_SECURITY:
      return {
        mintAddress: resolveTokenMintAddress(message, memoryValue),
      };
    case SOLSAFE_INTENTS.TRANSACTION_SIMULATION:
      return {
        serializedTransaction: extractSerializedTransaction(message),
      };
    case SOLSAFE_INTENTS.NATURAL_LANGUAGE_SWAP:
      return {
        request: message,
        walletAddress: extractOptionalSolanaAddress(message),
        confirmed: isSwapConfirmationMessage(message),
      };
    case SOLSAFE_INTENTS.PROGRAM_LOG_EXPLANATION:
      return {
        logs: extractProgramLogs(message),
      };
    case SOLSAFE_INTENTS.WHALE_ALERTS:
      return {
        walletAddress: extractSolanaAddress(message, 'wallet address'),
        minimumTransferSol: extractOptionalSolAmount(message) ?? 250,
      };
    case SOLSAFE_INTENTS.WALLET_RISK:
      return {
        walletAddress: extractSolanaAddress(message, 'wallet address'),
      };
    default:
      throw new Error(`No Solsafe input resolver exists for intent: ${intent}`);
  }
}

function resolveTokenMintAddress(message: string, memoryValue: unknown): string {
  const directMintAddress = findFirstMatch(message, SOLANA_ADDRESS_PATTERN);

  if (directMintAddress) {
    return directMintAddress;
  }

  const currentMessageMint = findKnownTokenMint(message);

  if (currentMessageMint) {
    return currentMessageMint;
  }

  for (const memoryMessage of extractMemoryMessages(memoryValue).reverse()) {
    const memoryMintAddress = findFirstMatch(memoryMessage, SOLANA_ADDRESS_PATTERN);

    if (memoryMintAddress) {
      return memoryMintAddress;
    }

    const knownTokenMint = findKnownTokenMint(memoryMessage);

    if (knownTokenMint) {
      return knownTokenMint;
    }
  }

  throw new Error(
    'A token mint address or known token symbol is required for token security checks.',
  );
}

function findKnownTokenMint(message: string): string | null {
  for (const [symbol, mintAddress] of Object.entries(KNOWN_TOKEN_MINTS_BY_SYMBOL)) {
    const symbolPattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'i');

    if (symbolPattern.test(message)) {
      return mintAddress;
    }
  }

  return null;
}

function extractSerializedTransaction(message: string): string {
  const serializedTransaction = findLongestMatch(
    message,
    SERIALIZED_TRANSACTION_PATTERN,
  );

  if (!serializedTransaction) {
    throw new Error('A base64-encoded Solana transaction is required for simulation.');
  }

  return serializedTransaction;
}

function extractProgramLogs(message: string): string[] {
  const logs = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => isProgramLogLine(line));

  if (logs.length === 0) {
    throw new Error('At least one Solana program log line is required.');
  }

  return logs;
}

function isProgramLogLine(line: string): boolean {
  return (
    line.startsWith('Program ') ||
    line.startsWith('Program log:') ||
    /custom program error/i.test(line)
  );
}

function extractSolanaAddress(message: string, label: string): string {
  const address = findFirstMatch(message, SOLANA_ADDRESS_PATTERN);

  if (!address) {
    throw new Error(`A valid Solana ${label} is required.`);
  }

  return address;
}

function extractOptionalSolanaAddress(message: string): string | null {
  return findFirstMatch(message, SOLANA_ADDRESS_PATTERN);
}

function extractOptionalSolAmount(message: string): number | null {
  const amountMatch = /(\d+(?:\.\d+)?)\s*SOL\b/i.exec(message);

  if (!amountMatch) {
    return null;
  }

  return Number(amountMatch[1]);
}

function isSwapConfirmationMessage(message: string): boolean {
  return /\b(?:confirm|confirmed|approve)\b/i.test(message);
}

function findFirstMatch(message: string, pattern: RegExp): string | null {
  return Array.from(message.matchAll(pattern))[0]?.[0] ?? null;
}

function findLongestMatch(message: string, pattern: RegExp): string | null {
  const matches = Array.from(message.matchAll(pattern)).map((match) => match[0]);

  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((longestMatch, currentMatch) =>
    currentMatch.length > longestMatch.length ? currentMatch : longestMatch,
  );
}

function extractMemoryMessages(memoryValue: unknown): string[] {
  if (typeof memoryValue === 'string') {
    return [memoryValue];
  }

  if (!Array.isArray(memoryValue)) {
    return [];
  }

  return memoryValue.flatMap((message) => {
    if (typeof message === 'string') {
      return [message];
    }

    if (!message || typeof message !== 'object' || !('content' in message)) {
      return [];
    }

    return normalizeMessageContent(
      (message as { content: unknown }).content,
    );
  });
}

function normalizeMessageContent(content: unknown): string[] {
  if (typeof content === 'string') {
    return [content];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item) => {
    if (typeof item === 'string') {
      return [item];
    }

    if (
      item &&
      typeof item === 'object' &&
      'text' in item &&
      typeof (item as { text?: unknown }).text === 'string'
    ) {
      return [(item as { text: string }).text];
    }

    return [];
  });
}

function extractSkillSummary(result: unknown): string {
  if (
    !result ||
    typeof result !== 'object' ||
    !('summary' in result) ||
    typeof (result as { summary?: unknown }).summary !== 'string'
  ) {
    throw new Error('Solsafe skills must return a string summary.');
  }

  return (result as { summary: string }).summary;
}

async function saveSolsafeTurnToMemory(
  memory: BaseMemory,
  input: {
    message: string;
    response: string;
    sessionId?: string;
    userId: string;
  },
): Promise<void> {
  await memory.saveContext(
    {
      sessionId: input.sessionId,
      userId: input.userId,
      [SOLSAFE_INPUT_KEY]: input.message,
    },
    {
      sessionId: input.sessionId,
      userId: input.userId,
      [SOLSAFE_OUTPUT_KEY]: input.response,
    },
  );
}

function normalizeRequiredValue(value: string, label: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  return normalizedValue;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}