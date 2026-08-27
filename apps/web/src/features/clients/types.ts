/** Форма ответов API клиентов (apps/api/src/modules/clients). */

export type ClientStatusRef = { id?: string; code: string; label: string; color: string; stage?: string };
export type LeadSourceRef = { id?: string; code: string; label: string };
export type AssigneeRef = { role: 'PRIMARY' | 'SECONDARY'; user: { id: string; fullName: string } };

export type ContactRef = {
  id: string;
  fullName: string | null;
  position: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  messenger: string | null;
  isPrimary: boolean;
};

export type TagRef = { tag: { id: string; name: string; color: string } };

export type ClientListItem = {
  id: string;
  displayName: string;
  type: string;
  needsQualification: boolean;
  taxSystem: string | null;
  isVatPayer: boolean;
  edrpou: string | null;
  rnokpp: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  deletedAt: string | null;
  status: ClientStatusRef;
  source: LeadSourceRef | null;
  assignees: AssigneeRef[];
  tags: TagRef[];
  contacts: { phone: string | null; email: string | null }[];
};

export type ClientCard = Omit<ClientListItem, 'contacts'> & {
  legalName: string | null;
  edrpou: string | null;
  rnokpp: string | null;
  vatNumber: string | null;
  vatRegDate: string | null;
  kved: string | null;
  employeeCount: number | null;
  documentsPerMonth: number | null;
  isDiiaCity: boolean;
  businessTypes: string[];
  legalAddress: string | null;
  actualAddress: string | null;
  monthlyFee: string | number | null;
  contractNo: string | null;
  contractDate: string | null;
  notes: string | null;
  statusSince: string;
  contacts: ContactRef[];
  lostReason: { code: string; label: string } | null;
};

export type DuplicateMatch = {
  id: string;
  displayName: string;
  status: { label: string; color: string };
  primaryAssignee: string | null;
  lastActivityAt: string | null;
};
