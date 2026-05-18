import { NextResponse } from 'next/server';

import {
  createDashboardSiwsChallenge,
  getDashboardNonceCookieOptions,
  isDashboardAuthConfigured,
  SIWS_NONCE_COOKIE_NAME,
} from '@/lib/dashboard-auth';

export const runtime = 'nodejs';

export async function POST() {
  if (!isDashboardAuthConfigured()) {
    return NextResponse.json(
      {
        error: 'SIWS_SESSION_SECRET is not configured for the dashboard.',
      },
      { status: 500 },
    );
  }

  const challenge = createDashboardSiwsChallenge();
  const response = NextResponse.json({ challenge });

  response.cookies.set(
    SIWS_NONCE_COOKIE_NAME,
    challenge.nonce,
    getDashboardNonceCookieOptions(),
  );

  return response;
}