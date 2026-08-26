import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { LoginAttemptsService } from './login-attempts.service';
import { BootstrapService } from './bootstrap.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, PasswordService, LoginAttemptsService, BootstrapService],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
