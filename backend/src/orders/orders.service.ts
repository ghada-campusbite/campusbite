import { BadRequestException, ConflictException, HttpException, HttpStatus, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { CreateOrderDto, UpdateCanteenDto } from './orders.dto';
import { PushService } from '../push/push.service';
import { decryptPickupCode, encryptPickupCode } from './pickup-code';
import { randomInt } from 'crypto';
import { cairoDayStartUtc, cairoMinutes } from './time';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};
const ACTIVE: OrderStatus[] = ['PENDING', 'PREPARING', 'READY'];
const SLOT_FULL = 'المعاد ده اتملى، اختار معاد تاني';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const canteen = await this.prisma.canteen.findUnique({ where: { id: dto.canteenId } });
    if (!canteen || !canteen.active) throw new NotFoundException('Canteen not found');

    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, suspendedAt: true } });
    if (me?.suspendedAt) throw new ForbiddenException('حسابك موقوف، كلم إدارة التطبيق');
    if (!me?.emailVerifiedAt) throw new ForbiddenException('فعّل إيميلك الأول');

    // stops one account from flooding a canteen with fake orders
    const open = await this.prisma.order.count({ where: { userId, status: { in: ACTIVE } } });
    if (open >= 3) throw new BadRequestException('عندك 3 طلبات شغالة، استنى لما يخلصوا');

    const pickupAt = new Date(dto.pickupAt);
    const now = Date.now();
    if (pickupAt.getTime() < now + canteen.prepMinutes * 60_000) throw new BadRequestException('وقت الاستلام قريب جدًا عن وقت التحضير');
    if (pickupAt.getTime() > now + 24 * 3_600_000) throw new BadRequestException('وقت الاستلام بعيد جدًا');

    const m = cairoMinutes(pickupAt);
    if (!this.withinHours(canteen, m)) throw new BadRequestException('وقت الاستلام خارج مواعيد المطعم');
    const inBreak = await this.prisma.classBreak.findFirst({
      where: { universityId: canteen.universityId, startMin: { lte: m }, endMin: { gte: m } },
    });
    if (!inBreak) throw new BadRequestException('وقت الاستلام لازم يكون داخل فترة بريك');

    const ids = dto.items.map((i) => i.menuItemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate items');
    const menu = await this.prisma.menuItem.findMany({ where: { id: { in: ids }, canteenId: canteen.id, available: true, archived: false } });
    if (menu.length !== ids.length) throw new BadRequestException('Item unavailable');

    // prices always come from the DB, never from the client
    const price = new Map(menu.map((x) => [x.id, x.offerPriceCents != null && x.offerPriceCents < x.priceCents ? x.offerPriceCents : x.priceCents]));
    const totalCents = dto.items.reduce((s, i) => s + price.get(i.menuItemId)! * i.quantity, 0);

    // Serializable: two concurrent orders for the same slot both count first, so one of them
    // aborts with a serialization failure instead of overbooking the slot.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const booked = await tx.order.count({ where: { canteenId: canteen.id, pickupAt, status: { in: ACTIVE } } });
        if (booked >= canteen.maxOrdersPerSlot) throw new ConflictException(SLOT_FULL);
        const code = String(randomInt(1000, 10000));
        const order = await tx.order.create({
          data: {
            userId, canteenId: canteen.id, pickupAt, totalCents, pickupCodeEnc: encryptPickupCode(code),
            items: { create: dto.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, unitPriceCents: price.get(i.menuItemId)! })) },
          },
          include: { items: true },
        });
        // the student sees their code in the API; only the encrypted value is stored
        const { pickupCodeEnc, codeAttempts, codeLockedUntil, ...rest } = order;
        return { ...rest, pickupCode: code };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e: any) {
      if (e?.code === 'P2034') throw new ConflictException(SLOT_FULL); // serialization conflict = slot race lost
      throw e;
    }
  }

  private withinHours(canteen: { openMin: number | null; closeMin: number | null }, m: number) {
    if (canteen.openMin == null || canteen.closeMin == null) return true;
    return m >= canteen.openMin && m <= canteen.closeMin;
  }

  async slots(canteenId: string) {
    const canteen = await this.prisma.canteen.findUnique({ where: { id: canteenId } });
    if (!canteen || !canteen.active) throw new NotFoundException('Canteen not found');
    const breaks = await this.prisma.classBreak.findMany({ where: { universityId: canteen.universityId } });
    const STEP = 5 * 60_000;
    const now = Date.now();
    // +2 min buffer so a slot is still valid by the time the order is submitted
    const first = Math.ceil((now + canteen.prepMinutes * 60_000 + 120_000) / STEP) * STEP;
    const out: string[] = [];
    for (let t = first; t < now + 24 * 3_600_000 - STEP && out.length < 40; t += STEP) {
      const m = cairoMinutes(new Date(t));
      if (!this.withinHours(canteen, m)) continue;
      if (!breaks.some((b) => m >= b.startMin && m <= b.endMin)) continue;
      // skip slots that already hit the canteen's capacity
      const booked = await this.prisma.order.count({ where: { canteenId, pickupAt: new Date(t), status: { in: ACTIVE } } });
      if (booked < canteen.maxOrdersPerSlot) out.push(new Date(t).toISOString());
    }
    return out;
  }

  async mine(userId: string) {
    const rows = await this.prisma.order.findMany({ where: { userId }, include: { items: { include: { menuItem: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    // decrypt the student's own code for display; the encrypted column never leaves the API
    return rows.map(({ pickupCodeEnc, codeAttempts, codeLockedUntil, ...o }) => ({ ...o, pickupCode: pickupCodeEnc ? decryptPickupCode(pickupCodeEnc) : undefined }));
  }

  async forCanteen(canteenId: string | null) {
    if (!canteenId) throw new NotFoundException();
    // the pickup code is only shown to the student; staff must ask for it at the counter
    const rows = await this.prisma.order.findMany({
      where: { canteenId, status: { in: ACTIVE } },
      include: { items: { include: { menuItem: { select: { name: true } } } } }, orderBy: { pickupAt: 'asc' }, take: 200,
    });
    return rows.map(({ pickupCodeEnc, codeAttempts, codeLockedUntil, ...o }) => o);
  }

  async updateStatus(canteenId: string | null, id: string, status: OrderStatus, code?: string) {
    const order = canteenId ? await this.prisma.order.findFirst({ where: { id, canteenId } }) : null;
    if (!order) throw new NotFoundException();
    if (!TRANSITIONS[order.status].includes(status)) throw new ConflictException('Invalid status transition');
    if (status === 'COMPLETED' && order.pickupCodeEnc) {
      if (order.codeLockedUntil && order.codeLockedUntil > new Date()) throw new HttpException('محاولات كتير غلط، جرّب بعد شوية', HttpStatus.TOO_MANY_REQUESTS);
      if (decryptPickupCode(order.pickupCodeEnc) !== (code ?? '').trim()) {
        const attempts = order.codeAttempts + 1;
        await this.prisma.order.update({ where: { id }, data: attempts >= 5 ? { codeAttempts: 0, codeLockedUntil: new Date(Date.now() + 10 * 60_000) } : { codeAttempts: attempts } });
        throw new BadRequestException('كود الاستلام غلط، اطلب من الطالب الكود اللي ظاهر في طلبه');
      }
    }
    // conditional on the status we just read: if another request moved the order meanwhile, this matches nothing
    const r = await this.prisma.order.updateMany({
      where: { id, canteenId: order.canteenId, status: order.status },
      data: { status, ...(status === 'CANCELLED' ? { cancelledBy: 'STAFF' } : {}) },
    });
    if (!r.count) throw new ConflictException('الطلب اتغيّر من حد تاني، حدّث الصفحة');
    this.push.notifyStatus(order.userId, id, status);
    return { id, status };
  }

  async cancel(userId: string, id: string) {
    const r = await this.prisma.order.updateMany({ where: { id, userId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledBy: 'STUDENT' } });
    if (!r.count) throw new NotFoundException('Order not found or can no longer be cancelled');
    return { ok: true };
  }

  myCanteen(canteenId: string | null) {
    if (!canteenId) throw new NotFoundException();
    return this.prisma.canteen.findUnique({
      where: { id: canteenId },
      select: { id: true, name: true, prepMinutes: true, openMin: true, closeMin: true, maxOrdersPerSlot: true, university: { select: { name: true } } },
    });
  }

  async updateCanteen(canteenId: string | null, dto: UpdateCanteenDto) {
    if (!canteenId) throw new NotFoundException();
    if (dto.openMin != null && dto.closeMin != null && dto.closeMin <= dto.openMin) {
      throw new BadRequestException('وقت القفل لازم يكون بعد وقت الفتح');
    }
    await this.prisma.canteen.updateMany({ where: { id: canteenId }, data: dto });
    return this.myCanteen(canteenId);
  }

  async dailySummary(canteenId: string | null) {
    if (!canteenId) throw new NotFoundException();
    // "today" in Africa/Cairo
    const from = cairoDayStartUtc(new Date());
    const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', dateStyle: 'short' }).format(new Date());
    const orders = await this.prisma.order.findMany({
      where: { canteenId, createdAt: { gte: from } },
      select: { status: true, totalCents: true, items: { select: { quantity: true, menuItem: { select: { name: true } } } } },
    });
    const done = orders.filter((o) => o.status !== 'CANCELLED');
    const collected = orders.filter((o) => o.status === 'COMPLETED');
    const top = new Map<string, number>();
    for (const o of done) for (const i of o.items) top.set(i.menuItem.name, (top.get(i.menuItem.name) ?? 0) + i.quantity);
    return {
      date: dayStr,
      orders: orders.length,
      cancelled: orders.length - done.length,
      // collected = money handed over (COMPLETED); inProgress = accepted orders not yet picked up
      collectedCents: collected.reduce((s, o) => s + o.totalCents, 0),
      inProgressCents: done.filter((o) => o.status !== 'COMPLETED').reduce((s, o) => s + o.totalCents, 0),
      topItems: [...top.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    };
  }
}
