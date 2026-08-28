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
 * Статуси клієнтів. Створення — code+label+stage (беклог 28.08.2026), решта
 * структурних полів (isTerminal/requiresReason/isDefaultForNew) — фіксовані
 * дефолти зі схеми, з UI не задаються навіть на створенні. PATCH — і далі
 * лише label/color/sortOrder: ці поля читаються бекендом жорстко
 * (dashboard.service.ts, web-leads.service.ts), тому редагування обмежене.
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
