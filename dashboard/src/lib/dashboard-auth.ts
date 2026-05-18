import 'server-only';

import { cookies } from 'next/headers';

import {
  createSiwsChallenge,
  createSiwsSessionToken,
  verifySiwsMessage,
  verifySiwsSessionToken,
  type SiwsChallenge,
} from './siws';

import type { DashboardSession } from './siws';

export const DASHBOARD_SESSION_COOKIE_NAME = 'solsafe_dashboard_session';
export const SIWS_NONCE_COOKIE_NAME = 'solsafe_dashboard_siws_nonce';

const DEFAULT_DASHBOARD_ORIGIN = 'http://localhost:3000';
const DEFAULT_SIWS_STATEMENT = 'Sign in to the SolSafe dashboard';

export function isDashboardAuthConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.SIWS_SESSION_SECRET?.trim());
}

export function getDashboardOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const rawOrigin = env.SIWS_ORIGIN?.trim() || DEFAULT_DASHBOARD_ORIGIN;

  try {
    return new URL(rawOrigin).toString().replace(/\/$/, '');
  } catch {
    throw new Error('SIWS_ORIGIN must be a valid URL for the dashboard.');
  }
}

export function getDashboardDomain(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.SIWS_DOMAIN?.trim() || new URL(getDashboardOrigin(env)).host;
}

export function createDashboardSiwsChallenge(
  env: NodeJS.ProcessEnv = process.env,
): SiwsChallenge {
  return createSiwsChallenge({
    domain: getDashboardDomain(env),
    statement: DEFAULT_SIWS_STATEMENT,
    uri: getDashboardOrigin(env),
  });
}

export async function createDashboardSession(input: {
  env?: NodeJS.ProcessEnv;
  expectedNonce: string;
  message: string;
  signature: string;
}): Promise<DashboardSession & { token: string }> {
  const env = input.env ?? process.env;
  const verifiedMessage = await verifySiwsMessage({
    expectedDomain: getDashboardDomain(env),
    expectedNonce: input.expectedNonce,
    expectedUri: getDashboardOrigin(env),
    message: input.message,
    signature: input.signature,
  });
  const session = {
    address: verifiedMessage.address,
    domain: verifiedMessage.domain,
    issuedAt: verifiedMessage.issuedAt,
  };

  return {
    ...session,
    token: await createSiwsSessionToken({
      payload: session,
      secret: getDashboardSessionSecret(env),
    }),
  };
}

export async function readDashboardSession(): Promise<DashboardSession | null> {
  if (!isDashboardAuthConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(DASHBOARD_SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  try {
    return await verifySiwsSessionToken({
      secret: getDashboardSessionSecret(),
      token: sessionToken,
    });
  } catch {
    return null;
  }
}

export function getDashboardNonceCookieOptions(): {
  httpOnly: true;
  maxAge: number;
  path: '/';
  sameSite: 'lax';
  secure: boolean;
} {
  return createCookieOptions(60 * 5);
}

export function getDashboardSessionCookieOptions(): {
  httpOnly: true;
  maxAge: number;
  path: '/';
  sameSite: 'lax';
  secure: boolean;
} {
  return createCookieOptions(60 * 60 * 24 * 7);
}

function getDashboardSessionSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.SIWS_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'SIWS_SESSION_SECRET is required to verify dashboard SIWS sessions.',
    );
  }

  return secret;
}

function createCookieOptions(maxAge: number): {
  httpOnly: true;
  maxAge: number;
  path: '/';
  sameSite: 'lax';
  secure: boolean;
} {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}