import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/) tenantSlug!: string;
}

export class BootstrapDto {
  @IsString() @MinLength(32) @MaxLength(256) bootstrapToken!: string;
  @IsString() @MinLength(2) @MaxLength(120) tenantName!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/) tenantSlug!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

const TENANT_SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export class ForgotPasswordDto {
  @IsString() @MinLength(2) @MaxLength(80) @Matches(TENANT_SLUG) tenantSlug!: string;
  @IsEmail() @MaxLength(254) email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(32) @MaxLength(256) token!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class OwnerRecoveryDto {
  @IsString() @MinLength(2) @MaxLength(80) @Matches(TENANT_SLUG) tenantSlug!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(16) @MaxLength(256) recoveryCode!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

/** Native apps keep the refresh token in the device's secure storage and send it in the body. */
export class RefreshDto {
  @IsOptional() @IsString() @MaxLength(256) refreshToken?: string;
}
