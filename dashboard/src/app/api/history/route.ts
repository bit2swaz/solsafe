import { NextResponse } from 'next/server';

import { getCurrentDashboardHistory } from '@/lib/current-dashboard-history';

export const runtime = 'nodejs';

export async function GET() {
  const history = await getCurrentDashboardHistory();

  if (!history) {
    return NextResponse.json(
      {
        error: 'An active SIWS session is required to load dashboard history.',
      },
      { status: 401 },
    );
  }

  return NextResponse.json(history);
}