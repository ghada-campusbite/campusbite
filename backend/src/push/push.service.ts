import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const MESSAGES: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  PREPARING: { title: 'طلبك بيتحضّر 👨‍🍳', body: 'المطعم بدأ يجهّز طلبك' },
  READY: { title: 'طلبك جاهز! 🍔', body: 'تعالى استلمه من المطعم' },
  CANCELLED: { title: 'الطلب اتلغى', body: 'المطعم ألغى طلبك، افتح التطبيق للتفاصيل' },
};

@Injectable()
export class PushService {
  private log = new Logger(PushService.name);
  constructor(private prisma: PrismaService) {}

  // fire-and-forget: a push failure must never break an order status change
  notifyStatus(userId: string, orderId: string, status: OrderStatus) {
    const msg = MESSAGES[status];
    if (!msg) return;
    this.send(userId, msg.title, msg.body, { orderId, status }).catch((e) => this.log.warn(`push failed: ${e?.message ?? e}`));
  }

  private async send(userId: string, title: string, body: string, data: Record<string, string>) {
    const devices = await this.prisma.pushDevice.findMany({ where: { userId } });
    if (!devices.length) return;
    const res = await fetch(EXPO_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(devices.map((d) => ({ to: d.token, title, body, data, sound: 'default', channelId: 'orders', priority: 'high' }))),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) { this.log.warn(`expo push http ${res.status}`); return; }
    const tickets: any[] = (await res.json()).data ?? [];
    // drop tokens of uninstalled apps
    const dead = tickets.map((t, i) => (t?.details?.error === 'DeviceNotRegistered' ? devices[i].token : null)).filter((t): t is string => !!t);
    if (dead.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
  }
}
