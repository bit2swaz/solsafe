import 'server-only';

import { readDashboardSession } from './dashboard-auth';
import { getDashboardSnapshot, type DashboardSnapshot } from './dashboard-data';
import type { DashboardSession } from './siws';

export interface CurrentDashboardHistoryResult {
  address: string;
  history: DashboardSnapshot['history'];
  historyState: DashboardSnapshot['historyState'];
}

export interface CurrentDashboardHistoryDependencies {
  getDashboardSnapshot?: typeof getDashboardSnapshot;
  readDashboardSession?: () => Promise<DashboardSession | null>;
}

export async function getCurrentDashboardHistory(
  dependencies: CurrentDashboardHistoryDependencies = {},
): Promise<CurrentDashboardHistoryResult | null> {
  const session = await (dependencies.readDashboardSession ?? readDashboardSession)();

  if (!session) {
    return null;
  }

  const snapshot = await (dependencies.getDashboardSnapshot ?? getDashboardSnapshot)(
    session.address,
  );

  return {
    address: session.address,
    history: snapshot.history,
    historyState: snapshot.historyState,
  };
}