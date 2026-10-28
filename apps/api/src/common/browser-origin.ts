import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Public, state-changing endpoints called by the web app: refuse requests that a browser sends from
 * another site. Native apps send no Origin header and are unaffected.
 */
export function assertBrowserOrigin(req: Request, config: ConfigService) {
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  const allowed = String(config.get('WEB_ORIGIN') ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);

  if (typeof origin === 'string' && !allowed.includes(origin)) {
    throw new ForbiddenException('Cross-site authentication request blocked');
  }
  if (!origin && fetchSite === 'cross-site') {
    throw new ForbiddenException('Cross-site authentication request blocked');
  }
}
