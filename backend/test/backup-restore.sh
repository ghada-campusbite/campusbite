#!/bin/sh
# Local backup/restore drill on a throwaway PostgreSQL server (fictional data only).
# Needs PGSERVER_BIN = dir with initdb/pg_ctl/postgres of the SAME major as the pg_dump client
# (tested: @embedded-postgres/linux-x64@14.x with pg_dump 14).
# Same commands as deploy/backup.sh (pg_dump | gzip), restored into a NEW database, then compared:
# orders, order lines, image bytes (hash + size), counts, migrations and foreign-key integrity.
set -eu
S=${PGSERVER_BIN:?set PGSERVER_BIN}; B=/usr/bin; D=$(mktemp -d); PORT=5547
$S/initdb -D "$D/data" -U owner --auth=trust >/dev/null
$S/pg_ctl -D "$D/data" -o "-p $PORT -k $D" -l "$D/log" -w start >/dev/null
trap '$S/pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1; rm -rf "$D"' EXIT
P="$B/psql -h $D -p $PORT -U owner -v ON_ERROR_STOP=1 -q -t -A"
$B/createdb -h $D -p $PORT -U owner src
MIGRATE_DATABASE_URL="postgresql://owner@localhost:$PORT/src?host=$D" sh scripts/migrate.sh >/dev/null 2>&1 || { echo "migrate failed"; exit 1; }
cat > "$D/seed.sql" <<'SQL'
INSERT INTO "University"(id,name) VALUES ('u1','جامعة تجريبية');
INSERT INTO "Canteen"(id,name,"universityId","prepMinutes") VALUES ('c1','مطعم تجريبي','u1',5);
INSERT INTO "MenuItem"(id,"canteenId",name,"priceCents") VALUES ('m1','c1','كشري',1500),('m2','c1','شاي',500);
INSERT INTO "User"(id,email,name,"passwordHash") VALUES ('s1','a@fict.dev','طالبة تجريبية','x'),('s2','b@fict.dev','طالب تجريبي','y');
INSERT INTO "Order"(id,"userId","canteenId",status,"totalCents","pickupAt","pickupCodeEnc") VALUES ('o1','s1','c1','COMPLETED',3500,now(),'enc-o1'),('o2','s2','c1','PENDING',500,now(),'enc-o2');
INSERT INTO "OrderItem"(id,"orderId","menuItemId",quantity,"unitPriceCents") VALUES ('i1','o1','m1',2,1500),('i2','o1','m2',1,500),('i3','o2','m2',1,500);
INSERT INTO "MenuItemImage"("itemId",data,mime) SELECT 'm1', decode(string_agg(md5(g::text),''),'hex'), 'image/jpeg' FROM generate_series(1,20000) g;
SQL
$P src -f "$D/seed.sql"
cat > "$D/sum.sql" <<'SQL'
SELECT 'orders_md5=' || md5(coalesce((SELECT string_agg(o::text,'|' ORDER BY id) FROM "Order" o),''))
 || ' lines_md5=' || md5(coalesce((SELECT string_agg(i::text,'|' ORDER BY id) FROM "OrderItem" i),''))
 || ' image_md5=' || md5(coalesce((SELECT string_agg(encode(data,'hex')||mime,'|' ORDER BY "itemId") FROM "MenuItemImage"),''))
 || ' image_bytes=' || (SELECT coalesce(sum(length(data)),0) FROM "MenuItemImage")
 || ' orders=' || (SELECT count(*) FROM "Order") || ' lines=' || (SELECT count(*) FROM "OrderItem")
 || ' users=' || (SELECT count(*) FROM "User") || ' migrations=' || (SELECT count(*) FROM _prisma_migrations)
 || ' orphan_lines=' || (SELECT count(*) FROM "OrderItem" i LEFT JOIN "Order" o ON o.id=i."orderId" LEFT JOIN "MenuItem" m ON m.id=i."menuItemId" WHERE o.id IS NULL OR m.id IS NULL);
SQL
BEFORE=$($P src -f "$D/sum.sql")
$B/pg_dump -h $D -p $PORT -U owner src | gzip > "$D/dump.sql.gz"; [ -s "$D/dump.sql.gz" ] || { echo "empty dump"; exit 1; }
$B/createdb -h $D -p $PORT -U owner restored
gunzip -c "$D/dump.sql.gz" | $P restored >/dev/null
AFTER=$($P restored -f "$D/sum.sql")
echo "before: $BEFORE"; echo "after:  $AFTER"; echo "dump_bytes=$(wc -c < "$D/dump.sql.gz")"
[ "$BEFORE" = "$AFTER" ] && echo "RESTORE OK" || { echo "RESTORE MISMATCH"; exit 1; }
