import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const EXPO_TOKEN = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{8,}\]$/;

export class RegisterDeviceDto {
  @IsString() @Matches(EXPO_TOKEN) token!: string;
  @IsIn(['ios', 'android']) platform!: 'ios' | 'android';
  @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
}

export class UnregisterDeviceDto {
  @IsString() @Matches(EXPO_TOKEN) token!: string;
}
