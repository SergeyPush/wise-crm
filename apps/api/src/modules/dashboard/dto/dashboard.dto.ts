import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

/** FR-5.1.4: 90 днів за замовчуванням, а не 30 — потік лідів нерегулярний. */
export const PERIOD_PRESETS = ['30', '90', '365', 'custom'] as const;

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: PERIOD_PRESETS, default: '90' })
  @IsOptional()
  @IsIn(PERIOD_PRESETS)
  period?: (typeof PERIOD_PRESETS)[number];

  @ApiPropertyOptional({ description: 'Лише для period=custom' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Лише для period=custom' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
