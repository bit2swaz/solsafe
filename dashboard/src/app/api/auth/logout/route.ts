import { NextResponse } from 'next/server';

import { DASHBOARD_SESSION_COOKIE_NAME } from '@/lib/dashboard-auth';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(DASHBOARD_SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
  });

  return response;
}