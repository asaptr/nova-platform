#!/bin/bash
# Jalankan sekali setelah clone repo untuk setup development environment
# Usage: bash scripts/dev-setup.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Langit Node — Dev Setup ==="

# ── Cek prerequisites ─────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js tidak ditemukan. Install dari https://nodejs.org (>= 20)"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Install pnpm..."; npm install -g pnpm; }
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker tidak ditemukan. Install Docker Desktop."; exit 1; }

NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 20 ]; then
  echo "ERROR: Node.js >= 20 dibutuhkan. Versi saat ini: $(node -v)"
  exit 1
fi

echo "Node: $(node -v) | pnpm: $(pnpm -v) | Docker: $(docker -v)"

# ── Install dependencies ──────────────────────────────────────────
echo ""
echo "[1/4] Install dependencies..."
pnpm install

# ── Setup env files ───────────────────────────────────────────────
echo "[2/4] Setup env files..."

if [ ! -f apps/api/.env ]; then
  cat > apps/api/.env <<'ENVEOF'
DATABASE_URL="postgresql://langitnode:langitnode_dev@localhost:5432/langitnode"
JWT_SECRET="dev-secret-ganti-di-production-minimal-32-char"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
ADMIN_JWT_SECRET="dev-admin-secret-ganti-di-production"
REDIS_HOST="localhost"
REDIS_PORT="6379"
PROXMOX_HOST="10.10.10.250"
PROXMOX_PORT="8006"
PROXMOX_TOKEN_ID="langitnode@pve!langitnode-token"
PROXMOX_TOKEN_SECRET="isi-token-secret-dari-proxmox"
PROXMOX_NODE="pve"
PROXMOX_VERIFY_SSL="false"
MIKROTIK_HOST="10.10.10.1"
MIKROTIK_USER="langitnode-api"
MIKROTIK_PASS="GantiPasswordIni123!"
NAT_BRIDGE="vmbr1"
NAT_GATEWAY="10.20.0.1"
PUBLIC_BRIDGE="vmbr0"
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"
MIDTRANS_IS_PRODUCTION="false"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="noreply@langitnode.id"
SMTP_PASS="app-password"
EMAIL_FROM="Langit Node <noreply@langitnode.id>"
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:3001"
ADMIN_URL="http://localhost:3002"
ENVEOF
  echo "  ✓ apps/api/.env dibuat — EDIT nilai Proxmox, Mikrotik, SMTP, Midtrans!"
else
  echo "  ✓ apps/api/.env sudah ada, skip."
fi

if [ ! -f apps/web/.env.local ]; then
  echo 'NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1' > apps/web/.env.local
  echo "  ✓ apps/web/.env.local dibuat"
fi

if [ ! -f apps/admin/.env.local ]; then
  echo 'NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1' > apps/admin/.env.local
  echo "  ✓ apps/admin/.env.local dibuat"
fi

# ── Jalankan Postgres + Redis ─────────────────────────────────────
echo "[3/4] Jalankan Postgres & Redis..."
docker compose up postgres redis -d

echo "Menunggu database siap..."
until docker compose exec -T postgres pg_isready -U langitnode -q; do
  sleep 1
done
echo "  ✓ Postgres ready"

until docker compose exec -T redis redis-cli ping | grep -q PONG; do
  sleep 1
done
echo "  ✓ Redis ready"

# ── Migrasi database ──────────────────────────────────────────────
echo "[4/4] Migrasi database..."
cd apps/api
npx prisma generate
npx prisma db push --accept-data-loss
cd "$ROOT"
echo "  ✓ Schema database berhasil di-push"

# ── Seed superadmin ───────────────────────────────────────────────
echo ""
echo "Membuat superadmin default..."
node -e "
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
async function main() {
  const hash = await bcrypt.hash('Admin@123!', 12)
  await prisma.adminUser.upsert({
    where: { email: 'superadmin@langitnode.id' },
    update: {},
    create: { email: 'superadmin@langitnode.id', passwordHash: hash, role: 'superadmin' },
  })
  await prisma.package.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Nano NAT', cpu: 1, ram: 512, disk: 10, pricePerHour: 50, ipType: 'nat', osTemplates: ['ubuntu-22.04-cloudinit'] },
      { name: 'Micro NAT', cpu: 1, ram: 1024, disk: 20, pricePerHour: 100, ipType: 'nat', osTemplates: ['ubuntu-22.04-cloudinit'] },
      { name: 'Small Public', cpu: 2, ram: 2048, disk: 40, pricePerHour: 300, ipType: 'public', osTemplates: ['ubuntu-22.04-cloudinit'] },
    ],
  })
  console.log('Seed OK')
  await prisma.\$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
" 2>/dev/null && echo "  ✓ Superadmin & paket default dibuat" || echo "  WARN: Seed gagal (mungkin bcrypt belum di-install, jalankan: cd apps/api && npm install)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Setup selesai! Jalankan:                       ║"
echo "║                                                  ║"
echo "║    pnpm dev                                      ║"
echo "║                                                  ║"
echo "║  API    → http://localhost:3000                  ║"
echo "║  Portal → http://localhost:3001                  ║"
echo "║  Admin  → http://localhost:3002                  ║"
echo "║                                                  ║"
echo "║  Admin login:                                    ║"
echo "║    Email: superadmin@langitnode.id               ║"
echo "║    Pass:  Admin@123!                             ║"
echo "╚══════════════════════════════════════════════════╝"
