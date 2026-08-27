import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MeModule } from './modules/me/me.module';
import { HealthModule } from './modules/health/health.module';
import { DictionariesModule } from './modules/dictionaries/dictionaries.module';
import { ClientsModule } from './modules/clients/clients.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DigestModule } from './modules/digest/digest.module';
import { FilesModule } from './modules/files/files.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { WebLeadsModule } from './modules/web-leads/web-leads.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { OnboardingGuard } from './common/guards/onboarding.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['../../.env'],
      // В тестах окружение задаёт setup-файл: .env разработчика не должен
      // влиять на прогон (иначе bootstrap-админ появляется в тестовой БД)
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
        // NFR-31.1: тело запроса и ответа не логируется никогда —
        // там ЄДРПОУ, телефоны и суммы договоров
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        redact: ['req.headers.cookie', 'req.headers.authorization'],
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
            : undefined,
      },
    }),
    // NFR-16: общий лимит 100 запросов в минуту на пользователя.
    // Логин ограничен отдельно и жёстче (@Throttle на эндпоинте).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    MeModule,
    HealthModule,
    DictionariesModule,
    ClientsModule,
    TasksModule,
    CommentsModule,
    DigestModule,
    FilesModule,
    TelegramModule,
    WebLeadsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Порядок важен: сначала лимит, потом аутентификация, CSRF, онбординг, права
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: OnboardingGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
