import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
}
