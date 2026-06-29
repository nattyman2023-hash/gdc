#!/bin/bash
# GDCU Database Backup Script
# Run daily via cron: 0 3 * * * /path/to/scripts/backup-db.sh

BACKUP_DIR="/path/to/backups"
DB_FILE="/path/to/data/gdcu.sqlite"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Copy the SQLite database (safe while app is running)
cp "$DB_FILE" "$BACKUP_DIR/gdcu_$TIMESTAMP.sqlite"
gzip "$BACKUP_DIR/gdcu_$TIMESTAMP.sqlite"

echo "Backup created: gdcu_$TIMESTAMP.sqlite.gz"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "gdcu_*.sqlite.gz" -mtime +$RETENTION_DAYS -delete
echo "Cleaned up backups older than $RETENTION_DAYS days"
