import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  createDashboardSession,
  DASHBOARD_SESSION_COOKIE_NAME,
  getDashboardSessionCookieOptions,
  SIWS_NONCE_COOKIE_NAME,
} from '@/lib/dashboard-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | {
        message?: string;
        signature?: string;
      }
    | null;

  if (!payload?.message || !payload?.signature) {
    return NextResponse.json(
      {
        error: 'Both message and signature are required for SIWS verification.',
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(SIWS_NONCE_COOKIE_NAME)?.value;

  if (!expectedNonce) {
    return NextResponse.json(
      {
        error: 'SIWS challenge cookie is missing or expired.',
      },
      { status: 400 },
    );
  }

  try {
    const session = await createDashboardSession({
      expectedNonce,
      message: payload.message,
      signature: payload.signature,
    });
    const response = NextResponse.json({
      session: {
        address: session.address,
        domain: session.domain,
        issuedAt: session.issuedAt,
      },
    });

    response.cookies.set(
      DASHBOARD_SESSION_COOKIE_NAME,
      session.token,
      getDashboardSessionCookieOptions(),
    );
    response.cookies.set(SIWS_NONCE_COOKIE_NAME, '', {
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to verify the SIWS signature.',
      },
      { status: 400 },
    );
  }
}