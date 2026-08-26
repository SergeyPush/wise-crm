import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, permissionsFor } from 'shared';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowOnboarding } from '../../common/decorators/allow-onboarding.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { ChangePasswordDto, UpdateProfileDto } from '../auth/dto/auth.dto';

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
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
  @ApiOperation({ summary: 'ПІБ, телефон, аватар' })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: dto,
      select: { id: true, fullName: true, phone: true, avatarUrl: true },
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
}
