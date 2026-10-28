import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class DealDto {
  @IsUUID() pipelineId!: string;
  @IsUUID() stageId!: string;
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsDateString() expectedCloseAt?: string;
  @IsOptional() @IsString() @MaxLength(10_000) notes?: string;
}

export class MoveDealDto {
  @IsUUID() stageId!: string;
}
