import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGINATION, Paginated } from 'shared';

/** Соглашение из 03-tech-stack.md: ?page=1&limit=25&sort=-createdAt */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: PAGINATION.DEFAULT_LIMIT, maximum: PAGINATION.MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  limit: number = PAGINATION.DEFAULT_LIMIT;

  @ApiPropertyOptional({ description: 'Поле сортировки, минус — по убыванию: -createdAt' })
  @IsOptional()
  @IsString()
  sort?: string;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** `-createdAt` → { createdAt: 'desc' }; неизвестное поле игнорируется вызывающим. */
  orderBy(allowed: string[], fallback: Record<string, 'asc' | 'desc'>): Record<string, 'asc' | 'desc'> {
    if (!this.sort) return fallback;
    const desc = this.sort.startsWith('-');
    const field = desc ? this.sort.slice(1) : this.sort;
    if (!allowed.includes(field)) return fallback;
    return { [field]: desc ? 'desc' : 'asc' };
  }
}

export function paginated<T>(items: T[], total: number, q: PaginationQueryDto): Paginated<T> {
  return { items, total, page: q.page, limit: q.limit };
}
