import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode, Role, permissionsFor } from 'shared';
import { AppException } from '../../common/app.exception';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowOnboarding } from '../../common/decorators/allow-onboarding.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { ChangePasswordDto, UpdateProfileDto } from '../auth/dto/auth.dto';
import { DigestService } from '../digest/digest.service';
import { TelegramService } from '../telegram/telegram.service';

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly telegram: TelegramService,
    private readonly digest: DigestService,
  ) {}

  @Get()
  @AllowOnboarding()
  @ApiOperation({ summary: 'Профіль, права та стан онбордингу' })
  async me(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        position: true,
        avatarUrl: true,
        role: true,
        telegramEnabled: true,
        digestHour: true,
        mustChangePassword: true,
        isProtected: true,
        lastLoginAt: true,
      },
    });
    return {
      ...row,
      permissions: permissionsFor(row.role as Role),
    };
  }

  @Patch()
  @AllowOnboarding()
  @ApiOperation({ summary: 'ПІБ, телефон, аватар, тумблер Telegram (FR-4.4)' })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    if (dto.telegramEnabled === true) {
      const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { telegramChatId: true } });
      if (!row.telegramChatId) {
        throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Спочатку підключіть Telegram через діплінк');
      }
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: dto,
      select: { id: true, fullName: true, phone: true, avatarUrl: true, telegramEnabled: true, digestHour: true },
    });
  }

  @Post('password')
  @AllowOnboarding()
  @ApiOperation({ summary: 'Зміна свого пароля — відкликає всі сесії' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changeOwnPassword(user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  @Post('sessions/revoke-all')
  @ApiOperation({ summary: 'Вихід з усіх пристроїв' })
  async revokeSessions(@CurrentUser() user: AuthUser) {
    const count = await this.tokens.revokeAllForUser(user.id);
    return { revoked: count };
  }

  @Post('telegram/link')
  @ApiOperation({ summary: 'Одноразовий діплінк на бота (FR-4.2)' })
  telegramLink(@CurrentUser() user: AuthUser) {
    const url = this.telegram.createLinkToken(user.id);
    if (!url) throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Telegram-бот тимчасово недоступний');
    return { url };
  }

  @Post('digest/test')
  @ApiOperation({ summary: "«Надіслати зараз» — ручна перевірка, не чекаючи свою digestHour (backlog 27.08.2026)" })
  async digestTest(@CurrentUser() user: AuthUser) {
    await this.digest.sendDigestNow(user.id);
    return { ok: true };
  }

  @Post('telegram/test')
  @ApiOperation({ summary: 'Тестове сповіщення (FR-4.4)' })
  async telegramTest(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { telegramChatId: true, telegramEnabled: true },
    });
    if (!row.telegramChatId || !row.telegramEnabled) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Telegram не підключено');
    }
    await this.telegram.sendTestMessage(row.telegramChatId);
    return { ok: true };
  }
}
