import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AuthModule } from '../auth/auth.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [AuthModule, TelegramModule],
  controllers: [MeController],
})
export class MeModule {}
