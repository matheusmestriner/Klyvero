import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MessageChannel } from '@prisma/client';

export class ThreadsQueryDto {
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel;
  /** Pagination cursor: lastMessageAt of the last thread already received. */
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) take?: number;
}

export class MessagesQueryDto {
  /** Pagination cursor: createdAt of the oldest message already received. */
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) take?: number;
}

export class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(10_000) text!: string;
  /** E-mail only. Defaults to "Re: <thread subject>". */
  @IsOptional() @IsString() @MaxLength(998) subject?: string;
}
