/** Три редаговані довідники (розділ 3 плану) — форма різна, тому окремі типи. */
export type LeadSourceEntry = {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

export type LostReasonEntry = {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type TagEntry = {
  id: string;
  name: string;
  color: string;
};

/**
 * Статуси клієнтів (backlog 27.08.2026) — на відміну від трьох вище, лише
 * PATCH і лише name/color/sortOrder: stage/isTerminal/requiresReason/
 * isDefaultForNew критичні для воронки і читаються бекендом жорстко
 * (dashboard.service.ts, web-leads.service.ts), тому на UI — тільки перегляд.
 */
export type ClientStatusEntry = {
  id: string;
  code: string;
  label: string;
  color: string;
  sortOrder: number;
  stage: 'LEAD' | 'IN_WORK' | 'WON' | 'LOST';
  isTerminal: boolean;
  requiresReason: boolean;
  isDefaultForNew: boolean;
  isActive: boolean;
};
