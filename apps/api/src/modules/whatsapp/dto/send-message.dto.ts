import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class SendWhatsappMessageDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) sessionId!: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{6,32}$/) to!: string;
  @IsString() @MinLength(1) @MaxLength(10000) text!: string;
}
