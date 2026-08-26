import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from 'shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateUserDto {
  @ApiProperty({ description: 'Логін і ідентифікатор (FR-1.1)' })
  @IsEmail({}, { message: 'Некоректна адреса пошти' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2, { message: 'Вкажіть ПІБ' })
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ enum: Object.values(Role), default: Role.USER })
  @IsIn(Object.values(Role))
  role: Role = Role.USER;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Зміна email = зміна логіну, пишеться в аудит' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ enum: Object.values(Role) })
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
