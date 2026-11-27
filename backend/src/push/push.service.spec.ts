import { PushService } from './push.service';

describe('PushService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('removes tokens Expo reports as unregistered', async () => {
    const prisma: any = {
      pushDevice: {
        findMany: jest.fn().mockResolvedValue([{ token: 'ExponentPushToken[aaaaaaaaaa]' }, { token: 'ExponentPushToken[bbbbbbbbbb]' }]),
        deleteMany: jest.fn(),
      },
    };
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    });
    await (new PushService(prisma) as any).send('u1', 't', 'b', {});
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['ExponentPushToken[bbbbbbbbbb]'] } } });
  });

  it('does nothing when the user has no devices', async () => {
    const prisma: any = { pushDevice: { findMany: jest.fn().mockResolvedValue([]) } };
    (global as any).fetch = jest.fn();
    await (new PushService(prisma) as any).send('u1', 't', 'b', {});
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});
