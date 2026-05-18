import type { BaseMemory } from '@langchain/core/memory';
import { BufferMemory } from '@langchain/classic/memory';

import { createCheckTokenSecuritySkill } from '../skills/checkTokenSecurity.js';
import { createGetWalletSummarySkill } from '../skills/getWalletSummary.js';

export const SOLSAFE_MEMORY_KEY = 'history';
export const SOLSAFE_INPUT_KEY = 'input';
export const SOLSAFE_OUTPUT_KEY = 'output';

export const SOLSAFE_INTENTS = {
  UNKNOWN: 'unknown',
  TOKEN_SECURITY: 'token_security',
  TRANSACTION_SIMULATION: 'transaction_simulation',
  WALLET_LOOKUP: 'wallet_lookup',
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

const TRANSACTION_SIMULATION_PATTERNS = [
  /\bsimulate\b/i,
  /\bsimulation\b/i,
  /\btransaction\b/i,
  /\bbefore i sign\b/i,
  /\bsigned? tx\b/i,
];

export type SolsafeAgent = {
  memory: BaseMemory;
  memoryKey: typeof SOLSAFE_MEMORY_KEY;
  routeIntent: (message: string) => SolsafeIntent;
  skills: SolsafeSkill[];
  getSkillForIntent: (intent: SolsafeIntent) => SolsafeSkill | undefined;
};

export type CreateSolsafeAgentOptions = {
  memory?: BaseMemory;
  skills?: SolsafeSkill[];
};

export function createSolsafeMemory(): BufferMemory {
  return new BufferMemory({
    inputKey: SOLSAFE_INPUT_KEY,
    memoryKey: SOLSAFE_MEMORY_KEY,
    outputKey: SOLSAFE_OUTPUT_KEY,
    returnMessages: true,
  });
}

function matchesAnyPattern(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function routeSolsafeIntent(message: string): SolsafeIntent {
  const normalizedMessage = message.trim();

  if (matchesAnyPattern(normalizedMessage, TRANSACTION_SIMULATION_PATTERNS)) {
    return SOLSAFE_INTENTS.TRANSACTION_SIMULATION;
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
  const skills = options.skills ?? [
    createGetWalletSummarySkill(),
    createCheckTokenSecuritySkill(),
  ];

  return {
    memory: options.memory ?? createSolsafeMemory(),
    memoryKey: SOLSAFE_MEMORY_KEY,
    routeIntent: routeSolsafeIntent,
    skills,
    getSkillForIntent(intent) {
      return skills.find((skill) => skill.intent === intent);
    },
  };
}