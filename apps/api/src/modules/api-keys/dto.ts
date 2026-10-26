import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateApiKeyDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsArray() @ArrayMaxSize(32) @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}
