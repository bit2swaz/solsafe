import {
  BaseMemory,
  getInputValue,
  getOutputValue,
  type InputValues,
  type MemoryVariables,
  type OutputValues,
} from '@langchain/core/memory';
import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';

import {
  createSolsafeSupabaseClient,
  type ConversationMemoryInsert,
  type ConversationMemoryRow,
} from './supabase.js';

interface ConversationMemoryErrorLike {
  message: string;
}

interface ConversationMemorySelectResult {
  data: ConversationMemoryRow | null;
  error: ConversationMemoryErrorLike | null;
}

interface ConversationMemoryUpsertResult {
  data: ConversationMemoryRow[] | null;
  error: ConversationMemoryErrorLike | null;
}

interface ConversationMemoryMaybeSingleBuilder {
  maybeSingle(): PromiseLike<ConversationMemorySelectResult>;
}

interface ConversationMemoryMemoryKeyFilterBuilder {
  eq(column: 'memory_key', value: string): ConversationMemoryMaybeSingleBuilder;
}

interface ConversationMemoryUserFilterBuilder {
  eq(column: 'user_id', value: string): ConversationMemoryMemoryKeyFilterBuilder;
}

interface ConversationMemoryUpsertBuilder {
  select(columns: string): PromiseLike<ConversationMemoryUpsertResult>;
}

interface ConversationMemoryTableApi {
  select(columns: string): ConversationMemoryUserFilterBuilder;
  upsert(
    values: ConversationMemoryInsert,
    options: { onConflict: string },
  ): ConversationMemoryUpsertBuilder;
}

export interface ConversationMemorySupabaseClient {
  from(table: 'conversation_memory'): ConversationMemoryTableApi;
}

export interface CreateSolsafeConversationMemoryOptions {
  inputKey?: string;
  memoryKey?: string;
  outputKey?: string;
  sessionId?: string | null;
  supabaseClient?: ConversationMemorySupabaseClient;
  userId?: string;
}

interface StoredConversationMessage {
  content: string;
  type: 'ai' | 'human';
}

const DEFAULT_INPUT_KEY = 'input';
const DEFAULT_MEMORY_KEY = 'history';
const DEFAULT_OUTPUT_KEY = 'output';

export class SolsafeConversationMemory extends BaseMemory {
  readonly inputKey: string;

  readonly memoryKey: string;

  readonly outputKey: string;

  readonly sessionId: string | null;

  readonly supabaseClient: ConversationMemorySupabaseClient;

  readonly userId?: string;

  constructor(options: CreateSolsafeConversationMemoryOptions = {}) {
    super();
    this.inputKey = options.inputKey ?? DEFAULT_INPUT_KEY;
    this.memoryKey = options.memoryKey ?? DEFAULT_MEMORY_KEY;
    this.outputKey = options.outputKey ?? DEFAULT_OUTPUT_KEY;
    this.sessionId = normalizeOptionalValue(options.sessionId);
    this.supabaseClient =
      options.supabaseClient ??
      (createSolsafeSupabaseClient() as unknown as ConversationMemorySupabaseClient);
    this.userId = normalizeOptionalValue(options.userId) ?? undefined;
  }

  get memoryKeys(): string[] {
    return [this.memoryKey];
  }

  async loadMemoryVariables(values: InputValues): Promise<MemoryVariables> {
    const row = await this.readConversationMemoryRow(values);

    return {
      [this.memoryKey]: deserializeMessages(row?.value),
    };
  }

  async saveContext(
    inputValues: InputValues,
    outputValues: OutputValues,
  ): Promise<void> {
    const { sessionId, userId } = this.resolveIdentifiers(inputValues);
    const existingRow = await this.readConversationMemoryRow(inputValues);
    const messages = deserializeStoredMessages(existingRow?.value);
    const input = normalizeMessageContent(
      getInputValue(inputValues, this.inputKey),
    );
    const output = normalizeMessageContent(
      getOutputValue(outputValues, this.outputKey),
    );

    if (input) {
      messages.push({
        content: input,
        type: 'human',
      });
    }

    if (output) {
      messages.push({
        content: output,
        type: 'ai',
      });
    }

    await this.persistConversationMemory({
      messages,
      sessionId,
      userId,
    });
  }

  async clear(values: InputValues = {}): Promise<void> {
    const { sessionId, userId } = this.resolveIdentifiers(values);

    await this.persistConversationMemory({
      messages: [],
      sessionId,
      userId,
    });
  }

  private async persistConversationMemory(input: {
    messages: StoredConversationMessage[];
    sessionId: string | null;
    userId: string;
  }): Promise<void> {
    const timestamp = new Date().toISOString();
    const conversationMemoryInsert: ConversationMemoryInsert = {
      memory_key: this.memoryKey,
      session_id: input.sessionId,
      updated_at: timestamp,
      user_id: input.userId,
      value: {
        messages: input.messages,
      },
    };

    const { data, error } = await this.supabaseClient
      .from('conversation_memory')
      .upsert(conversationMemoryInsert, {
        onConflict: 'user_id,memory_key',
      })
      .select('*');

    if (error) {
      throw new Error(
        `Failed to store conversation memory in Supabase: ${error.message}`,
      );
    }

    if (!data?.[0]) {
      throw new Error('Failed to store conversation memory in Supabase: no row returned.');
    }
  }

  private async readConversationMemoryRow(
    values: InputValues,
  ): Promise<ConversationMemoryRow | null> {
    const { userId } = this.resolveIdentifiers(values);
    const { data, error } = await this.supabaseClient
      .from('conversation_memory')
      .select('*')
      .eq('user_id', userId)
      .eq('memory_key', this.memoryKey)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to read conversation memory from Supabase: ${error.message}`,
      );
    }

    return data;
  }

  private resolveIdentifiers(values: InputValues): {
    sessionId: string | null;
    userId: string;
  } {
    const userId =
      normalizeOptionalValue(getRecordString(values, 'userId')) ?? this.userId;

    if (!userId) {
      throw new Error('userId is required for Supabase conversation memory.');
    }

    return {
      sessionId:
        normalizeOptionalValue(getRecordString(values, 'sessionId')) ??
        this.sessionId,
      userId,
    };
  }
}

export function createSolsafeConversationMemory(
  options: CreateSolsafeConversationMemoryOptions = {},
): SolsafeConversationMemory {
  return new SolsafeConversationMemory(options);
}

function deserializeMessages(
  value: Record<string, unknown> | undefined,
): BaseMessage[] {
  return deserializeStoredMessages(value).map((message) =>
    message.type === 'human'
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );
}

function deserializeStoredMessages(
  value: Record<string, unknown> | undefined,
): StoredConversationMessage[] {
  const messages = value?.messages;

  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message) => {
    if (!message || typeof message !== 'object') {
      return [];
    }

    const content = getRecordString(message, 'content');
    const type = getRecordString(message, 'type');

    if (!content || (type !== 'human' && type !== 'ai')) {
      return [];
    }

    return [
      {
        content,
        type,
      },
    ];
  });
}

function getRecordString(record: unknown, key: string): string | undefined {
  if (!record || typeof record !== 'object' || !(key in record)) {
    return undefined;
  }

  const value = (record as Record<string, unknown>)[key];

  return typeof value === 'string' ? value : undefined;
}

function normalizeMessageContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}