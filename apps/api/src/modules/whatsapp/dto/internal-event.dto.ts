import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class WhatsappInternalEventDto {
  @IsIn(['message', 'connected', 'logged_out']) type!: 'message' | 'connected' | 'logged_out';
  @IsUUID() tenantId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) sessionId!: string;
  @IsOptional() @IsString() @MaxLength(200) id?: string;
  @IsOptional() @IsString() @MaxLength(200) from?: string;
  @IsOptional() @IsString() @MaxLength(200) chat?: string;
  @IsOptional() @IsString() @MaxLength(200) pushName?: string;
  @IsOptional() @IsString() @MaxLength(80) timestamp?: string;
  @IsOptional() @IsString() @MaxLength(10000) text?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
