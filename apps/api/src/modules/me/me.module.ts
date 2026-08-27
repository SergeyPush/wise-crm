import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AuthModule } from '../auth/auth.module';
import { DigestModule } from '../digest/digest.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [AuthModule, TelegramModule, DigestModule],
  controllers: [MeController],
})
export class MeModule {}
