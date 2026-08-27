import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Фабрики, а не фикстурный дамп (09-implementation-plan.md, раздел 5.5):
 * общий дамп через месяц превращается в клубок, который никто не трогает.
 * Каждая фабрика даёт валидный объект с осмысленными умолчаниями.
 */

// Argon2 с прод-параметрами превращает 30 тестовых пользователей в минуты
// ожидания, поэтому в тестах хеш считается по минимальным настройкам.
const TEST_ARGON: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 8192,
  timeCost: 2,
  parallelism: 1,
};

export const DEFAULT_PASSWORD = 'TestPassword2026x';

export async function makeUser(
  prisma: PrismaService,
  overrides: Partial<{
    email: string;
    fullName: string;
    role: 'ADMIN' | 'USER';
    password: string;
    isActive: boolean;
    isProtected: boolean;
    mustChangePassword: boolean;
  }> = {},
) {
  const password = overrides.password ?? DEFAULT_PASSWORD;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${randomUUID().slice(0, 8)}@test.ua`,
      fullName: overrides.fullName ?? 'Тестовий Користувач',
      role: overrides.role ?? 'USER',
      passwordHash: await argon2.hash(password, TEST_ARGON),
      isActive: overrides.isActive ?? true,
      isProtected: overrides.isProtected ?? false,
      mustChangePassword: overrides.mustChangePassword ?? false,
    },
  });
}

export async function makeClient(
  prisma: PrismaService,
  overrides: Partial<{
    displayName: string;
    statusCode: string;
    assigneeId: string;
    edrpou: string;
  }> = {},
) {
  const status = await prisma.clientStatus.findFirstOrThrow({
    where: overrides.statusCode ? { code: overrides.statusCode } : { isDefaultForNew: true },
  });
  return prisma.client.create({
    data: {
      displayName: overrides.displayName ?? 'ТОВ «Тестова компанія»',
      type: 'COMPANY',
      edrpou: overrides.edrpou,
      statusId: status.id,
      ...(overrides.assigneeId
        ? { assignees: { create: { userId: overrides.assigneeId, role: 'PRIMARY' } } }
        : {}),
    },
  });
}

export async function makeTask(
  prisma: PrismaService,
  authorId: string,
  overrides: Partial<{
    title: string;
    type: 'CALL' | 'PROPOSAL' | 'CONTRACT' | 'DOCS' | 'MEETING' | 'OTHER';
    status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
    priority: 'LOW' | 'NORMAL' | 'HIGH';
    assigneeId: string | null;
    clientId: string;
    dueAt: Date;
    completedAt: Date;
    result: string;
    cancelReason: string;
  }> = {},
) {
  return prisma.task.create({
    data: {
      title: overrides.title ?? 'Подзвонити клієнту',
      type: overrides.type ?? 'CALL',
      status: overrides.status ?? 'OPEN',
      priority: overrides.priority ?? 'NORMAL',
      authorId,
      assigneeId: overrides.assigneeId === undefined ? authorId : overrides.assigneeId,
      clientId: overrides.clientId,
      dueAt: overrides.dueAt,
      completedAt: overrides.completedAt,
      result: overrides.result,
      cancelReason: overrides.cancelReason,
    },
  });
}
