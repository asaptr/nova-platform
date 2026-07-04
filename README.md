# NOVA — Node Orchestration & Virtualization Architecture

Self-service IaaS VPS platform berbasis Proxmox. User bisa deploy, manage, dan bayar VM sendiri lewat portal web — mirip DigitalOcean/Hetzner, tapi jalan di atas cluster Proxmox milik sendiri.

> **Versi saat ini**: NOVA Andromeda v1.0

---

## Stack

| Lapisan | Teknologi |
|---|---|
| Monorepo | Turborepo + pnpm v11 workspaces |
| Backend | NestJS + Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Frontend | Next.js 14 App Router + Tailwind CSS |
| Hypervisor | Proxmox VE 8.x (API Token auth) |
| NAT networking | MikroTik RouterOS API + dnsmasq DHCP |
| Payment | Midtrans (webhook) |
| Email | SMTP (nodemailer) |
| Deployment | LXC Container + PM2 + Nginx |

---

## Struktur Folder

```
nova/
├── apps/
│   ├── api/          # NestJS backend (port 3000)
│   ├── web/          # User portal Next.js (port 3001)
│   └── admin/        # Admin panel Next.js (port 3002)
├── packages/
│   ├── types/        # Shared TypeScript interfaces
│   ├── ui/           # Shared React components
│   └── utils/        # formatRupiah, formatDate, dll
├── ecosystem.config.js   # PM2 process config
├── SETUP.md              # Fresh install guide (Proxmox → deploy)
└── proxmox-reseller-platform.md  # Blueprint arsitektur lengkap
```

---

## Subdomain & Routing

| Subdomain | Tujuan | Port |
|---|---|---|
| `app.yourdomain.com` | User portal | 3001 |
| `admin.yourdomain.com` | Admin panel | 3002 |
| `api.yourdomain.com` | REST API | 3000 |
| `status.yourdomain.com` | Status page | — |
| `docs.yourdomain.com` | Dokumentasi | — |

---

## Development — Cara Running

### Prasyarat

- Node.js >= 20
- pnpm >= 11 (`npm install -g pnpm@11`)
- PostgreSQL 16
- Redis 7
- Proxmox VE yang sudah dikonfigurasi (lihat `SETUP.md`)
- MikroTik RouterOS dengan API aktif

### 1. Clone & Install

```bash
git clone <repo-url> nova
cd nova
pnpm install
```

### 2. Setup Environment Variables

```bash
cp apps/api/.env apps/api/.env.backup
```

Edit `apps/api/.env` — bagian yang wajib diganti:

```env
# Database
DATABASE_URL="postgresql://nova:password@localhost:5432/nova"

# JWT — ganti dengan random string kuat!
JWT_SECRET="random-string-minimal-32-karakter"
ADMIN_JWT_SECRET="random-string-berbeda-dari-jwt-secret"

# Proxmox
PROXMOX_HOST="10.10.10.250"
PROXMOX_TOKEN_ID="nova@pve!nova-token"
PROXMOX_TOKEN_SECRET="uuid-token"
PROXMOX_NODE="pve"
PROXMOX_VERIFY_SSL="false"

# MikroTik (untuk NAT VM)
MIKROTIK_HOST="10.10.10.1"
MIKROTIK_USER="nova-api"
MIKROTIK_PASS="password-user-mikrotik"

# NAT
NAT_BRIDGE="vmbr1"
NAT_GATEWAY="10.20.0.1"
NAT_PUBLIC_IP="1.2.3.4"

# Midtrans
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
MIDTRANS_IS_PRODUCTION="false"

# SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="app-password-gmail"
EMAIL_FROM="NOVA <noreply@yourdomain.com>"
```

Frontend env:

```bash
echo 'NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1' > apps/web/.env.local
echo 'NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1' > apps/admin/.env.local
```

### 3. Setup Database

```bash
# Push schema (pakai ini, bukan migrate dev — non-interactive)
pnpm db:push

# Seed data awal: superadmin + default system config
pnpm db:seed
```

### 4. Jalankan Development Mode

```bash
pnpm dev
```

Turborepo menjalankan ketiga app secara paralel:

| App | URL |
|---|---|
| API | http://localhost:3000 |
| User portal | http://localhost:3001 |
| Admin panel | http://localhost:3002 |

Atau jalankan individual:

```bash
pnpm --filter=api start:dev
pnpm --filter=web dev
pnpm --filter=admin dev
```

### 5. Prisma Studio (GUI database)

```bash
pnpm db:studio   # buka http://localhost:5555
```

---

## Production — Deployment

Lihat **[SETUP.md](./SETUP.md)** untuk panduan lengkap fresh install dari awal (Proxmox → LXC → deploy).

Ringkasan deployment architecture:

```
Proxmox Host
├── LXC nova-app (CT 100)
│   ├── PM2
│   │   ├── nova-api      (NestJS, port 3000)
│   │   ├── nova-web      (Next.js, port 3001)
│   │   └── nova-admin    (Next.js, port 3002)
│   ├── Nginx             (reverse proxy + SSL termination)
│   ├── PostgreSQL 16     (database)
│   └── Redis 7           (cache + BullMQ queue)
├── KVM VMs               (VM user yang di-deploy)
└── vmbr1 bridge          (NAT subnet 10.20.0.0/24)
```

Update production:

```bash
cd /opt/nova
git pull origin main
pnpm install && pnpm build
pnpm db:push          # jika ada perubahan schema
pm2 restart all
```

---

## Proxmox Setup

### Buat API Token (via CLI — satu kali setup)

```bash
pveum user add nova@pve
pveum role add NOVARole -privs \
  "VM.Allocate VM.Clone VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit \
   VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network \
   VM.Config.Options VM.Console VM.Monitor VM.PowerMgmt VM.Snapshot \
   Datastore.AllocateSpace Datastore.AllocateTemplate Datastore.Audit \
   SDN.Use Sys.Audit"
pveum aclmod / -user nova@pve -role NOVARole
pveum user token add nova@pve nova-token --privsep=0
```

Salin token secret yang muncul ke `.env` sebagai `PROXMOX_TOKEN_SECRET`.

### Template Cloud-Init

Template VM **wajib** include `qemu-guest-agent` — dipakai untuk set password root dan hostname via Proxmox API. Template menggunakan `vga: std` (bukan serial0).

NOVA secara otomatis memperbaiki VGA config lama (`serial0` → `std`) saat VM di-start.

Lihat `SETUP.md` bagian 1.5 untuk langkah pembuatan template lengkap.

### Bridge vmbr1 untuk NAT

Di `/etc/network/interfaces` Proxmox host:

```
auto vmbr1
iface vmbr1 inet static
    address 10.20.0.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s 10.20.0.0/24 -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s 10.20.0.0/24 -o vmbr0 -j MASQUERADE
```

---

## Billing System

NOVA menggunakan model **pay-as-you-go prepaid** tanpa deposit:

| Kondisi | Aksi sistem |
|---|---|
| Saldo > 0 dan VM running | Potong saldo setiap jam sesuai `priceHourly` |
| Saldo minus tapi dalam grace period (< 2 jam usage) | Biarkan VM tetap running, kirim warning |
| Saldo melewati batas grace — minus lebih dari `priceHourly × 2` | Suspend VM otomatis + disable MikroTik NAT |
| VM suspended selama 7 hari tanpa topup | Hapus VM permanen dari Proxmox |
| User mau nyalakan VM yang suspended | Harus topup sampai saldo ≥ 0 terlebih dahulu |

Tidak ada deposit saat membuat VM baru. Syarat buat VM: saldo ≥ 0.

---

## System Settings

Konfigurasi platform tersimpan di database (`SystemConfig` table) dan bisa diubah via **Admin Panel → Sistem → Pengaturan Sistem** (superadmin only).

| Seksi | Setting yang tersedia |
|---|---|
| Branding | Nama platform, tagline, codename versi, nomor versi, logo URL |
| Domain | Semua subdomain (app, admin, api, landing, status, docs, changelog) |
| Proxmox | Host, port, node, token ID, token secret — butuh restart API jika diubah |
| MikroTik & NAT | Host, user, password, bridge, gateway, public IP — butuh restart API |

Setting yang **tidak ada di UI** (karena security-critical — hanya di `.env`):
- `JWT_SECRET` dan `ADMIN_JWT_SECRET`
- `DATABASE_URL`

Brand name ditampilkan dinamis di sidebar kedua portal via `GET /api/v1/brand`.

---

## Arsitektur Flow: Provisioning VM

```
User klik "Deploy VM"
    │
    ▼
POST /api/v1/vms
    │  cek saldo >= 0, generate displayId atomic (ln-nat-0001)
    │
    ▼
BullMQ queue: vm-provision
    │
    ├─ Alokasi IP NAT (SELECT FOR UPDATE, race-free)
    ├─ Proxmox: clone VM dari template (vga: std)
    ├─ dnsmasq: tambah DHCP reservation (MAC → IP fixed)
    ├─ MikroTik: tambah dst-nat rule (port 220XX → VM:22)
    ├─ Proxmox: startVm + waitForTask
    ├─ Tunggu QEMU guest agent ready
    ├─ Set root password via guest agent
    ├─ Set hostname via guest agent
    └─ Update status DB → running + kirim email
```

## Arsitektur Flow: Billing

```
@Cron setiap jam
    │
    ├─ Ambil semua VM status=running
    ├─ Potong saldo sesuai priceHourly
    ├─ Jika saldo <= -(priceHourly × 2) → suspend VM
    │   ├─ Proxmox: stopVm (force, wait for completion)
    │   ├─ MikroTik: disable NAT ports
    │   └─ DB: status=suspended, expiresAt=now+7hari
    └─ Jika saldo < 0 tapi masih dalam grace → kirim email warning

@Cron setiap hari jam 02:00
    └─ Cari VM status=suspended AND expiresAt <= now
        ├─ Proxmox: stopVm + deleteVm (purge disk)
        ├─ MikroTik: hapus NAT ports
        └─ DB: status=deleted
```

---

## MikroTik Setup

### Aktifkan API

Di WinBox: **IP → Services → api** → enable, port 8728.

### Buat user terbatas

```
/user add name=nova-api password=password-kuat group=write
```

NOVA otomatis menambah/menghapus rule `/ip firewall nat` untuk port forwarding SSH (port `220XX` → `22` ke IP internal VM).

---

## Midtrans Setup

1. Daftar dan aktifkan Snap API di dashboard Midtrans
2. Salin **Server Key** dan **Client Key**
3. Set webhook URL:
   ```
   https://api.yourdomain.com/api/v1/payment/webhook
   ```
4. Saat siap live, set production:
   ```env
   MIDTRANS_IS_PRODUCTION="true"
   MIDTRANS_SERVER_KEY="Mid-server-xxxx"   # tanpa SB-
   ```

---

## Variabel Environment Lengkap

| Variable | Keterangan | Contoh |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret token user (min 32 char) | random hex |
| `JWT_EXPIRES_IN` | Masa berlaku access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Masa berlaku refresh token | `7d` |
| `ADMIN_JWT_SECRET` | Secret token admin (harus beda) | random hex |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PROXMOX_HOST` | IP/hostname Proxmox | `10.10.10.250` |
| `PROXMOX_PORT` | Port Proxmox API | `8006` |
| `PROXMOX_TOKEN_ID` | API token ID | `nova@pve!nova-token` |
| `PROXMOX_TOKEN_SECRET` | API token secret (UUID) | `b6665bf4-...` |
| `PROXMOX_NODE` | Nama node default | `pve` |
| `PROXMOX_VERIFY_SSL` | Verifikasi SSL cert | `false` |
| `MIKROTIK_HOST` | IP MikroTik | `10.10.10.1` |
| `MIKROTIK_USER` | User API MikroTik | `nova-api` |
| `MIKROTIK_PASS` | Password user MikroTik | — |
| `NAT_BRIDGE` | Bridge untuk VM NAT | `vmbr1` |
| `NAT_GATEWAY` | Gateway subnet NAT | `10.20.0.1` |
| `NAT_PUBLIC_IP` | IP publik untuk SSH forwarding | `103.x.x.x` |
| `PUBLIC_BRIDGE` | Bridge untuk VM Public IP | `vmbr0` |
| `MIDTRANS_SERVER_KEY` | Server key Midtrans | `SB-Mid-server-xxxx` |
| `MIDTRANS_CLIENT_KEY` | Client key Midtrans | `SB-Mid-client-xxxx` |
| `MIDTRANS_IS_PRODUCTION` | Mode produksi Midtrans | `false` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | Email pengirim | `noreply@yourdomain.com` |
| `SMTP_PASS` | Password / app password | — |
| `EMAIL_FROM` | Nama + email pengirim | `NOVA <noreply@...>` |
| `FRONTEND_URL` | URL user portal (untuk CORS) | `https://app.yourdomain.com` |
| `ADMIN_URL` | URL admin panel (untuk CORS) | `https://admin.yourdomain.com` |
| `PORT` | Port API server | `3000` |
| `NODE_ENV` | Environment | `production` |

---

## Perintah Berguna

```bash
# Status semua proses (production)
pm2 list
pm2 logs nova-api --lines 100

# Restart service
pm2 restart nova-api

# Database
pnpm db:push        # push schema changes
pnpm db:studio      # Prisma Studio GUI (port 5555)
pnpm db:seed        # seed ulang data awal

# Build
pnpm build
pnpm --filter=api build   # build satu app saja
```
