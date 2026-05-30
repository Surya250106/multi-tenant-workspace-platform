#!/bin/sh
set -e

echo "=== System Boot Sequence Starting ==="

# 1. Wait for Postgres database to become fully ready
echo "1. Checking database connection..."
node dist/src/prisma/check-db.js

# 2. Deploy Prisma Migrations
echo "2. Applying database migrations..."
npx prisma db push --schema=src/prisma/schema.prisma

# 3. Seed initial database records
echo "3. Seeding database..."
node dist/seeds/seed.js

# 4. Start production server
echo "4. Launching Express Server..."
exec node dist/src/index.js
