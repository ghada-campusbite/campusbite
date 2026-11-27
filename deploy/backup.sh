#!/bin/sh
# daily compressed dump, keeps 14 days. Copy ./backups OFF this server too (see DEPLOY.md).
set -u
while true; do
  f="/backups/campusbite-$(date +%Y%m%d-%H%M).sql.gz"
  if pg_dump -h db -U campusbite campusbite | gzip > "$f.tmp" && [ -s "$f.tmp" ]; then
    mv "$f.tmp" "$f" && echo "backup ok: $f"
  else
    rm -f "$f.tmp"; echo "BACKUP FAILED" >&2
  fi
  find /backups -name 'campusbite-*.sql.gz' -mtime +14 -delete
  sleep 86400
done
