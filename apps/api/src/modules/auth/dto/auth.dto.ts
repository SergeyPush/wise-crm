import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AUTH } from 'shared';

export class LoginDto {
  @ApiProperty({ example: 'admin@wisexpert.com.ua' })
  @IsEmail({}, { message: 'Некоректна адреса пошти' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Введіть пароль' })
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: AUTH.PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH.PASSWORD_MIN_LENGTH, {
    message: `Пароль має містити щонайменше ${AUTH.PASSWORD_MIN_LENGTH} символів`,
  })
  @MaxLength(200)
  newPassword!: string;
}

export class CompleteResetDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: AUTH.PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH.PASSWORD_MIN_LENGTH)
  @MaxLength(200)
  newPassword!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  // FR-4.4: «один тумблер, не матриця» — вимкнути можна не відв'язуючи chatId,
  // щоб увімкнути назад без повторного діплінку.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  // Backlog 27.08.2026: раніше — хардкод 8:00 за Києвом на всіх, тепер кожен
  // сам обирає годину (0-23). День тижня (лише будні) лишається спільним.
  @ApiPropertyOptional({ minimum: 0, maximum: 23, description: 'Година ранкового дайджесту за Києвом (0-23)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number;
}
