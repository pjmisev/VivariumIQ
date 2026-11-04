#!/bin/bash

umask 077

set -e
set -o pipefail

BACKUP_DIR="/home/ubuntu/db_backup"
DATE=$(date +%Y-%m-%d)

mysqldump --single-transaction urcast_db | gzip > "$BACKUP_DIR/urcast_$DATE.sql.gz"

find "$BACKUP_DIR" -name "*.sql.gz" -mtime +6 -delete
