import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit key: a VERIFIED access token's user id when one is present, otherwise the client IP.
 * Why: the staff dashboard calls the API from its own server, so many restaurants share one IP.
 * No forwarded header is read here (only req.ip, which honours the single trusted proxy hop set in main.ts);
 * an unsigned, forged, expired or wrong-algorithm token falls back to the IP bucket, so a client cannot pick
 * someone else's bucket or escape its own by sending headers.
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  private readonly jwt = new JwtService({});
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const [type, token] = String(req.headers?.authorization ?? '').split(' ');
    if (type === 'Bearer' && token) {
      try {
        const p: any = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET, algorithms: ['HS256'] });
        if (typeof p?.sub === 'string' && p.sub) return `u:${p.sub}`;
      } catch { /* fall through to IP */ }
    }
    return `ip:${req.ip}`;
  }
}
