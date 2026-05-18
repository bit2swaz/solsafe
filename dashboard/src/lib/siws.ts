import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

const DEFAULT_SIWS_CHAIN_ID = 'solana:mainnet';
const DEFAULT_SIWS_STATEMENT = 'Sign in to the SolSafe dashboard';
const DEFAULT_SIWS_VERSION = '1';

export interface SiwsChallenge {
  chainId: string;
  domain: string;
  issuedAt: string;
  nonce: string;
  statement: string;
  uri: string;
  version: string;
}

export interface CreateSiwsChallengeOptions {
  chainId?: string;
  domain: string;
  nonce?: string;
  now?: () => Date;
  statement?: string;
  uri: string;
  version?: string;
}

export interface CreateSiwsMessageInput extends SiwsChallenge {
  address: string;
}

export interface VerifySiwsMessageInput {
  expectedDomain: string;
  expectedNonce: string;
  expectedUri: string;
  message: string;
  signature: string;
}

export interface VerifiedSiwsMessage extends CreateSiwsMessageInput {}

export interface DashboardSession {
  address: string;
  domain: string;
  issuedAt: string;
}

export interface CreateSiwsSessionTokenInput {
  payload: DashboardSession;
  secret: string;
}

export interface VerifySiwsSessionTokenInput {
  secret: string;
  token: string;
}

export function createSiwsChallenge(
  options: CreateSiwsChallengeOptions,
): SiwsChallenge {
  return {
    chainId: options.chainId ?? DEFAULT_SIWS_CHAIN_ID,
    domain: normalizeRequiredValue(options.domain, 'domain'),
    issuedAt: (options.now ?? (() => new Date()))().toISOString(),
    nonce: normalizeRequiredValue(options.nonce ?? crypto.randomUUID(), 'nonce'),
    statement:
      normalizeOptionalValue(options.statement) ?? DEFAULT_SIWS_STATEMENT,
    uri: normalizeRequiredValue(options.uri, 'uri'),
    version: options.version ?? DEFAULT_SIWS_VERSION,
  };
}

export function createSiwsMessage(input: CreateSiwsMessageInput): string {
  const address = normalizeRequiredValue(input.address, 'address');

  return [
    `${normalizeRequiredValue(input.domain, 'domain')} wants you to sign in with your Solana account:`,
    address,
    '',
    normalizeRequiredValue(input.statement, 'statement'),
    '',
    `URI: ${normalizeRequiredValue(input.uri, 'uri')}`,
    `Version: ${normalizeRequiredValue(input.version, 'version')}`,
    `Chain ID: ${normalizeRequiredValue(input.chainId, 'chainId')}`,
    `Nonce: ${normalizeRequiredValue(input.nonce, 'nonce')}`,
    `Issued At: ${normalizeRequiredValue(input.issuedAt, 'issuedAt')}`,
  ].join('\n');
}

export async function verifySiwsMessage(
  input: VerifySiwsMessageInput,
): Promise<VerifiedSiwsMessage> {
  const parsedMessage = parseSiwsMessage(input.message);

  if (parsedMessage.domain !== normalizeRequiredValue(input.expectedDomain, 'expectedDomain')) {
    throw new Error('SIWS domain mismatch.');
  }

  if (parsedMessage.nonce !== normalizeRequiredValue(input.expectedNonce, 'expectedNonce')) {
    throw new Error('SIWS nonce mismatch.');
  }

  if (parsedMessage.uri !== normalizeRequiredValue(input.expectedUri, 'expectedUri')) {
    throw new Error('SIWS URI mismatch.');
  }

  const publicKey = new PublicKey(parsedMessage.address);
  const isValidSignature = nacl.sign.detached.verify(
    new TextEncoder().encode(input.message),
    Buffer.from(normalizeRequiredValue(input.signature, 'signature'), 'base64'),
    publicKey.toBytes(),
  );

  if (!isValidSignature) {
    throw new Error('SIWS signature invalid.');
  }

  return parsedMessage;
}

export async function createSiwsSessionToken(
  input: CreateSiwsSessionTokenInput,
): Promise<string> {
  const secret = normalizeRequiredValue(input.secret, 'secret');
  const payload = JSON.stringify(input.payload);
  const payloadPart = encodeBase64Url(payload);
  const signaturePart = encodeBase64Url(
    await signHmac(secret, payloadPart),
  );

  return `${payloadPart}.${signaturePart}`;
}

export async function verifySiwsSessionToken(
  input: VerifySiwsSessionTokenInput,
): Promise<DashboardSession> {
  const secret = normalizeRequiredValue(input.secret, 'secret');
  const [payloadPart, signaturePart] = input.token.split('.');

  if (!payloadPart || !signaturePart) {
    throw new Error('SIWS session token invalid.');
  }

  const actualSignature = decodeBase64Url(signaturePart);

  if (!(await verifyHmac(secret, payloadPart, actualSignature))) {
    throw new Error('SIWS session token invalid.');
  }

  const payload = JSON.parse(decodeText(decodeBase64Url(payloadPart))) as DashboardSession;

  return {
    address: normalizeRequiredValue(payload.address, 'address'),
    domain: normalizeRequiredValue(payload.domain, 'domain'),
    issuedAt: normalizeRequiredValue(payload.issuedAt, 'issuedAt'),
  };
}

function parseSiwsMessage(message: string): VerifiedSiwsMessage {
  const match = message.match(
    /^(.*) wants you to sign in with your Solana account:\n(.*)\n\n([\s\S]+?)\n\nURI: (.*)\nVersion: (.*)\nChain ID: (.*)\nNonce: (.*)\nIssued At: (.*)$/,
  );

  if (!match) {
    throw new Error('SIWS message format invalid.');
  }

  const [, domain, address, statement, uri, version, chainId, nonce, issuedAt] =
    match;

  return {
    address: normalizeRequiredValue(address, 'address'),
    chainId: normalizeRequiredValue(chainId, 'chainId'),
    domain: normalizeRequiredValue(domain, 'domain'),
    issuedAt: normalizeRequiredValue(issuedAt, 'issuedAt'),
    nonce: normalizeRequiredValue(nonce, 'nonce'),
    statement: normalizeRequiredValue(statement, 'statement'),
    uri: normalizeRequiredValue(uri, 'uri'),
    version: normalizeRequiredValue(version, 'version'),
  };
}

function normalizeRequiredValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required for SIWS.`);
  }

  return normalizedValue;
}

function normalizeOptionalValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function encodeBase64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;

  return encodeBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddedValue = normalizedValue.padEnd(
    normalizedValue.length + ((4 - (normalizedValue.length % 4)) % 4),
    '=',
  );

  return decodeBase64(paddedValue);
}

async function signHmac(secret: string, value: string): Promise<Uint8Array> {
  const encodedSecret = encodeTextBuffer(secret);
  const encodedValue = encodeTextBuffer(value);
  const key = await crypto.subtle.importKey(
    'raw',
    encodedSecret,
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encodedValue,
  );

  return new Uint8Array(signature);
}

async function verifyHmac(
  secret: string,
  value: string,
  signature: Uint8Array,
): Promise<boolean> {
  const encodedSecret = encodeTextBuffer(secret);
  const encodedValue = encodeTextBuffer(value);
  const key = await crypto.subtle.importKey(
    'raw',
    encodedSecret,
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['verify'],
  );

  return crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(signature),
    encodedValue,
  );
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function encodeTextBuffer(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value);

  return toArrayBuffer(bytes);
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}