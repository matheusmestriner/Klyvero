import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'dns/promises';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { isIP } from 'net';

export type ResolvedHost = { address: string; family: 4 | 6 };

@Injectable()
export class NetworkSafetyService {
  constructor(private readonly config: ConfigService) {}

  private allowPrivate(kind: 'webhook' | 'smtp') {
    if (this.config.get('NODE_ENV') === 'production') return false;
    return this.config.get(kind === 'webhook' ? 'ALLOW_PRIVATE_WEBHOOKS' : 'ALLOW_PRIVATE_SMTP') === 'true';
  }

  private isNonPublicIPv4(address: string) {
    const p = address.split('.').map(Number);
    if (p.length !== 4 || p.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return true;
    const [a, b, c] = p;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  private isNonPublicIPv6(address: string) {
    const value = address.toLowerCase().split('%')[0];
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (value.startsWith('2001:db8:')) return true;
    if (value.startsWith('2001:0:')) return true; // Teredo
    if (/^2001:(?:001[0-9a-f]|002[0-9a-f]):/.test(value)) return true; // ORCHID/ORCHIDv2
    if (value.startsWith('2002:')) return true; // 6to4 embeds IPv4 destinations
    if (value.startsWith('64:ff9b:')) return true; // well-known NAT64 prefix
    if (value.startsWith('ff')) return true;
    if (value.startsWith('::ffff:')) {
      const mapped = value.slice('::ffff:'.length);
      return isIP(mapped) === 4 ? this.isNonPublicIPv4(mapped) : true;
    }
    return false;
  }

  private isNonPublicIp(address: string) {
    const family = isIP(address);
    if (family === 4) return this.isNonPublicIPv4(address);
    if (family === 6) return this.isNonPublicIPv6(address);
    return true;
  }

  private rejectHostname(hostname: string) {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return (
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      h === 'metadata' ||
      h === 'metadata.google.internal'
    );
  }

  async resolveHost(hostname: string, kind: 'webhook' | 'smtp'): Promise<ResolvedHost> {
    const clean = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!clean || this.rejectHostname(clean)) {
      if (!this.allowPrivate(kind)) throw new BadRequestException(`${kind} destination is not publicly routable`);
    }

    const directFamily = isIP(clean);
    const rows = directFamily
      ? [{ address: clean, family: directFamily as 4 | 6 }]
      : await lookup(clean, { all: true, verbatim: true });

    if (!rows.length) throw new BadRequestException(`${kind} destination did not resolve`);
    if (!this.allowPrivate(kind) && rows.some((row) => this.isNonPublicIp(row.address))) {
      throw new BadRequestException(`${kind} destination resolves to a private, local, reserved, or metadata network`);
    }

    const row = rows[0];
    return { address: row.address, family: row.family as 4 | 6 };
  }

  async validateHttpUrl(input: string, kind: 'webhook' = 'webhook') {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (!['https:', 'http:'].includes(url.protocol)) throw new BadRequestException('Only HTTP(S) destinations are supported');
    if (url.username || url.password) throw new BadRequestException('Credentials in URL are not allowed');
    if (this.config.get('NODE_ENV') === 'production' && url.protocol !== 'https:') {
      throw new BadRequestException('HTTPS is required for outbound webhooks in production');
    }
    const resolved = await this.resolveHost(url.hostname, kind);
    return { url, resolved };
  }

  async postWebhook(
    input: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs = 12_000,
  ): Promise<{ status: number; ok: boolean; body: string }> {
    const { url, resolved } = await this.validateHttpUrl(input, 'webhook');
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BadRequestException('Invalid destination port');

    return await new Promise((resolve, reject) => {
      const req = requestFn(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port,
          method: 'POST',
          path: `${url.pathname}${url.search}`,
          headers: { ...headers, host: url.host, 'content-length': Buffer.byteLength(body).toString() },
          servername: url.hostname,
          lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            if (size < 4096) {
              const remaining = 4096 - size;
              chunks.push(Buffer.from(chunk).subarray(0, remaining));
              size += Math.min(chunk.length, remaining);
            }
          });
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            // Deliberately do not follow redirects: following an attacker-controlled
            // redirect can turn an otherwise safe webhook into SSRF.
            resolve({ status, ok: status >= 200 && status < 300, body: Buffer.concat(chunks).toString('utf8') });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('Webhook request timed out')));
      req.on('error', reject);
      req.end(body);
    });
  }
}
