import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';

import {
  createSiwsChallenge,
  createSiwsMessage,
  createSiwsSessionToken,
  verifySiwsMessage,
  verifySiwsSessionToken,
} from '../../src/lib/siws';

describe('siws auth flow', () => {
  it('creates a challenge and canonical sign-in message for a wallet address', () => {
    const challenge = createSiwsChallenge({
      domain: 'dashboard.solsafe.local',
      nonce: 'test-nonce-123',
      now: () => new Date('2026-05-18T20:00:00.000Z'),
      statement: 'Sign in to the SolSafe dashboard',
      uri: 'https://dashboard.solsafe.local',
    });
    const message = createSiwsMessage({
      ...challenge,
      address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
    });

    expect(challenge).toMatchObject({
      domain: 'dashboard.solsafe.local',
      nonce: 'test-nonce-123',
      statement: 'Sign in to the SolSafe dashboard',
      uri: 'https://dashboard.solsafe.local',
      version: '1',
    });
    expect(message).toContain(
      'dashboard.solsafe.local wants you to sign in with your Solana account:',
    );
    expect(message).toContain('Nonce: test-nonce-123');
    expect(message).toContain('URI: https://dashboard.solsafe.local');
    expect(message).toContain('Issued At: 2026-05-18T20:00:00.000Z');
  });

  it('verifies a valid signed SIWS message and returns the authenticated session payload', async () => {
    const keypair = nacl.sign.keyPair();
    const address = new PublicKey(keypair.publicKey).toBase58();
    const challenge = createSiwsChallenge({
      domain: 'dashboard.solsafe.local',
      nonce: 'test-nonce-123',
      now: () => new Date('2026-05-18T20:00:00.000Z'),
      statement: 'Sign in to the SolSafe dashboard',
      uri: 'https://dashboard.solsafe.local',
    });
    const message = createSiwsMessage({
      ...challenge,
      address,
    });
    const signature = nacl.sign.detached(
      new TextEncoder().encode(message),
      keypair.secretKey,
    );

    await expect(
      verifySiwsMessage({
        expectedDomain: challenge.domain,
        expectedNonce: challenge.nonce,
        expectedUri: challenge.uri,
        message,
        signature: Buffer.from(signature).toString('base64'),
      }),
    ).resolves.toMatchObject({
      address,
      domain: 'dashboard.solsafe.local',
      nonce: 'test-nonce-123',
      uri: 'https://dashboard.solsafe.local',
    });
  });

  it('rejects a signed SIWS message when the nonce does not match the challenge', async () => {
    const keypair = nacl.sign.keyPair();
    const address = new PublicKey(keypair.publicKey).toBase58();
    const challenge = createSiwsChallenge({
      domain: 'dashboard.solsafe.local',
      nonce: 'test-nonce-123',
      now: () => new Date('2026-05-18T20:00:00.000Z'),
      statement: 'Sign in to the SolSafe dashboard',
      uri: 'https://dashboard.solsafe.local',
    });
    const message = createSiwsMessage({
      ...challenge,
      address,
    });
    const signature = nacl.sign.detached(
      new TextEncoder().encode(message),
      keypair.secretKey,
    );

    await expect(
      verifySiwsMessage({
        expectedDomain: challenge.domain,
        expectedNonce: 'wrong-nonce',
        expectedUri: challenge.uri,
        message,
        signature: Buffer.from(signature).toString('base64'),
      }),
    ).rejects.toThrow('SIWS nonce mismatch.');
  });

  it('signs and verifies the dashboard session token for an authenticated wallet', async () => {
    const sessionToken = await createSiwsSessionToken({
      payload: {
        address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
        domain: 'dashboard.solsafe.local',
        issuedAt: '2026-05-18T20:00:00.000Z',
      },
      secret: 'test-session-secret',
    });

    await expect(
      verifySiwsSessionToken({
        secret: 'test-session-secret',
        token: sessionToken,
      }),
    ).resolves.toMatchObject({
      address: '6WJw6cr7L7Mu6J26G2p5c5Ny8JD7BqXc9E8u6KDAdAm8',
      domain: 'dashboard.solsafe.local',
      issuedAt: '2026-05-18T20:00:00.000Z',
    });
  });
});