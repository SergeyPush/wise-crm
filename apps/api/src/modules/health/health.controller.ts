import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** Единственные эндпоинты без авторизации и rate limit (NFR-11, NFR-16). */
@ApiTags('health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Живість процесу' })
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Готовність: перевіряє з’єднання з БД' })
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }
}
