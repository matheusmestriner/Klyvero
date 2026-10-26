import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class WhatsappConnectDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) sessionId!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
}
