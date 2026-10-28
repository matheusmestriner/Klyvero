import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export class CreateInviteDto {
  /** Who the invite is for, e.g. the client company name. */
  @IsString() @MinLength(2) @MaxLength(120) label!: string;
  /** When given, only this e-mail can use the invite. */
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) validityDays?: number;
}

export class InviteTokenDto {
  @IsString() @MinLength(20) @MaxLength(100) token!: string;
}

export class SignupDto extends InviteTokenDto {
  @IsString() @MinLength(2) @MaxLength(120) companyName!: string;
  /** CPF or CNPJ, with or without punctuation. */
  @IsString() @MinLength(11) @MaxLength(18) document!: string;
  @IsString() @MinLength(2) @MaxLength(120) responsibleName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  /** Workspace identifier used to sign in. */
  @IsString() @MinLength(3) @MaxLength(40) @Matches(SLUG) slug!: string;
  /** White label: name shown instead of the platform name. */
  @IsOptional() @IsString() @MaxLength(80) productName?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) primaryColor?: string;
}
