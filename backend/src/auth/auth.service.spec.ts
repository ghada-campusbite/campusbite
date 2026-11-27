import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

process.env.JWT_REFRESH_SECRET = 'r'.repeat(48);

function setup(user: any, token: any = null, bumped = { count: 1 }) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockReturnValue('u') },
    pushDevice: { deleteMany: jest.fn().mockReturnValue('d') },
    order: { updateMany: jest.fn().mockReturnValue('o') },
    emailToken: {
      findFirst: jest.fn().mockResolvedValue(token), updateMany: jest.fn().mockResolvedValue(bumped),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  return { prisma, mail, svc: new AuthService(prisma, {} as any, mail as any) };
}

describe('AuthService.deleteAccount', () => {
  it('rejects a wrong password and changes nothing', async () => {
    const { prisma, svc } = setup({ id: 'u1', role: 'STUDENT', passwordHash: await argon2.hash('correct-password') });
    await expect(svc.deleteAccount('u1', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses staff/admin accounts', async () => {
    const { svc } = setup({ id: 's1', role: 'CANTEEN_STAFF', passwordHash: await argon2.hash('pw-pw-pw-pw') });
    await expect(svc.deleteAccount('s1', 'pw-pw-pw-pw')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('anonymises the student, drops devices and cancels open orders', async () => {
    const { prisma, svc } = setup({ id: 'u1', role: 'STUDENT', passwordHash: await argon2.hash('correct-password') });
    await svc.deleteAccount('u1', 'correct-password');
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.email).toBe('deleted-u1@deleted.invalid');
    expect(data.refreshTokenHash).toBeNull();
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('AuthService password reset / email verification', () => {
  const user = { id: 'u1', email: 'a@b.c', role: 'STUDENT', emailVerifiedAt: null };
  const tokenFor = (svc: any, code: string, expiresAt = new Date(Date.now() + 60_000)) =>
    ({ id: 't1', codeHash: svc.codeHash('u1', 'RESET', code), expiresAt });
  const dto = (code: string) => ({ email: 'a@b.c', code, newPassword: 'a-brand-new-password' });

  it('resets with the right code and signs out every device', async () => {
    const { prisma, svc } = setup(user);
    prisma.emailToken.findFirst.mockResolvedValue(tokenFor(svc, '123456'));
    await svc.reset(dto('123456'));
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.refreshTokenHash).toBeNull();
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await argon2.verify(data.passwordHash, 'a-brand-new-password')).toBe(true);
    expect(prisma.emailToken.deleteMany).toHaveBeenCalled(); // code is single-use
  });

  it('rejects a wrong code', async () => {
    const { prisma, svc } = setup(user);
    prisma.emailToken.findFirst.mockResolvedValue(tokenFor(svc, '123456'));
    await expect(svc.reset(dto('000000'))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects the right code once the 5 attempts are used up', async () => {
    const { prisma, svc } = setup(user, null, { count: 0 });
    prisma.emailToken.findFirst.mockResolvedValue(tokenFor(svc, '123456'));
    await expect(svc.reset(dto('123456'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired code', async () => {
    const { prisma, svc } = setup(user);
    prisma.emailToken.findFirst.mockResolvedValue(tokenFor(svc, '123456', new Date(Date.now() - 1000)));
    await expect(svc.reset(dto('123456'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forgot answers the same and sends nothing for unknown emails', async () => {
    const { mail, svc } = setup(null);
    expect(await svc.forgot({ email: 'nobody@x.y' })).toEqual({ ok: true });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('respects the 60s cooldown between codes', async () => {
    const { prisma, mail, svc } = setup(user);
    prisma.emailToken.findFirst.mockResolvedValue({ createdAt: new Date() });
    await (svc as any).issueCode(user, 'RESET');
    expect(mail.send).not.toHaveBeenCalled();
  });
});
