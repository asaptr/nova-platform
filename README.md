# Langit Node

Self-service IaaS VPS platform berbasis Proxmox. User bisa deploy, manage, dan bayar VM sendiri lewat portal web — mirip DigitalOcean/Hetzner, tapi jalan di atas cluster Proxmox milik sendiri.

## Stack

| Lapisan | Teknologi |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Backend | NestJS + Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Frontend | Next.js 14 App Router + Tailwind CSS |
| Hypervisor | Proxmox VE (API Token auth) |
| NAT networking | Mikrotik RouterOS API + dnsmasq DHCP reservation |
| Payment | Midtrans (webhook) |
| Email | SMTP (nodemailer) |
| Deployment | Docker Compose + Nginx reverse proxy |

---

## Struktur Folder

```
langit-node/
├── apps/
│   ├── api/          # NestJS backend (port 3000)
│   ├── web/          # User portal Next.js (port 3001)
│   └── admin/        # Admin panel Next.js (port 3002)
├── packages/
│   ├── types/        # Shared TypeScript interfaces
│   ├── ui/           # Shared React components
│   └── utils/        # formatRupiah, formatDate, dll
├── nginx/
│   └── nginx.conf
└── docker-compose.yml
```

---

## Cara Running

### Prasyarat

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- PostgreSQL 16 (atau lewat Docker)
- Redis 7 (atau lewat Docker)
- Proxmox VE yang sudah dikonfigurasi (lihat bagian Proxmox Setup)
- Mikrotik RouterOS dengan API aktif (untuk VM NAT)

---

### 1. Clone & Install

```bash
cd "/Applications/XAMPP/xamppfiles/htdocs/Workspace/Langit Node"
pnpm install
```

---

### 2. Setup Environment Variables

**Backend API** — salin dan isi nilai yang sesuai:

```bash
cp apps/api/.env apps/api/.env.local
```

Edit `apps/api/.env` — bagian yang wajib diganti:

```env
# Database
DATABASE_URL="postgresql://langitnode:langitnode_dev@localhost:5432/langitnode"

# JWT — ganti dengan random string panjang!
JWT_SECRET="random-string-minimal-32-karakter-xxxx"
ADMIN_JWT_SECRET="random-string-berbeda-dari-jwt-secret"

# Proxmox — sesuaikan dengan server kamu
PROXMOX_HOST="10.10.10.250"
PROXMOX_TOKEN_ID="langitnode@pve!langitnode-token"
PROXMOX_TOKEN_SECRET="uuid-token-dari-proxmox"
PROXMOX_VERIFY_SSL="false"   # true jika pakai sertifikat valid

# Mikrotik (untuk NAT VM)
MIKROTIK_HOST="10.10.10.1"
MIKROTIK_USER="langitnode-api"
MIKROTIK_PASS="password-user-mikrotik"

# Midtrans
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"   # SB = Sandbox
MIDTRANS_IS_PRODUCTION="false"

# SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_USER="noreply@langitnode.id"
SMTP_PASS="app-password-gmail"
```

**User portal:**

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

**Admin panel:**

```bash
# apps/admin/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

---

### 3. Jalankan Database & Redis (via Docker)

```bash
# Hanya jalankan postgres + redis, bukan seluruh stack
docker compose up postgres redis -d
```

Tunggu sampai healthy:

```bash
docker compose ps
```

---

### 4. Migrasi Database

```bash
pnpm db:migrate
```

Kalau mau reset dari awal:

```bash
pnpm db:push      # push schema tanpa migration file
# atau
cd apps/api && npx prisma migrate reset
```

---

### 5. Seed Data Awal (superadmin + paket)

Buat file `apps/api/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // Superadmin
  await prisma.adminUser.upsert({
    where: { email: 'superadmin@langitnode.id' },
    update: {},
    create: {
      email: 'superadmin@langitnode.id',
      passwordHash: await bcrypt.hash('Admin@123!', 12),
      role: 'superadmin',
    },
  })

  // Paket NAT
  await prisma.package.createMany({
    skipDuplicates: true,
    data: [
      {
        name: 'Nano NAT',
        cpu: 1, ram: 512, disk: 10,
        pricePerHour: 50,
        ipType: 'nat',
        osTemplates: ['ubuntu-22.04-cloudinit', 'debian-12-cloudinit'],
      },
      {
        name: 'Micro NAT',
        cpu: 1, ram: 1024, disk: 20,
        pricePerHour: 100,
        ipType: 'nat',
        osTemplates: ['ubuntu-22.04-cloudinit', 'debian-12-cloudinit'],
      },
      {
        name: 'Small Public',
        cpu: 2, ram: 2048, disk: 40,
        pricePerHour: 300,
        ipType: 'public',
        osTemplates: ['ubuntu-22.04-cloudinit', 'debian-12-cloudinit'],
      },
    ],
  })

  console.log('Seed selesai.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

Tambahkan ke `apps/api/package.json`:

```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

Jalankan:

```bash
cd apps/api && npx prisma db seed
```

---

### 6. Development Mode (semua app sekaligus)

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
# Hanya API
pnpm --filter=api start:dev

# Hanya web
pnpm --filter=web dev

# Hanya admin
pnpm --filter=admin dev
```

---

### 7. Prisma Studio (GUI database)

```bash
pnpm db:studio
# Buka http://localhost:5555
```

---

## Production — Docker Compose

### Build & Deploy

```bash
# Build semua image
docker compose build

# Jalankan seluruh stack
docker compose up -d

# Cek log
docker compose logs -f api
docker compose logs -f web
```

### Urutan startup otomatis

```
postgres → redis → api → web → admin → nginx
```

### URL Production

| Service | Port/Domain |
|---|---|
| User portal | http://langitnode.id |
| Admin panel | http://admin.langitnode.id |
| API (internal) | http://api:3000 (lewat nginx) |

---

## Proxmox Setup

### 1. Buat API Token

Di Proxmox UI: **Datacenter → API Tokens → Add**

```
User:  langitnode@pve
Token: langitnode-token
Privilege Separation: NO  ← penting, butuh akses penuh
```

Salin token secret ke `.env`:

```env
PROXMOX_TOKEN_ID="langitnode@pve!langitnode-token"
PROXMOX_TOKEN_SECRET="uuid-yang-muncul-saat-buat"
```

### 2. Template Cloud-Init

Upload template ke Proxmox (jalankan di host PVE):

```bash
# Contoh Ubuntu 22.04
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
qm create 9000 --name ubuntu-22.04-cloudinit --memory 1024 --net0 virtio,bridge=vmbr0
qm importdisk 9000 jammy-server-cloudimg-amd64.img local-lvm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --ide2 local-lvm:cloudinit --boot c --bootdisk scsi0
qm set 9000 --serial0 socket --vga serial0
qm set 9000 --agent enabled=1   # ← WAJIB: QEMU guest agent
qm template 9000
```

**Penting:** Pastikan `qemu-guest-agent` sudah terinstall di image, karena API pakai ini untuk set password root dan hostname.

### 3. Jaringan NAT

Tambahkan bridge `vmbr1` di `/etc/network/interfaces` pada host PVE:

```
auto vmbr1
iface vmbr1 inet static
    address 10.20.0.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up iptables -t nat -A POSTROUTING -s 10.20.0.0/24 -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s 10.20.0.0/24 -o vmbr0 -j MASQUERADE
```

### 4. dnsmasq untuk DHCP Reservation

Install dan konfigurasi di host PVE (atau server terpisah di jaringan yang sama):

```bash
apt install dnsmasq

# /etc/dnsmasq.conf
interface=vmbr1
bind-interfaces
dhcp-range=10.20.0.2,10.20.0.254,12h
conf-dir=/etc/dnsmasq.d/,*.conf
```

API akan otomatis menulis file reservation ke `/etc/dnsmasq.d/` dan reload dnsmasq saat VM dibuat. Pastikan user yang menjalankan API punya akses `sudo systemctl reload dnsmasq` tanpa password:

```bash
# /etc/sudoers.d/langitnode-dnsmasq
langitnode ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload dnsmasq
```

---

## Mikrotik Setup (untuk NAT VM)

### Aktifkan API

Di WinBox: **IP → Services → api** → enable, set port 8728.

### Buat user terbatas

```
/user add name=langitnode-api password=xxx group=write
```

API akan otomatis menambah/menghapus rule `/ip firewall nat` untuk port forwarding SSH (port `220XX` → `22` ke IP internal VM).

---

## Midtrans Setup

1. Daftar di https://midtrans.com
2. Aktifkan Snap API
3. Salin **Server Key** dan **Client Key** dari dashboard
4. Set webhook URL di Midtrans dashboard:
   ```
   https://langitnode.id/api/v1/payment/webhook
   ```
5. Ganti `.env` ke production key saat siap live:
   ```env
   MIDTRANS_IS_PRODUCTION="true"
   MIDTRANS_SERVER_KEY="Mid-server-xxxx"  # tanpa SB-
   ```

---

## Perintah Berguna

```bash
# Lihat semua log sekaligus
docker compose logs -f

# Restart satu service
docker compose restart api

# Masuk ke container API
docker compose exec api sh

# Run migration di container
docker compose exec api npx prisma migrate deploy

# Buka Prisma Studio dari luar container
pnpm db:studio

# Build ulang satu image
docker compose build api --no-cache
```

---

## Variabel Environment Lengkap

| Variable | Keterangan | Contoh |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret untuk token user (min 32 char) | random string |
| `JWT_EXPIRES_IN` | Masa berlaku access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Masa berlaku refresh token | `7d` |
| `ADMIN_JWT_SECRET` | Secret untuk token admin (beda dari user) | random string |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PROXMOX_HOST` | IP/hostname Proxmox | `10.10.10.250` |
| `PROXMOX_PORT` | Port Proxmox API | `8006` |
| `PROXMOX_TOKEN_ID` | API token ID | `langitnode@pve!token-name` |
| `PROXMOX_TOKEN_SECRET` | API token secret (UUID) | `b6665bf4-...` |
| `PROXMOX_NODE` | Nama node default | `pve` |
| `PROXMOX_VERIFY_SSL` | Verifikasi SSL cert | `false` |
| `MIKROTIK_HOST` | IP Mikrotik | `10.10.10.1` |
| `MIKROTIK_USER` | User API Mikrotik | `langitnode-api` |
| `MIKROTIK_PASS` | Password user Mikrotik | — |
| `NAT_BRIDGE` | Bridge untuk VM NAT | `vmbr1` |
| `NAT_GATEWAY` | Gateway subnet NAT | `10.20.0.1` |
| `PUBLIC_BRIDGE` | Bridge untuk VM Public IP | `vmbr0` |
| `MIDTRANS_SERVER_KEY` | Server key Midtrans | `SB-Mid-server-xxxx` |
| `MIDTRANS_CLIENT_KEY` | Client key Midtrans | `SB-Mid-client-xxxx` |
| `MIDTRANS_IS_PRODUCTION` | Mode produksi Midtrans | `false` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | Email pengirim | `noreply@langitnode.id` |
| `SMTP_PASS` | Password / app password | — |
| `EMAIL_FROM` | Nama + email pengirim | `Langit Node <noreply@...>` |
| `FRONTEND_URL` | URL user portal (untuk CORS) | `http://localhost:3001` |
| `ADMIN_URL` | URL admin panel (untuk CORS) | `http://localhost:3002` |

---

## Arsitektur Flow: Provisioning VM

```
User klik "Deploy VM"
    │
    ▼
POST /api/v1/vms
    │  (cek saldo, generate displayId atomic, deduct balance)
    │
    ▼
BullMQ queue: vm-provision
    │
    ├─ Alokasi IP NAT (SELECT FOR UPDATE, race-free)
    ├─ Proxmox: createVm dari template cloud-init
    ├─ dnsmasq: tambah DHCP reservation (MAC → IP fixed)
    ├─ Mikrotik: tambah dst-nat rule (port 220XX → VM:22)
    ├─ Proxmox: startVm
    ├─ Tunggu QEMU guest agent ready
    ├─ Set root password via guest agent
    ├─ Set hostname via guest agent
    └─ Update status DB → running, kirim email
```

## Arsitektur Flow: Billing

```
@Cron setiap jam
    │
    ├─ Ambil semua VM running
    ├─ Deduct saldo user sesuai harga paket/jam
    ├─ Jika saldo < threshold → kirim email peringatan
    └─ Jika saldo < 0 → suspend VM + disable Mikrotik forward

@Cron setiap hari jam 02:00
    └─ Hapus VM yang sudah 3 hari sejak suspend (grace period)
```
