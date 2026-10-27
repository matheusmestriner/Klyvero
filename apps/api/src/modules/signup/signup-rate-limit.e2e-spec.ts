import type { NestExpressApplication } from '@nestjs/platform-express';
import { Api, bootApp } from '../../testing/e2e';

// The shared e2e environment raises every rate limit so suites never trip over each other.
// Here the "auth" group is set low to prove the public sign-up endpoints are inside it.
describe('sign-up rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;

  beforeAll(async () => {
    const booted = await bootApp({ AUTH_EDGE_RATE_LIMIT_MAX: '5', EDGE_RATE_LIMIT_MAX: '100000' });
    app = booted.app;
    api = new Api(booted.base);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('throttles guesses at invite tokens and sign-up attempts per client', async () => {
    const token = 'x'.repeat(43);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      statuses.push((await api.call('POST', '/signup/invite/check', { token })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
    // The same bucket covers the sign-up itself, not just the check.
    expect((await api.call('POST', '/signup', { token })).status).toBe(429);
  });
});
