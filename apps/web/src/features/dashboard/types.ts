/** Форма відповіді GET /dashboard (apps/api/src/modules/dashboard) — розрізняється за роллю. */
export type FunnelEntry = { statusId: string; code: string; label: string; stage: string; count: number };
export type SourceConversionEntry = { sourceId: string; code: string; label: string; leads: number; contracts: number; pct: number };
export type OverdueByEmployeeEntry = { userId: string; fullName: string; overdueCount: number };
export type PerManagerEntry = { userId: string; fullName: string; leadsInWork: number; contractsInPeriod: number; overdueCount: number };
export type MyClientsByStatusEntry = { statusId: string; code: string; label: string; count: number };

export type AdminDashboardData = {
  period: { from: string; to: string };
  funnel: FunnelEntry[];
  newLeads: number;
  sourceConversion: SourceConversionEntry[];
  leadToContract: { leads: number; contracts: number; pct: number };
  avgFunnelDays: number | null;
  contractsSum: number;
  overdueByEmployee: OverdueByEmployeeEntry[];
  unassignedCount: number;
  missingTariffDataCount: number;
  perManager: PerManagerEntry[];
};

export type UserDashboardData = {
  myTasksToday: number;
  myOverdue: number;
  myClientsByStatus: MyClientsByStatusEntry[];
  leadsInactive: number;
  proposalsNoReply: number;
  unassignedCount: number;
};

export const PERIOD_PRESETS = [
  { value: '30', label: '30 днів' },
  { value: '90', label: '90 днів' },
  { value: '365', label: 'Рік' },
];
