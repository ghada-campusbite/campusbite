import { IsOptional, IsEmail, IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUniversityDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
}
export class CreateCanteenDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsUUID() universityId: string;
  @IsOptional() @IsUUID() campusId?: string;
  @IsInt() @Min(1) @Max(120) prepMinutes: number;
}
export class CreateBreakDto {
  @IsUUID() universityId: string;
  @IsInt() @Min(0) @Max(1439) startMin: number;
  @IsInt() @Min(1) @Max(1440) endMin: number;
}
export class CreateStaffDto {
  @IsEmail() @MaxLength(120) email: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(12) @MaxLength(128) password: string;
  @IsUUID() canteenId: string;
}

export class UpdateSettingsDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(30) commissionPercent: number;
}

export class CreateCampusDto {
  @IsUUID() universityId: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
}
