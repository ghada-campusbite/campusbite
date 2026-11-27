import { Body, Controller, Delete, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Matches } from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.module';

class DeviceDto {
  @Matches(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,80}\]$/) token: string;
}

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT')
export class DevicesController {
  constructor(private prisma: PrismaService) {}

  @Post() @HttpCode(200)
  async register(@Req() req: any, @Body() dto: DeviceDto) {
    // upsert by token: a phone that switches accounts is re-assigned to the new user
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token }, update: { userId: req.user.sub }, create: { token: dto.token, userId: req.user.sub },
    });
    return { ok: true };
  }

  @Delete() @HttpCode(200)
  async unregister(@Req() req: any, @Body() dto: DeviceDto) {
    await this.prisma.pushDevice.deleteMany({ where: { token: dto.token, userId: req.user.sub } });
    return { ok: true };
  }
}
