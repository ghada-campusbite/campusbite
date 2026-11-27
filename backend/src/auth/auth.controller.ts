import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { DeleteAccountDto, ForgotDto, LoginDto, RefreshDto, RegisterDto, SetCampusDto, ResetDto, VerifyDto } from './auth.dto';
import { JwtAuthGuard } from './guards';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200) @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200) @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }

  @UseGuards(JwtAuthGuard)
  @HttpCode(200) @Post('logout') logout(@Req() req: any) { return this.auth.logout(req.user.sub); }

  @UseGuards(JwtAuthGuard)
  @Patch('me/campus') setCampus(@Req() req: any, @Body() dto: SetCampusDto) { return this.auth.setCampus(req.user.sub, dto.campusId); }
  @UseGuards(JwtAuthGuard)
  @Get('me') me(@Req() req: any) { return this.auth.me(req.user.sub); }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200) @Post('forgot') forgot(@Body() dto: ForgotDto) { return this.auth.forgot(dto); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200) @Post('reset') reset(@Body() dto: ResetDto) { return this.auth.reset(dto); }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200) @Post('verify-email/send') sendVerification(@Req() req: any) { return this.auth.sendVerification(req.user.sub); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200) @Post('verify-email') verifyEmail(@Req() req: any, @Body() dto: VerifyDto) { return this.auth.verifyEmail(req.user.sub, dto.code); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Delete('me') deleteMe(@Req() req: any, @Body() dto: DeleteAccountDto) { return this.auth.deleteAccount(req.user.sub, dto.password); }
}
