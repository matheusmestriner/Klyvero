// End-to-end tests: real Postgres (TEST_DATABASE_URL or DATABASE_URL), real HTTP, fake SMTP and WhatsApp bridge.
// Types are checked by `nest build`; here ts-jest only transpiles, because type-checking the whole
// application graph (googleapis alone is huge) runs out of memory.
module.exports = {
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.e2e-spec\\.ts$',
  testTimeout: 60000,
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
