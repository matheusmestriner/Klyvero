import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  it('encrypts and decrypts without exposing plaintext', () => {
    const key = randomBytes(32).toString('base64');
    const config = new ConfigService({ SECRET_ENCRYPTION_KEY: key });
    const service = new CryptoService(config);

    const encrypted = service.encrypt('smtp-password-example');

    expect(encrypted.ciphertext).not.toContain('smtp-password-example');
    expect(service.decrypt(encrypted)).toBe('smtp-password-example');
  });

  it('rejects an invalid key size', () => {
    const config = new ConfigService({
      SECRET_ENCRYPTION_KEY: Buffer.from('too-short').toString('base64'),
    });
    const service = new CryptoService(config);

    expect(() => service.encrypt('secret')).toThrow(
      'SECRET_ENCRYPTION_KEY must be a base64 encoded 32-byte key',
    );
  });
});
