import type { BaseMemory } from '@langchain/core/memory';
import { BufferMemory } from '@langchain/classic/memory';

export const SOLSAFE_MEMORY_KEY = 'history';
export const SOLSAFE_INPUT_KEY = 'input';
export const SOLSAFE_OUTPUT_KEY = 'output';

export type SolsafeAgent = {
  memory: BaseMemory;
  memoryKey: typeof SOLSAFE_MEMORY_KEY;
};

export type CreateSolsafeAgentOptions = {
  memory?: BaseMemory;
};

export function createSolsafeMemory(): BufferMemory {
  return new BufferMemory({
    inputKey: SOLSAFE_INPUT_KEY,
    memoryKey: SOLSAFE_MEMORY_KEY,
    outputKey: SOLSAFE_OUTPUT_KEY,
    returnMessages: true,
  });
}

export function createSolsafeAgent(
  options: CreateSolsafeAgentOptions = {},
): SolsafeAgent {
  return {
    memory: options.memory ?? createSolsafeMemory(),
    memoryKey: SOLSAFE_MEMORY_KEY,
  };
}