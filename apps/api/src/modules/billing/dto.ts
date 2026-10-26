import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
export class PlanDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsNumber() @Min(0) monthlyPrice!: number;
  @IsOptional() @IsString() stripePriceId?: string;
  @IsOptional() @IsObject() limits?: Record<string, number>;
  @IsOptional() @IsObject() features?: Record<string, boolean>;
}
export class CheckoutDto { @IsString() planId!: string; }
