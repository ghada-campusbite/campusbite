import { BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { CreateMenuItemDto, CreateOrderDto, UpdateCanteenDto, UpdateMenuItemDto, UpdateStatusDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Throttle({ default: { limit: Number(process.env.THROTTLE_ORDER_PER_MIN ?? 10), ttl: 60_000 } })
  @Roles('STUDENT') @Post()
  create(@Req() req: any, @Body() dto: CreateOrderDto) { return this.orders.create(req.user.sub, dto); }

  @Roles('STUDENT') @Get('mine')
  mine(@Req() req: any) { return this.orders.mine(req.user.sub); }

  @Roles('STUDENT') @Patch(':id/cancel')
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.orders.cancel(req.user.sub, id); }

  @Roles('CANTEEN_STAFF') @Get('canteen')
  canteen(@Req() req: any) { return this.orders.forCanteen(req.user.canteenId); }

  @Roles('CANTEEN_STAFF') @Patch(':id/status')
  status(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.orders.updateStatus(req.user.canteenId, id, dto.status, dto.code);
  }
}

const PUBLIC_CANTEEN = { id: true, campusId: true, name: true, prepMinutes: true, openMin: true, closeMin: true } as const;
const PUBLIC_ITEM = { id: true, name: true, description: true, category: true, imageUrl: true, priceCents: true, offerPriceCents: true, available: true } as const;

@Controller()
export class MenuController {
  constructor(private prisma: PrismaService, private orders: OrdersService) {}

  @Get('canteens/:id/menu')
  async menu(@Param('id', ParseUUIDPipe) id: string) {
    const canteen = await this.prisma.canteen.findUnique({ where: { id }, select: { active: true } });
    if (!canteen?.active) return [];
    const items = await this.prisma.menuItem.findMany({ where: { canteenId: id, archived: false }, orderBy: [{ category: 'asc' }, { name: 'asc' }], select: PUBLIC_ITEM });
    // "popular" = top 3 items by quantity in non-cancelled orders over the last 30 days
    // (needs at least 3 units sold, so a brand-new menu shows no badge)
    const since = new Date(Date.now() - 30 * 86400_000);
    const sold = await this.prisma.orderItem.groupBy({
      by: ['menuItemId'], _sum: { quantity: true },
      where: { menuItem: { canteenId: id }, order: { status: { not: 'CANCELLED' }, createdAt: { gte: since } } },
    });
    const top = new Set(sold.filter((r) => (r._sum.quantity ?? 0) >= 3).sort((a, b) => (b._sum.quantity ?? 0) - (a._sum.quantity ?? 0)).slice(0, 3).map((r) => r.menuItemId));
    return items.map((i) => ({ ...i, popular: top.has(i.id) }));
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Get('menu/mine')
  mine(@Req() req: any) {
    return this.prisma.menuItem.findMany({ where: { canteenId: req.user.canteenId, archived: false }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Post('menu')
  async create(@Req() req: any, @Body() dto: CreateMenuItemDto) {
    // bounded storage budget: images live in the database (up to 3MB each), so cap
    // the number of menu items per canteen to keep the free-tier DB quota predictable
    const cap = Number(process.env.MAX_MENU_ITEMS_PER_CANTEEN ?? 100);
    const count = await this.prisma.menuItem.count({ where: { canteenId: req.user.canteenId } });
    if (count >= cap) throw new BadRequestException('وصلت للحد الأقصى لعدد الأصناف');
    if (dto.offerPriceCents != null && dto.offerPriceCents >= dto.priceCents) throw new BadRequestException('سعر العرض لازم يكون أقل من السعر الأصلي');
    return this.prisma.menuItem.create({ data: { ...dto, canteenId: req.user.canteenId } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Patch('menu/:id')
  async update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMenuItemDto) {
    // scoped to the staff member's own canteen
    const cur = await this.prisma.menuItem.findFirst({ where: { id, canteenId: req.user.canteenId } });
    if (!cur) return { updated: 0 };
    const price = dto.priceCents ?? cur.priceCents;
    const offer = dto.offerPriceCents === undefined ? cur.offerPriceCents : dto.offerPriceCents;
    if (offer != null && offer >= price) throw new BadRequestException('سعر العرض لازم يكون أقل من السعر الأصلي');
    const r = await this.prisma.menuItem.updateMany({ where: { id, canteenId: req.user.canteenId }, data: dto });
    return { updated: r.count };
  }

  // "delete" archives: old orders keep pointing at the item
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Delete('menu/:id')
  async remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.menuItem.updateMany({ where: { id, canteenId: req.user.canteenId }, data: { archived: true, available: false } });
    return { archived: r.count };
  }

  @Get('menu/:id/image')
  async menuImage(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: any) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const img = await this.prisma.menuItemImage.findUnique({ where: { itemId: id } });
    if (!img) throw new NotFoundException('لا توجد صورة');
    return new StreamableFile(Buffer.from(img.data), { type: img.mime, disposition: 'inline' });
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Post('menu/:id/image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 3 * 1024 * 1024 } }))
  async image(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: any) {
    const ext = extname(file?.originalname ?? '').toLowerCase();
    if (!file?.buffer || !['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) throw new BadRequestException('الصورة لازم تكون jpg أو png أو webp');
    // sniff the actual bytes: extension and content-type are both client-controlled
    const b: Buffer = file.buffer;
    const isJpg = b.length > 2 && b[0] === 0xff && b[1] === 0xd8;
    const isPng = b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
    const isWebp = b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    if (!isJpg && !isPng && !isWebp) throw new BadRequestException('محتوى الملف مش صورة صالحة');
    const mime = isJpg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp';
    // global image-byte budget across the whole deployment: images live in the
    // database, so fail safely before the free-tier DB quota (1GB) is at risk
    const budget = Number(process.env.MAX_IMAGE_STORAGE_BYTES ?? 300 * 1024 * 1024);
    const [{ used }] = await this.prisma.$queryRaw<[{ used: bigint }]>`SELECT COALESCE(SUM(LENGTH(data)), 0)::bigint AS used FROM "MenuItemImage"`;
    // conservative: on replacement the old bytes are still counted, so we never under-count
    if (Number(used) + b.length > budget) throw new BadRequestException('مساحة تخزين الصور اتملت — احذف صور قديمة أو ارفع السقف');
    // image bytes live in the database, not the filesystem, so free-tier hosts
    // with ephemeral storage don't lose menu photos on restart/redeploy
    const owned = await this.prisma.menuItem.findFirst({ where: { id, canteenId: req.user.canteenId }, select: { id: true } });
    if (!owned) throw new BadRequestException('Item not found');
    await this.prisma.menuItemImage.upsert({ where: { itemId: id }, create: { itemId: id, data: b, mime }, update: { data: b, mime } });
    const imageUrl = `/menu/${id}/image`;
    await this.prisma.menuItem.update({ where: { id }, data: { imageUrl } });
    return { imageUrl };
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Get('canteen/mine')
  myCanteen(@Req() req: any) { return this.orders.myCanteen(req.user.canteenId); }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Patch('canteen/mine')
  updateCanteen(@Req() req: any, @Body() dto: UpdateCanteenDto) { return this.orders.updateCanteen(req.user.canteenId, dto); }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('CANTEEN_STAFF') @Get('canteen/summary')
  summary(@Req() req: any) { return this.orders.dailySummary(req.user.canteenId); }
}

@Controller('canteens')
export class CatalogController {
  constructor(private prisma: PrismaService, private orders: OrdersService) {}

  @Get()
  async list(@Query('universityId') universityId?: string, @Query('campusId') campusId?: string) {
    const rows = await this.prisma.canteen.findMany({
      where: { active: true, ...(universityId ? { universityId } : {}), ...(campusId ? { campusId } : {}) },
      select: { ...PUBLIC_CANTEEN, items: { where: { available: true, archived: false, imageUrl: { not: null } }, select: { imageUrl: true }, orderBy: { name: 'asc' }, take: 4 } },
      orderBy: { name: 'asc' }, take: 100,
    });
    // previewImages: real menu photos of this restaurant (no placeholders invented)
    return rows.map(({ items, ...c }) => ({ ...c, previewImages: items.map((m) => m.imageUrl) }));
  }

  @Get(':id/slots')
  slots(@Param('id', ParseUUIDPipe) id: string) { return this.orders.slots(id); }
}

@Controller('universities')
export class UniversitiesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.university.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 });
  }

  @Get(':id/campuses')
  campuses(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.campus.findMany({ where: { universityId: id }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 });
  }
}
