import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { Public } from '../../common/public.decorator';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Public() @Get()
  health() { return { status: 'ok', service: 'klyvero-api', version: '2.5.0', timestamp: new Date().toISOString() }; }

  @Public() @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const redis = await this.redis.client.ping();
      if (redis !== 'PONG') throw new Error('Redis readiness failed');
      return { status: 'ready', database: 'ok', redis: 'ok', timestamp: new Date().toISOString() };
    } catch (error) {
      this.logger.error(`Readiness failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new ServiceUnavailableException({ status: 'not-ready' });
    }
  }
}
