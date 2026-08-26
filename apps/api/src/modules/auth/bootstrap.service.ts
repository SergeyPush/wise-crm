import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';

/**
 * FR-1.6: при первом старте, если в базе нет ни одного пользователя,
 * создаётся ADMIN с адресом из ADMIN_BOOTSTRAP_EMAIL и случайным одноразовым
 * паролем — он печатается в лог контейнера один раз.
 *
 * Пароля в .env нет намеренно: файл попадает в каждый ночной бэкап и в снапшот
 * VPS, читается всеми, у кого есть доступ к серверу, и никогда не меняется —
 * после чего аудит «кто менял данные клиента» перестаёт что-либо доказывать.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL');
    if (!email) return;

    const count = await this.prisma.user.count();
    if (count > 0) return;

    const password = PasswordService.generate();
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        fullName: 'Адміністратор',
        role: Role.ADMIN,
        passwordHash: await this.passwords.hash(password),
        mustChangePassword: true,
        isProtected: true, // FR-1.8: владелец, снимается только через CLI
      },
    });

    await this.audit.log({
      actorId: null,
      action: 'user.bootstrap',
      entityType: 'user',
      entityId: user.id,
      targetUserId: user.id,
      payload: { email },
    });

    // Единственный раз, когда пароль появляется в открытом виде
    this.logger.warn(
      [
        '',
        '═══════════════════════════════════════════════════════════',
        ' СТВОРЕНО ПЕРШОГО АДМІНІСТРАТОРА (FR-1.6)',
        `   Пошта:  ${email}`,
        `   Пароль: ${password}`,
        ' Пароль показано ОДИН РАЗ. При першому вході його потрібно',
        ' змінити та налаштувати двофакторну автентифікацію (NFR-43).',
        '═══════════════════════════════════════════════════════════',
        '',
      ].join('\n'),
    );
  }
}
