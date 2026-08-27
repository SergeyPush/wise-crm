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
