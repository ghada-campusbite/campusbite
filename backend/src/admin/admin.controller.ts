import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import * as argon2 from 'argon2';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.module';
import { CreateBreakDto, CreateCampusDto, CreateCanteenDto, CreateStaffDto, CreateUniversityDto, UpdateSettingsDto } from './admin.dto';
import { cairoDayStartUtc } from '../orders/time';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  // Platform settings. commissionPercent is a recorded setting only (default 0):
  // nothing is charged or collected by the app; it is shown in admin reports.
  @Get('settings')
  async settings() {
    const r = await this.prisma.platformSetting.findUnique({ where: { key: 'commissionPercent' } });
    return { commissionPercent: r ? Number(r.value) : 0 };
  }

  @Patch('settings')
  async setSettings(@Body() dto: UpdateSettingsDto) {
    await this.prisma.platformSetting.upsert({ where: { key: 'commissionPercent' }, update: { value: String(dto.commissionPercent) }, create: { key: 'commissionPercent', value: String(dto.commissionPercent) } });
    return { commissionPercent: dto.commissionPercent };
  }

  @Post('universities')
  university(@Body() dto: CreateUniversityDto) { return this.prisma.university.create({ data: dto }); }

  @Get('universities')
  universities() {
    return this.prisma.university.findMany({ orderBy: { name: 'asc' }, include: { breaks: true, campuses: { orderBy: { name: 'asc' } }, _count: { select: { canteens: true } } } });
  }

  @Post('campuses')
  async campus(@Body() dto: CreateCampusDto) {
    if (!(await this.prisma.university.findUnique({ where: { id: dto.universityId } }))) throw new NotFoundException('University not found');
    return this.prisma.campus.create({ data: dto });
  }

  @Post('canteens')
  async canteen(@Body() dto: CreateCanteenDto) {
    if (!(await this.prisma.university.findUnique({ where: { id: dto.universityId } }))) throw new NotFoundException('University not found');
    if (dto.campusId && !(await this.prisma.campus.findFirst({ where: { id: dto.campusId, universityId: dto.universityId } }))) throw new BadRequestException('Campus does not belong to this university');
    return this.prisma.canteen.create({ data: dto });
  }

  @Get('canteens')
  canteens() {
    return this.prisma.canteen.findMany({
      orderBy: { name: 'asc' },
      include: { university: { select: { name: true } }, campus: { select: { name: true } }, staff: { select: { id: true, name: true, email: true, suspendedAt: true } }, _count: { select: { items: true, orders: true } } },
    });
  }

  @Patch('canteens/:id')
  async updateCanteen(@Param('id', ParseUUIDPipe) id: string, @Body() dto: { active?: boolean }) {
    const r = await this.prisma.canteen.updateMany({ where: { id }, data: { active: dto.active } });
    if (!r.count) throw new NotFoundException();
    return { updated: r.count };
  }

  @Post('breaks')
  async classBreak(@Body() dto: CreateBreakDto) {
    if (dto.endMin <= dto.startMin) throw new BadRequestException('endMin must be after startMin');
    if (!(await this.prisma.university.findUnique({ where: { id: dto.universityId } }))) throw new NotFoundException('University not found');
    return this.prisma.classBreak.create({ data: dto });
  }

  @Post('staff')
  async staff(@Body() dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    if (!(await this.prisma.canteen.findUnique({ where: { id: dto.canteenId } }))) throw new NotFoundException('Canteen not found');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const u = await this.prisma.user.create({
      data: { email, name: dto.name, role: 'CANTEEN_STAFF', emailVerifiedAt: new Date(), canteenId: dto.canteenId, passwordHash: await argon2.hash(dto.password) },
    });
    return { id: u.id, email: u.email, canteenId: u.canteenId };
  }

  @Get('students')
  students(@Query('q') q?: string) {
    return this.prisma.user.findMany({
      where: { role: 'STUDENT', ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, email: true, name: true, emailVerifiedAt: true, suspendedAt: true, createdAt: true, _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Patch('users/:id/suspend')
  async suspend(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    if (u.role === 'ADMIN') throw new BadRequestException('Cannot suspend an admin');
    // clearing the refresh token signs the user out everywhere
    await this.prisma.user.update({ where: { id }, data: { suspendedAt: new Date(), refreshTokenHash: null } });
    return { ok: true };
  }

  @Patch('users/:id/unsuspend')
  async unsuspend(@Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.user.updateMany({ where: { id }, data: { suspendedAt: null } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  @Get('orders')
  async orders(@Query('status') status?: string, @Query('canteenId') canteenId?: string) {
    const s = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'].includes(String(status)) ? (status as any) : undefined;
    const rows = await this.prisma.order.findMany({
      where: { ...(s ? { status: s } : {}), ...(canteenId ? { canteenId } : {}) },
      include: {
        user: { select: { name: true, email: true } },
        canteen: { select: { name: true } },
        items: { include: { menuItem: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    // the pickup code belongs to the student and the counter handover, not to reports
    return rows.map(({ pickupCodeEnc, codeAttempts, codeLockedUntil, ...o }) => o);
  }

  @Get('analytics')
  async analytics() {
    const from = cairoDayStartUtc(new Date());
    const [students, staff, canteens, universities, ordersToday, todayRows, recent] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.user.count({ where: { role: 'CANTEEN_STAFF' } }),
      this.prisma.canteen.count(),
      this.prisma.university.count(),
      this.prisma.order.count({ where: { createdAt: { gte: from } } }),
      this.prisma.order.findMany({ where: { createdAt: { gte: from }, status: 'COMPLETED' }, select: { totalCents: true } }),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      students, staff, canteens, universities, ordersToday,
      // completed pickups only: pending/preparing order value is not realized sales
      collectedTodayCents: todayRows.reduce((s, o) => s + o.totalCents, 0),
      byStatus: Object.fromEntries(recent.map((r) => [r.status, r._count])),
    };
  }
}
