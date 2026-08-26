import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { UsersService } from './modules/users/users.service';

/**
 * Аварийный доступ (FR-1.7). Запускается в том же образе:
 *   docker compose exec api node dist/cli.js user:reset-password <email>
 *
 * Строго сильнее пароля в .env: доступ к серверу уже требует SSH-ключа,
 * а факт применения остаётся в аудит-логе с пометкой viaCli.
 */
async function main(): Promise<void> {
  const [command, email] = process.argv.slice(2);

  if (!command || !email) {
    console.error('Використання: node dist/cli.js user:reset-password <email>');
    process.exit(1);
  }

  // Логи приложения при разовой команде только мешают читать вывод
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const users = app.get(UsersService);
  const appUrl = app.get(ConfigService).get<string>('APP_URL') ?? '';

  try {
    const user = await users.findByEmail(email);
    if (!user) {
      console.error(`Користувача ${email} не знайдено`);
      process.exitCode = 1;
      return;
    }

    switch (command) {
      case 'user:reset-password': {
        const token = await users.issueResetTokenViaCli(user.id);
        console.log('\nОдноразове посилання для встановлення пароля (діє 72 години):');
        console.log(`${appUrl}/reset-password?token=${token}\n`);
        console.log('Усі сесії користувача відкликано, запис до аудиту зроблено (via CLI).');
        break;
      }
      default:
        console.error(`Невідома команда: ${command}`);
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main();
