import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SuppressionReason } from '@prisma/client';

export class MailboxDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsString() @MinLength(1) @MaxLength(255) host!: string;
  @IsInt() @Min(1) @Max(65535) port!: number;
  @IsBoolean() secure!: boolean;
  @IsOptional() @IsString() @MaxLength(254) username?: string;
  @IsOptional() @IsString() @MaxLength(512) password?: string;
  @IsEmail() @MaxLength(254) fromAddress!: string;
  @IsOptional() @IsString() @MaxLength(160) fromName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) replyTo?: string;
}

export class SendEmailDto {
  @IsUUID() mailboxId!: string;
  @IsEmail() @MaxLength(254) to!: string;
  @IsString() @MinLength(1) @MaxLength(998) subject!: string;
  @IsOptional() @IsString() @MaxLength(50_000) text?: string;
  @IsOptional() @IsString() @MaxLength(80_000) html?: string;
  @IsOptional() @IsUUID() leadId?: string;
}

export class SuppressDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsEnum(SuppressionReason) reason?: SuppressionReason;
}

export class InboundEmailDto {
  @IsUUID() tenantId!: string;
  @IsEmail() @MaxLength(254) from!: string;
  @IsEmail() @MaxLength(254) to!: string;
  @IsOptional() @IsString() @MaxLength(998) subject?: string;
  @IsOptional() @IsString() @MaxLength(50_000) text?: string;
  @IsOptional() @IsString() @MaxLength(80_000) html?: string;
  @IsOptional() @IsString() @MaxLength(500) externalId?: string;
}
