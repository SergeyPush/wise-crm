import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AUTH, ErrorCode } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  position: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  isProtected: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(q.q
        ? {
            OR: [
              { fullName: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_FIELDS,
        orderBy: q.orderBy(['fullName', 'createdAt', 'lastLoginAt'], { fullName: 'asc' }),
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(items, total, q as PaginationQueryDto);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!user) throw new AppException(404, ErrorCode.NOT_FOUND, 'Користувача не знайдено');
    return user;
  }

  /**
   * Создание сотрудника. Писем система не шлёт (FR-1.1), поэтому вместе с
   * учёткой выдаётся одноразовая ссылка — админ копирует её кнопкой и
   * передаёт лично или в Telegram.
   */
  async create(dto: CreateUserDto, actorId: string, ip?: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new AppException(409, ErrorCode.EMAIL_TAKEN, 'Користувач із такою поштою вже існує');
    }

    // Пароль случайный и одноразовый: вход возможен только по ссылке смены.
    const tempPassword = PasswordService.generate();
    const { user, resetToken } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          phone: dto.phone,
          position: dto.position,
          passwordHash: await this.passwords.hash(tempPassword),
          mustChangePassword: true,
        },
        select: PUBLIC_FIELDS,
      });
      const token = await this.issueResetToken(tx, created.id, actorId, false);
      await this.audit.log(
        {
          actorId,
          action: 'user.create',
          entityType: 'user',
          entityId: created.id,
          targetUserId: created.id,
          payload: { email: dto.email, role: dto.role },
          ip,
        },
        tx,
      );
      return { user: created, resetToken: token };
    });

    return { user, resetToken, expiresInHours: AUTH.RESET_LINK_TTL_HOURS };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new AppException(404, ErrorCode.NOT_FOUND, 'Користувача не знайдено');

    // FR-1.8: владельца нельзя понизить в роли через интерфейс — только CLI
    if (target.isProtected && dto.role && dto.role !== target.role) {
      throw new AppException(
        403,
        ErrorCode.USER_PROTECTED,
        'Роль власника системи змінюється лише через CLI',
      );
    }

    if (dto.email && dto.email !== target.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (taken) throw new AppException(409, ErrorCode.EMAIL_TAKEN, 'Ця пошта вже зайнята');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: dto, select: PUBLIC_FIELDS });
      // Смена email — смена логина, поэтому в аудите оба значения (FR-1.3.1)
      const payload: Prisma.JsonObject = { changed: Object.keys(dto) };
      if (dto.email && dto.email !== target.email) {
        payload.emailFrom = target.email;
        payload.emailTo = dto.email;
      }
      if (dto.role && dto.role !== target.role) {
        payload.roleFrom = target.role;
        payload.roleTo = dto.role;
      }
      await this.audit.log(
        { actorId, action: 'user.update', entityType: 'user', entityId: id, targetUserId: id, payload, ip },
        tx,
      );
      return updated;
    });
  }

  /**
   * Сброс пароля админом (FR-1.3). Админ никогда не видит действующий пароль,
   * сброс отзывает все сессии, пользователь получает уведомление —
   * действие должно быть видимым, а не тихим.
   */
  async resetPassword(id: string, actorId: string, actorName: string, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new AppException(404, ErrorCode.NOT_FOUND, 'Користувача не знайдено');
    if (target.isProtected) {
      throw new AppException(
        403,
        ErrorCode.USER_PROTECTED,
        'Пароль власника системи скидається лише через CLI',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const token = await this.issueResetToken(tx, id, actorId, false);
      await tx.user.update({ where: { id }, data: { mustChangePassword: true } });
      const revoked = await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.notification.create({
        data: {
          userId: id,
          type: 'password_reset',
          title: 'Ваш пароль скинуто',
          body: `Пароль скинув адміністратор ${actorName}`,
          priority: 'HIGH',
        },
      });
      await this.audit.log(
        {
          actorId,
          action: 'password.reset',
          entityType: 'user',
          entityId: id,
          targetUserId: id,
          payload: { revokedSessions: revoked.count },
          ip,
        },
        tx,
      );
      return { resetToken: token, expiresInHours: AUTH.RESET_LINK_TTL_HOURS };
    });
  }

  /**
   * Деактивация (FR-1.9). Одной транзакцией: открытые задачи и роль PRIMARY
   * переходят к ADMIN, SECONDARY-строки удаляются. Без этого задачи
   * деактивированного молча исчезают из всех представлений.
   */
  async deactivate(id: string, actorId: string, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new AppException(404, ErrorCode.NOT_FOUND, 'Користувача не знайдено');
    if (target.isProtected) {
      throw new AppException(
        403,
        ErrorCode.USER_PROTECTED,
        'Власника системи деактивувати не можна',
      );
    }
    if (id === actorId) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Не можна деактивувати себе');
    }

    return this.prisma.$transaction(async (tx) => {
      const tasks = await tx.task.updateMany({
        where: { assigneeId: id, status: { in: ['OPEN', 'IN_PROGRESS'] }, deletedAt: null },
        data: { assigneeId: actorId },
      });

      // PRIMARY переходит к админу; если он уже среди ответственных —
      // строка обновляется, а не создаётся второй раз (составной ключ).
      const primaries = await tx.clientAssignee.findMany({
        where: { userId: id, role: 'PRIMARY' },
        select: { clientId: true },
      });
      for (const { clientId } of primaries) {
        await tx.clientAssignee.delete({ where: { clientId_userId: { clientId, userId: id } } });
        await tx.clientAssignee.upsert({
          where: { clientId_userId: { clientId, userId: actorId } },
          create: { clientId, userId: actorId, role: 'PRIMARY' },
          update: { role: 'PRIMARY' },
        });
      }
      const secondaries = await tx.clientAssignee.deleteMany({
        where: { userId: id, role: 'SECONDARY' },
      });

      await tx.user.update({ where: { id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const summary = {
        tasksReassigned: tasks.count,
        clientsPrimaryMoved: primaries.length,
        clientsSecondaryRemoved: secondaries.count,
      };

      await tx.notification.create({
        data: {
          userId: actorId,
          type: 'user_deactivated',
          title: `Співробітника ${target.fullName} деактивовано`,
          body: `Переназначено задач: ${summary.tasksReassigned}, клієнтів: ${summary.clientsPrimaryMoved}`,
        },
      });
      await this.audit.log(
        {
          actorId,
          action: 'user.deactivate',
          entityType: 'user',
          entityId: id,
          targetUserId: id,
          payload: summary,
          ip,
        },
        tx,
      );
      return summary;
    });
  }

  async activate(id: string, actorId: string, ip?: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: PUBLIC_FIELDS,
    });
    await this.audit.log({
      actorId,
      action: 'user.activate',
      entityType: 'user',
      entityId: id,
      targetUserId: id,
      ip,
    });
    return user;
  }

  /** Одноразовая ссылка: в БД только хеш, живёт 72 часа (FR-1.3). */
  private async issueResetToken(
    tx: Prisma.TransactionClient,
    userId: string,
    createdBy: string | null,
    viaCli: boolean,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }, // старые ссылки сгорают
    });
    await tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash: TokenService.hash(raw),
        expiresAt: new Date(Date.now() + AUTH.RESET_LINK_TTL_HOURS * 3600_000),
        createdBy,
        viaCli,
      },
    });
    return raw;
  }

  /** Используется CLI (FR-1.7): работает и для isProtected. */
  async issueResetTokenViaCli(userId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const token = await this.issueResetToken(tx, userId, null, true);
      await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { actorId: null, action: 'password.reset', targetUserId: userId, viaCli: true },
        tx,
      );
      return token;
    });
  }

  /** Легкий список для форм: вибір відповідального (FR-2.0), @згадки (FR-2.17). */
  async lite() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }
}
