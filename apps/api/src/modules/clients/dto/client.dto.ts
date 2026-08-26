import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ClientType, TaxSystem } from 'shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Форма ліда — рівно чотири поля (FR-2.0.4), решта заповнюється по ходу воронки. */
export class CreateClientDto {
  @ApiProperty({ description: 'Коротка назва, як звуть у компанії' })
  @IsString()
  @MinLength(1, { message: "Вкажіть ім'я або назву" })
  @MaxLength(255)
  displayName!: string;

  @ApiPropertyOptional({ description: 'Телефон або email — має бути хоча б одне' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Некоректна адреса пошти' })
  @Transform(({ value }) => (value ? String(value).trim().toLowerCase() : value))
  email?: string;

  @ApiProperty({ description: 'Джерело ліда (довідник lead-sources)' })
  @IsUUID()
  sourceId!: string;

  @ApiPropertyOptional({ description: 'За замовчуванням — поточний користувач' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class UpdateClientDto {
  @ApiProperty({ description: 'Для оптимістичної конкурентності (NFR-46)' })
  @IsDateString()
  updatedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ enum: Object.values(ClientType) })
  @IsOptional()
  @IsIn(Object.values(ClientType))
  type?: ClientType;

  @ApiPropertyOptional({ description: '8 цифр + контрольна сума' })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'ЄДРПОУ — 8 цифр' })
  edrpou?: string;

  @ApiPropertyOptional({ description: '10 цифр + контрольна сума' })
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'РНОКПП — 10 цифр' })
  rnokpp?: string;

  @ApiPropertyOptional({ description: 'ІПН платника ПДВ, 12 цифр' })
  @IsOptional()
  @Matches(/^\d{12}$/, { message: 'ІПН платника ПДВ — 12 цифр' })
  vatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVatPayer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  vatRegDate?: string;

  @ApiPropertyOptional({ enum: Object.values(TaxSystem) })
  @IsOptional()
  @IsIn(Object.values(TaxSystem))
  taxSystem?: TaxSystem;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  kved?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeCount?: number;

  @ApiPropertyOptional({ description: 'Основной вход для розрахунку тарифу' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  documentsPerMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDiiaCity?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  businessTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actualAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contractNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  contractDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class ListClientsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Пошук: назва, ЄДРПОУ/РНОКПП, телефон, email' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ description: 'LEAD | IN_WORK | WON | LOST' })
  @IsOptional()
  @IsIn(['LEAD', 'IN_WORK', 'WON', 'LOST'])
  stage?: string;

  @ApiPropertyOptional({ description: 'uuid або "none" — пул нерозподілених' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({ enum: Object.values(ClientType) })
  @IsOptional()
  @IsIn(Object.values(ClientType))
  type?: ClientType;
}

export class ClientDuplicatesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{8}$/)
  edrpou?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{10}$/)
  rnokpp?: string;
}

/** FR-2.8: причина обов'язкова лише для статусів з `requiresReason` — перевіряє сервіс. */
export class ChangeStatusDto {
  @ApiProperty()
  @IsUUID()
  statusId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

/** PUT замінює весь склад відповідальних (FR-2.0). */
export class AssigneesDto {
  @ApiProperty({ description: 'Рівно один PRIMARY' })
  @IsUUID()
  primaryId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  secondaryIds?: string[];
}

/** FR-2.2.1: одразу закрита задача-дзвінок. */
export class ContactLogDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  result!: string;
}

export class ContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (value ? String(value).trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  messenger?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
