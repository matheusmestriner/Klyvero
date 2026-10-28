import {
  IsDateString,
  IsEmail,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CampaignChannel, CampaignStatus, IntegrationStatus, IntegrationType, LeadStatus, Prisma } from '@prisma/client';

export class LeadDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(160) jobTitle?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(2048) linkedinUrl?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) website?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @IsString() @MaxLength(10_000) notes?: string;
}

export class CompanyDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) website?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(80) size?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(10_000) notes?: string;
}

export class ContactDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) jobTitle?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(2048) linkedinUrl?: string;
  @IsOptional() @IsString() @MaxLength(10_000) notes?: string;
}

export class CampaignDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsEnum(CampaignChannel) channel!: CampaignChannel;
  @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class AgentDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @MinLength(1) @MaxLength(20_000) systemPrompt!: string;
  @IsOptional() @IsString() @MaxLength(80) tone?: string;
  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[a-zA-Z0-9._:-]+$/) model?: string;
  @IsOptional() @IsObject() channels?: Prisma.InputJsonObject;
  @IsOptional() @IsObject() handoffRules?: Prisma.InputJsonObject;
}

export class EventDto {
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() @MaxLength(160) attendeeName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) attendeeEmail?: string;
}

export class UpdateEventDto extends PartialType(EventDto) {}

export class IntegrationDto {
  @IsEnum(IntegrationType) type!: IntegrationType;
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsEnum(IntegrationStatus) status?: IntegrationStatus;
  @IsOptional() @IsObject() config?: Prisma.InputJsonObject;
}
