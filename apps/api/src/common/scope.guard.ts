import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from './feature.decorator';
import { AuthUser } from './auth.types';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user || user.authType !== 'API_KEY') return true;
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    const scopes = user.scopes ?? [];
    if (scopes.includes('*') || (feature && scopes.includes(feature))) return true;
    throw new ForbiddenException(`API key does not include required scope '${feature ?? 'protected'}'`);
  }
}
