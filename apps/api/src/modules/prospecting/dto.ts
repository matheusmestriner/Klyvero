import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const shortArray = { each: true } as const;

export class IcpDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) industries: string[] = [];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) countries: string[] = [];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) states: string[] = [];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) cities: string[] = [];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) companySizes: string[] = [];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) jobTitles: string[] = [];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString(shortArray) keywords: string[] = [];
  @IsOptional() @IsInt() @Min(0) @Max(100) minScore = 0;
}

export class ProspectRowDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(200) jobTitle?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) website?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) linkedinUrl?: string;
  @IsOptional() @IsString() @MaxLength(160) industry?: string;
  @IsOptional() @IsString() @MaxLength(160) city?: string;
  @IsOptional() @IsString() @MaxLength(160) state?: string;
  @IsOptional() @IsString() @MaxLength(160) country?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsObject() raw?: Record<string, unknown>;
}

export class ImportProspectsDto {
  @IsOptional() @IsString() @MaxLength(160) jobName?: string;
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ProspectRowDto)
  rows!: ProspectRowDto[];
}

export class ProviderSearchDto {
  @IsOptional() @IsString() @MaxLength(64) icpProfileId?: string;
  @IsOptional() @IsObject() query?: Record<string, unknown>;
}
