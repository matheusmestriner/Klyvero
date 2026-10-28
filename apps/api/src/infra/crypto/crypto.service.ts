import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const raw = this.config.get<string>('SECRET_ENCRYPTION_KEY');
    if (!raw) throw new InternalServerErrorException('SECRET_ENCRYPTION_KEY is not configured');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new InternalServerErrorException('SECRET_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
    return key;
  }

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(payload: { ciphertext: string; iv: string; authTag: string }) {
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
