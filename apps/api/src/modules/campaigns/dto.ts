import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CampaignChannel, MessageChannel } from '@prisma/client';

export class CreateCampaignDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsEnum(CampaignChannel) channel!: CampaignChannel;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsUUID() emailMailboxId?: string;
}

export class SequenceStepDto {
  @IsInt() @Min(1) @Max(1000) position!: number;
  @IsInt() @Min(0) @Max(525600) delayMinutes = 0;
  @IsEnum(MessageChannel) channel!: MessageChannel;
  @IsOptional() @IsString() @MaxLength(998) subject?: string;
  @IsString() @MinLength(1) @MaxLength(50000) body!: string;
}

export class EnrollDto {
  @IsArray() @ArrayMaxSize(5000) @IsUUID('4', { each: true }) leadIds!: string[];
}
