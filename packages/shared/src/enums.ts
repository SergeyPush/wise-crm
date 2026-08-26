// Значения дублируют enum'ы Prisma. Общий источник для фронта и бэка,
// чтобы строки статусов и ролей не переписывались руками в двух местах.

export const Role = { ADMIN: 'ADMIN', USER: 'USER' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AssigneeRole = { PRIMARY: 'PRIMARY', SECONDARY: 'SECONDARY' } as const;
export type AssigneeRole = (typeof AssigneeRole)[keyof typeof AssigneeRole];

export const ClientType = {
  COMPANY: 'COMPANY',
  FOP: 'FOP',
  PERSON: 'PERSON',
  OTHER: 'OTHER',
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];

export const TaxSystem = {
  GENERAL: 'GENERAL',
  EP1: 'EP1',
  EP2: 'EP2',
  EP3_5: 'EP3_5',
  EP3_3_VAT: 'EP3_3_VAT',
  EP4: 'EP4',
} as const;
export type TaxSystem = (typeof TaxSystem)[keyof typeof TaxSystem];

// Семантика статуса для логики (FR-2.6): сам статус — справочник, stage — enum
export const Stage = { LEAD: 'LEAD', IN_WORK: 'IN_WORK', WON: 'WON', LOST: 'LOST' } as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

export const TaskType = {
  CALL: 'CALL',
  PROPOSAL: 'PROPOSAL',
  CONTRACT: 'CONTRACT',
  DOCS: 'DOCS',
  MEETING: 'MEETING',
  OTHER: 'OTHER',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

// Типы, для которых результат обязателен при закрытии (FR-3.5)
export const TASK_TYPES_REQUIRING_RESULT: TaskType[] = [
  TaskType.CALL,
  TaskType.PROPOSAL,
  TaskType.CONTRACT,
];

export const TaskStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const Priority = { LOW: 'LOW', NORMAL: 'NORMAL', HIGH: 'HIGH' } as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const EntityType = { CLIENT: 'CLIENT', TASK: 'TASK' } as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const NotificationChannel = { IN_APP: 'IN_APP', TELEGRAM: 'TELEGRAM' } as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const DeliveryStatus = { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED' } as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];
