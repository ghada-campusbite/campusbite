import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { MailService } from '../mail/mail.service';
import { ForgotDto, LoginDto, RegisterDto, ResetDto } from './auth.dto';

const DUMMY_HASH = argon2.hash('not-a-real-password');

@Injectable()
export class AuthService {
  private log = new Logger(AuthService.name);
  constructor(private prisma: PrismaService, private jwt: JwtService, private mail: MailService) {}

  private async issue(u: { id: string; role: Role; canteenId: string | null }) {
    const accessToken = await this.jwt.signAsync(
      { sub: u.id, role: u.role, canteenId: u.canteenId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: u.id },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d', algorithm: 'HS256' },
    );
    await this.prisma.user.update({
      where: { id: u.id },
      data: { refreshTokenHash: await argon2.hash(refreshToken) },
    });
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    // role is always STUDENT here; staff/admin are created by an admin only
    const user = await this.prisma.user.create({
      data: { email, name: dto.name, passwordHash: await argon2.hash(dto.password) },
    });
    // best effort: a mail outage must not block sign-up (the app has a "resend code" button)
    this.issueCode(user, 'VERIFY').catch((e) => this.log.warn(`verify mail failed: ${e?.message ?? e}`));
    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // always run exactly one argon2 verify so response time doesn't reveal whether the email exists
    const ok = await argon2.verify(user?.passwordHash ?? (await DUMMY_HASH), dto.password);
    if (!user || !ok) {
      throw new UnauthorizedException('الإيميل أو الباسورد غلط');
    }
    if (user.suspendedAt) throw new ForbiddenException('حسابك موقوف، كلم إدارة التطبيق');
    return this.issue(user);
  }

  async refresh(token: string) {
    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET, algorithms: ['HS256'] }));
    } catch { throw new UnauthorizedException(); }
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    // rotation: a reused/old refresh token fails the hash check and is rejected
    if (!user?.refreshTokenHash || !(await argon2.verify(user.refreshTokenHash, token))) {
      throw new UnauthorizedException();
    }
    return this.issue(user);
  }

  private codeHash(userId: string, type: string, code: string) {
    return createHmac('sha256', process.env.JWT_REFRESH_SECRET!).update(`${userId}:${type}:${code}`).digest('hex');
  }

  private async issueCode(user: { id: string; email: string }, type: 'VERIFY' | 'RESET') {
    const last = await this.prisma.emailToken.findFirst({ where: { userId: user.id, type } });
    if (last && Date.now() - last.createdAt.getTime() < 60_000) return; // cooldown: no email bombing
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { userId: user.id, type } }),
      this.prisma.emailToken.create({
        data: { userId: user.id, type, codeHash: this.codeHash(user.id, type, code), expiresAt: new Date(Date.now() + 15 * 60_000) },
      }),
    ]);
    const [subject, line] = type === 'VERIFY'
      ? ['كود تأكيد الإيميل — CampusBite', 'كود تأكيد إيميلك:']
      : ['كود استعادة الباسورد — CampusBite', 'كود استعادة الباسورد:'];
    await this.mail.send(user.email, subject, `${line} ${code}\nالكود صالح لمدة 15 دقيقة. لو ماطلبتش ده، تجاهل الرسالة.`);
  }

  // The guess counter is bumped atomically BEFORE comparing, so parallel guesses can't exceed 5 attempts.
  private async checkCode(userId: string, type: 'VERIFY' | 'RESET', code: string) {
    const t = await this.prisma.emailToken.findFirst({ where: { userId, type } });
    if (!t || t.expiresAt < new Date()) return false;
    const bumped = await this.prisma.emailToken.updateMany({ where: { id: t.id, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (!bumped.count) return false;
    if (!timingSafeEqual(Buffer.from(t.codeHash, 'hex'), Buffer.from(this.codeHash(userId, type, code), 'hex'))) return false;
    await this.prisma.emailToken.deleteMany({ where: { id: t.id } });
    return true;
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException();
    return { email: u.email, name: u.name, emailVerified: !!u.emailVerifiedAt, campusId: u.campusId };
  }

  async setCampus(userId: string, campusId: string) {
    const c = await this.prisma.campus.findUnique({ where: { id: campusId } });
    if (!c) throw new NotFoundException('campus not found');
    await this.prisma.user.update({ where: { id: userId }, data: { campusId } });
    return { campusId };
  }

  async forgot(dto: ForgotDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // fire-and-forget + identical response: neither content nor timing reveals whether the email exists
    if (user && !user.email.endsWith('@deleted.invalid')) {
      this.issueCode(user, 'RESET').catch((e) => this.log.warn(`reset mail failed: ${e?.message ?? e}`));
    }
    return { ok: true };
  }

  async reset(dto: ResetDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const ok = user ? await this.checkCode(user.id, 'RESET', dto.code) : false;
    if (!user || !ok) throw new BadRequestException('الكود غلط أو منتهي');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(dto.newPassword),
        refreshTokenHash: null, // signs out every device
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(), // receiving the code proves the mailbox is theirs
      },
    });
    return { ok: true };
  }

  async sendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerifiedAt) return { ok: true };
    try { await this.issueCode(user, 'VERIFY'); }
    catch (e: any) { this.log.warn(`verify mail failed: ${e?.message ?? e}`); throw new ServiceUnavailableException('مقدرناش نبعت الإيميل، جرّب كمان شوية'); }
    return { ok: true };
  }

  async verifyEmail(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerifiedAt) return { ok: true };
    if (!(await this.checkCode(userId, 'VERIFY', code))) throw new BadRequestException('الكود غلط أو منتهي');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return { ok: true };
  }

  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('الإيميل أو الباسورد غلط');
    if (user.role !== 'STUDENT') throw new ForbiddenException('Staff accounts are managed by an admin');
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    // orders stay (canteen records) but are detached from any personal data
    await this.prisma.$transaction([
      this.prisma.pushDevice.deleteMany({ where: { userId } }),
      this.prisma.emailToken.deleteMany({ where: { userId } }),
      this.prisma.order.updateMany({ where: { userId, status: { in: ['PENDING', 'PREPARING'] } }, data: { status: 'CANCELLED' } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { email: `deleted-${userId}@deleted.invalid`, name: 'حساب محذوف', passwordHash, refreshTokenHash: null, campusId: null, suspendedAt: user.suspendedAt },
      }),
    ]);
    return { ok: true };
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    return { ok: true };
  }
}
