import { ArrayMaxSize, IsArray, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class WebhookDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) @MaxLength(2048) url!: string;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) events!: string[];
}
