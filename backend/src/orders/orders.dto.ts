import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export const MENU_CATEGORIES = ['سندوتشات', 'وجبات', 'مشروبات', 'حلويات', 'سناكس'] as const;

class OrderLineDto {
  @IsUUID() menuItemId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}
export class CreateOrderDto {
  @IsUUID() canteenId: string;
  @IsISO8601() pickupAt: string;
  @ValidateNested({ each: true }) @Type(() => OrderLineDto) @ArrayMinSize(1) @ArrayMaxSize(20)
  items: OrderLineDto[];
}
export class UpdateStatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
  // required when status = COMPLETED (the code the student sees)
  @IsOptional() @IsString() @MaxLength(8) code?: string;
}
export class CreateMenuItemDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(MENU_CATEGORIES as unknown as string[]) category?: string;
  @IsInt() @Min(1) @Max(1_000_000) priceCents: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) offerPriceCents?: number;
}
export class UpdateMenuItemDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(MENU_CATEGORIES as unknown as string[]) category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) priceCents?: number;
  // null clears the offer
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) offerPriceCents?: number | null;
  @IsOptional() @IsBoolean() available?: boolean;
}
export class UpdateCanteenDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(120) prepMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) openMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) closeMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) maxOrdersPerSlot?: number;
}
