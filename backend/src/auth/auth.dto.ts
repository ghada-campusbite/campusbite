import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(120) email: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(10) @MaxLength(128) password: string;
}
export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(128) password: string;
}
export class DeleteAccountDto {
  @IsString() @MaxLength(128) password: string;
}
export class RefreshDto {
  @IsString() @MaxLength(2000) refreshToken: string;
}

export class ForgotDto {
  @IsEmail() @MaxLength(120) email: string;
}
export class ResetDto {
  @IsEmail() @MaxLength(120) email: string;
  @Matches(/^\d{6}$/) code: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}
export class VerifyDto {
  @Matches(/^\d{6}$/) code: string;
}

export class SetCampusDto {
  @IsString() @MaxLength(64) campusId: string;
}
