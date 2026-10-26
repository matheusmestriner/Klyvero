import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsFQDN,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Prisma, TenantStatus, TenantType, UserRole } from '@prisma/client';

export class CreateTenantDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/) slug!: string;
  @IsEnum(TenantType) type!: TenantType;
  @IsOptional() @IsUUID() parentTenantId?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
}

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsEnum(UserRole) role!: UserRole;
}

export class UpdateFeatureDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsObject() config?: Prisma.InputJsonObject;
}

export class CreateDomainDto {
  @IsFQDN({ require_tld: true }) @MaxLength(253) hostname!: string;
}
