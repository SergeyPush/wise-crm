import { ApiPropertyOptional } from '@nestjs/swagger';
import { Stage } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Один DTO на три редактируемых довідники (lead-sources, lost-reasons, tags) —
 * форма у них разная (code+label+sortOrder против name+color), но полиморфный
 * `:kind` в пути не даёт завести отдельный класс на каждый без дублирования
 * маршрута. Обязательность конкретных полей проверяет сервис (раздел 3 плана).
 */
export class UpsertDictionaryEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // Лише для створення статусів клієнтів (беклог 28.08.2026) — без нього
  // dashboard.service.ts (wonStatuses) і воронка не знатимуть, куди рахувати новий.
  @ApiPropertyOptional({ enum: Stage })
  @IsOptional()
  @IsEnum(Stage)
  stage?: Stage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
