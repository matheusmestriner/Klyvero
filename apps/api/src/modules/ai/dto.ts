import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
export class RunAgentDto { @IsString() @MinLength(1) input!: string; }
export class ProspectAiDto { @IsUUID() prospectId!: string; @IsOptional() @IsString() offer?: string; }
export class ReplyAiDto { @IsString() @MinLength(1) message!: string; @IsOptional() @IsString() context?: string; }
