import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { cairoMinutes } from './time';

const CANTEEN = { id: 'c1', universityId: 'u1', prepMinutes: 10, active: true, openMin: null, closeMin: null, maxOrdersPerSlot: 10 };
const ITEMS = [{ id: 'i1', priceCents: 1500 }, { id: 'i2', priceCents: 2000 }];

function setup(overrides: Record<string, any> = {}) {
  const prisma: any = {
    canteen: { findUnique: jest.fn().mockResolvedValue(CANTEEN) },
    user: { findUnique: jest.fn().mockResolvedValue({ emailVerifiedAt: new Date() }) },
    classBreak: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
    menuItem: { findMany: jest.fn().mockResolvedValue(ITEMS) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(async (a) => a.data),
      findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
    $transaction: jest.fn(), // wired up after the object literal below
    ...overrides,
  };
  // interactive transactions just run the callback against the same mock
  prisma.$transaction.mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb)));
  const push = { notifyStatus: jest.fn() };
  return { prisma, push, svc: new OrdersService(prisma, push as any) };
}

describe('OrdersService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-01T07:00:00Z')); // 09:00 Cairo (UTC+2)
  });
  afterEach(() => jest.useRealTimers());

  const base = { canteenId: 'c1', items: [{ menuItemId: 'i1', quantity: 2 }, { menuItemId: 'i2', quantity: 1 }] };

  it('computes total from DB prices and checks the break in Cairo time', async () => {
    const { prisma, svc } = setup();
    const res: any = await svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' }); // 10:15 Cairo
    expect(res.totalCents).toBe(5000);
    expect(prisma.classBreak.findFirst).toHaveBeenCalledWith({
      where: { universityId: 'u1', startMin: { lte: 615 }, endMin: { gte: 615 } },
    });
  });

  it('rejects pickup outside any break', async () => {
    const { svc } = setup({ classBreak: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T09:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects pickup sooner than prep time', async () => {
    const { svc } = setup();
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T07:05:00Z' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unavailable or foreign menu items', async () => {
    const { svc } = setup({ menuItem: { findMany: jest.fn().mockResolvedValue([ITEMS[0]]) } });
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate items', async () => {
    const { svc } = setup();
    const dup = { ...base, items: [{ menuItemId: 'i1', quantity: 1 }, { menuItemId: 'i1', quantity: 1 }], pickupAt: '2026-12-01T08:15:00Z' };
    await expect(svc.create('u', dup)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks invalid status transitions', async () => {
    const { prisma, svc } = setup();
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'COMPLETED' });
    await expect(svc.updateStatus('c1', 'o1', 'PREPARING')).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides orders of other canteens', async () => {
    const { prisma, svc } = setup();
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(svc.updateStatus('c1', 'o1', 'PREPARING')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only lets owners cancel pending orders', async () => {
    const { prisma, svc } = setup();
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.cancel('u', 'o1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only offers slots inside break windows and after prep time', async () => {
    const { svc } = setup({ classBreak: { findMany: jest.fn().mockResolvedValue([{ startMin: 600, endMin: 630 }]) } });
    const slots = await svc.slots('c1');
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const m = cairoMinutes(new Date(s));
      expect(m).toBeGreaterThanOrEqual(600);
      expect(m).toBeLessThanOrEqual(630);
      expect(new Date(s).getTime()).toBeGreaterThanOrEqual(Date.now() + 10 * 60_000);
    }
  });

  it('notifies the student when staff moves the order to READY', async () => {
    const { prisma, push, svc } = setup();
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PREPARING', userId: 'u9' });
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    await svc.updateStatus('c1', 'o1', 'READY');
    expect(push.notifyStatus).toHaveBeenCalledWith('u9', 'o1', 'READY');
  });

  it('rejects a status change when another request already moved the order', async () => {
    const { prisma, push, svc } = setup();
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PENDING', userId: 'u9', canteenId: 'c1' });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.updateStatus('c1', 'o1', 'PREPARING')).rejects.toBeInstanceOf(ConflictException);
    expect(push.notifyStatus).not.toHaveBeenCalled();
  });

  it('caps open orders per student at 3', async () => {
    const { prisma, svc } = setup();
    prisma.order.count.mockResolvedValue(3);
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects the order when the pickup slot is full', async () => {
    const { prisma, svc } = setup();
    prisma.order.count.mockReset().mockResolvedValueOnce(0).mockResolvedValueOnce(10); // 3-open check passes, capacity check fails
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects orders for an inactive canteen', async () => {
    const { svc } = setup({ canteen: { findUnique: jest.fn().mockResolvedValue({ ...CANTEEN, active: false }) } });
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks a suspended student from ordering', async () => {
    const { prisma, svc } = setup();
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date(), suspendedAt: new Date() });
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks ordering until the email is verified', async () => {
    const { prisma, svc } = setup();
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });
    await expect(svc.create('u', { ...base, pickupAt: '2026-12-01T08:15:00Z' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
