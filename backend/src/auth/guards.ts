import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

export interface AuthUser { sub: string; role: Role; canteenId: string | null }

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = String(req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      req.user = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET, algorithms: ['HS256'] });
    } catch { throw new UnauthorizedException(); }
    // a token issued before a suspension must stop working immediately
    const u = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { suspendedAt: true } });
    if (u?.suspendedAt) throw new ForbiddenException('حسابك موقوف، كلم إدارة التطبيق');
    return true;
  }
}

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    // class-level @Roles (e.g. the whole AdminController) must count, not only method-level
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [ctx.getHandler(), ctx.getClass()]) ?? [];
    const user: AuthUser = ctx.switchToHttp().getRequest().user;
    if (roles.length && !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
