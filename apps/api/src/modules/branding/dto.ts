import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ThemeMode } from '@prisma/client';

const httpUrl = { protocols: ['http', 'https'], require_protocol: true };

export class BrandingDto {
  @IsOptional() @IsBoolean() inheritFromParent?: boolean;
  @IsOptional() @IsString() @MaxLength(120) productName?: string;
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) logoUrl?: string;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) compactLogoUrl?: string;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) faviconUrl?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
  @IsOptional() @IsHexColor() accentColor?: string;
  @IsOptional() @IsHexColor() backgroundColor?: string;
  @IsOptional() @IsString() @MaxLength(160) fontFamily?: string;
  @IsOptional() @IsEnum(ThemeMode) themeMode?: ThemeMode;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) loginBackgroundUrl?: string;
  @IsOptional() @IsString() @MaxLength(160) loginTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) loginSubtitle?: string;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) supportUrl?: string;
  @IsOptional() @IsEmail() @MaxLength(254) supportEmail?: string;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) privacyUrl?: string;
  @IsOptional() @IsUrl(httpUrl) @MaxLength(2048) termsUrl?: string;
  @IsOptional() @IsString() @MaxLength(160) senderName?: string;
}
