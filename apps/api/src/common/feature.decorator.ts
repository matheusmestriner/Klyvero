import { SetMetadata } from '@nestjs/common';
export const FEATURE_KEY='featureKey';
export const Feature=(key:string)=>SetMetadata(FEATURE_KEY,key);
