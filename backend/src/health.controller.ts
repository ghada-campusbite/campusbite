import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.module';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get()
  async check() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException(); }
  }
}
