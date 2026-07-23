# NOVA — Node Orchestration & Virtualization Architecture

Self-service IaaS VPS platform berbasis Proxmox VE. User bisa deploy, manage, dan bayar VM sendiri lewat portal web — mirip DigitalOcean/Hetzner, tapi jalan di atas infrastruktur Proxmox milik sendiri.

> **Versi**: NOVA Andromeda v1.0 · Stack: NestJS + Next.js 14 + Proxmox VE 9

---

## Fitur Utama

- **Self-service VM** — deploy, start/stop/reboot, hapus VM dari portal
- **Terminal browser** — xterm.js via SSH langsung ke `qm terminal` (no noVNC required)
- **noVNC console** — akses display VGA VM
- **Billing prepaid** — potong saldo per jam, suspend otomatis jika saldo habis
- **NAT networking** — alokasi IP + SSH port forwarding via MikroTik
- **Cloud-init** — set hostname + root password otomatis saat provisioning
- **Admin panel** — manage VM, user, paket, keuangan, tiket support
- **Notifikasi email** — VM ready, invoice, peringatan saldo

---

## Arsitektur

```
Proxmox Host
├── LXC nova-app (CT 100) ─── Docker
│   ├── nova-api      NestJS + Prisma     :3000
│   ├── nova-web      Next.js user portal :3001
│   ├── nova-admin    Next.js admin panel :3002
│   ├── PostgreSQL 16                     :5432
│   ├── Redis 7                           :6379
│   └── cloudflared   Cloudflare Tunnel
├── KVM VMs           (VM user yang di-deploy)
└── vmbr1 bridge      NAT subnet 10.20.0.0/24
```

Routing domain:

| Subdomain | App | Catatan |
|---|---|---|
| `app.domain.com` | User portal | login, VM dashboard |
| `admin.domain.com` | Admin panel | superadmin only |
| `api.domain.com` | REST API + WS | semua request frontend |

---

## Quick Start — Urutan Install

```
1. Proxmox host  →  buat API token + bridge vmbr1 + VM template
2. Proxmox host  →  buat LXC Debian 13 untuk NOVA app
3. Di dalam LXC  →  install Docker
4. Di dalam LXC  →  clone repo + isi .env + docker compose up --build
5. Di dalam LXC  →  db:push + seed database (setup pertama kali)
6. Browser       →  login admin, ganti password, isi System Config
7. Cloudflare    →  buat tunnel, copy token ke .env, start cloudflared
```

---

## Prasyarat

- **Proxmox VE 9.x** (diinstall di server/baremetal)
- **MikroTik RouterOS** dengan API aktif — untuk NAT VM (opsional jika pakai public IP)
- **Domain** yang sudah diarahkan ke Cloudflare
- **Akses SSH root** ke Proxmox host

---

## Instalasi

---

## Cara 0 — Jika Sudah Punya Docker & Cloudflare Tunnel (Paling Cepat)

Gunakan cara ini jika Docker sudah terinstall di LXC/server dan Cloudflare Tunnel sudah berjalan.

### Langkah 1 — Clone Repo

```bash
git clone https://github.com/asaptr/nova-platform.git /opt/nova
cd /opt/nova
```

### Langkah 2 — Isi Semua Environment Variable

**API** (`apps/api/.env`):

```bash
nano apps/api/.env
```

```env
# Database — otomatis jika pakai Docker Compose
DATABASE_URL="postgresql://nova:nova_dev@postgres:5432/nova"

# JWT — generate dengan: openssl rand -hex 32
JWT_SECRET="isi-random-string-minimal-32-karakter"
ADMIN_JWT_SECRET="isi-string-berbeda-dari-jwt-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Redis — otomatis jika pakai Docker Compose
REDIS_HOST="redis"
REDIS_PORT="6379"

# Proxmox
PROXMOX_HOST="https://IP_PROXMOX:8006"
PROXMOX_TOKEN_ID="nova@pve!nova-token"
PROXMOX_TOKEN_SECRET="uuid-token-dari-proxmox"
PROXMOX_NODE="pve"
PROXMOX_VERIFY_SSL="false"

# SSH ke Proxmox (untuk terminal VM)
PROXMOX_SSH_USER="root"
PROXMOX_SSH_PASSWORD="password-root-proxmox"

# CORS — WAJIB diisi sesuai subdomain Cloudflare kamu
FRONTEND_URL="https://app.domain.com"
ADMIN_URL="https://admin.domain.com"

# Email (opsional, untuk notifikasi)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="email@domain.com"
SMTP_PASS="app-password-gmail"
EMAIL_FROM="NOVA <noreply@domain.com>"

NODE_ENV="production"
```

**Frontend** (sesuaikan dengan subdomain API kamu):

```bash
echo 'NEXT_PUBLIC_API_URL=https://api.domain.com/api/v1' > apps/web/.env.local
echo 'NEXT_PUBLIC_API_URL=https://api.domain.com/api/v1' > apps/admin/.env.local
```

**Cloudflare Tunnel** (file `.env` di root `/opt/nova`):

```bash
echo 'CLOUDFLARE_TUNNEL_TOKEN=token-panjang-dari-cloudflare-dashboard' > /opt/nova/.env
```

> Token bisa didapat dari Cloudflare Zero Trust → Networks → Tunnels → Create/pilih tunnel → Install connector → Docker → salin token.

### Langkah 3 — Pastikan Cloudflare Tunnel Sudah Diatur

Di Cloudflare dashboard → tunnel → **Public Hostnames**, tambahkan:

| Subdomain | Domain | Service |
|---|---|---|
| `api` | `domain.com` | `http://localhost:3000` |
| `app` | `domain.com` | `http://localhost:3001` |
| `admin` | `domain.com` | `http://localhost:3002` |

> **WebSocket** (untuk terminal): Cloudflare dashboard → pilih domain → **Network** → aktifkan **WebSockets: ON**.

### Langkah 4 — Build & Jalankan

```bash
cd /opt/nova
docker compose up -d --build
```

Build pertama kali memakan waktu ±5–10 menit. Pantau progress:

```bash
docker compose ps
docker compose logs -f api
```

Tunggu sampai semua container `Up` dan API log menampilkan `NOVA API running on port 3000`.

### Langkah 5 — Setup Database (Pertama Kali)

```bash
# Buat semua tabel di database
docker compose run --rm --entrypoint sh api -c "npx --yes prisma@5.14.0 db push"
```

Lalu jalankan seed untuk buat admin user dan paket default:

```bash
cat > /tmp/seed.js << 'EOF'
const bcrypt = require('/app/node_modules/bcrypt');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('Admin@123!', 12);
  await prisma.adminUser.upsert({
    where: { email: 'superadmin@nova.local' },
    update: {},
    create: { email: 'superadmin@nova.local', passwordHash: hash, role: 'superadmin' }
  });
  await prisma.package.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Nano NAT',     ipType: 'nat',    vcpu: 1, ramMb: 512,  diskGb: 10, bandwidthGb: 100, priceHourly: 50,  priceMonthly: 36000  },
      { name: 'Micro NAT',    ipType: 'nat',    vcpu: 1, ramMb: 1024, diskGb: 20, bandwidthGb: 200, priceHourly: 100, priceMonthly: 72000  },
      { name: 'Small Public', ipType: 'public', vcpu: 2, ramMb: 2048, diskGb: 40, bandwidthGb: 500, priceHourly: 300, priceMonthly: 216000 }
    ]
  });
  console.log('Seed selesai!');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
EOF

docker compose run --rm -v /tmp/seed.js:/seed.js --entrypoint node api /seed.js
```

### Langkah 6 — Login Admin

Buka `https://admin.domain.com` → login:
- **Email**: `superadmin@nova.local`
- **Password**: `Admin@123!`

Segera ganti password setelah login pertama.

---

## Cara 1 — Docker Compose dari Awal (Fresh Install)

### Langkah 1 — Buat LXC Container di Proxmox

SSH ke Proxmox host, buat LXC Debian 13:

```bash
# Download template Debian 13
pveam update
pveam download local debian-13-standard_13.6-1_amd64.tar.zst

# Buat LXC: 2 CPU, 4GB RAM, 40GB disk
pct create 100 local:vztmpl/debian-13-standard_13.6-1_amd64.tar.zst \
  --hostname nova-app \
  --cores 2 \
  --memory 4096 \
  --swap 1024 \
  --rootfs local-lvm:40 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1

# Masuk ke LXC
pct enter 100
```

> **Tip**: Jika pakai NAT, ganti `bridge=vmbr0,ip=dhcp` dengan `bridge=vmbr1,ip=10.20.0.X/24,gw=10.20.0.1`

### Langkah 2 — Install Docker di LXC

```bash
apt update && apt install -y ca-certificates curl gnupg git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

docker --version
docker compose version
```

### Langkah 2b — Install Portainer (Docker GUI, opsional)

```bash
docker volume create portainer_data
docker run -d \
  --name portainer \
  --restart=always \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Akses di: `https://IP_LXC:9443`

### Langkah 3 — Clone & Setup

Ikuti **Cara 0 Langkah 1–6** di atas.

---

## Setup Proxmox

### 0. Update Proxmox setelah fresh install

```bash
# Nonaktifkan repo enterprise
find /etc/apt/sources.list.d/ -name "*enterprise*" -delete
find /etc/apt/sources.list.d/ -name "*ceph*" -delete

# Tambah repo community — PVE 9 berbasis Debian Trixie
echo "deb http://download.proxmox.com/debian/pve trixie pve-no-subscription" \
  > /etc/apt/sources.list.d/pve-community.list

apt update && apt full-upgrade -y
```

### Buat API Token untuk NOVA

SSH ke Proxmox host:

```bash
export LC_ALL=C   # hindari warning locale

# Buat user PVE
pveum user add nova@pve --comment "NOVA API User"

# Buat role dengan permission yang dibutuhkan
pveum role add NOVARole -privs \
  "VM.Allocate VM.Clone VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit \
   VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network \
   VM.Config.Options VM.Console VM.Migrate VM.PowerMgmt \
   VM.Snapshot VM.Snapshot.Rollback Datastore.AllocateSpace \
   Datastore.AllocateTemplate Datastore.Audit SDN.Use Sys.Audit"

# Assign role ke seluruh datacenter
pveum aclmod / -user nova@pve -role NOVARole

# Buat API token (catat output — hanya tampil SEKALI!)
pveum user token add nova@pve nova-token --privsep=0
```

Output:
```
┌──────────────┬──────────────────────────────────────┐
│ key          │ value                                │
╞══════════════╪══════════════════════════════════════╡
│ full-tokenid │ nova@pve!nova-token                  │
│ value        │ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │
└──────────────┴──────────────────────────────────────┘
```

- `full-tokenid` → `PROXMOX_TOKEN_ID` di `.env`
- `value` → `PROXMOX_TOKEN_SECRET` di `.env`

Setelah update `.env`:
```bash
docker compose restart api
```

### Buat Bridge vmbr1 untuk NAT VM (opsional)

Edit `/etc/network/interfaces` di Proxmox host:

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

```bash
ifup vmbr1
apt install -y iptables-persistent
netfilter-persistent save
```

### Buat VM Template Cloud-Init

```bash
# Download cloud image Debian 13
wget -O /var/lib/vz/template/iso/debian-13-genericcloud-amd64.qcow2 \
  https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2

# Buat VM template (VMID 9000)
qm create 9000 --name debian-13-template --memory 1024 --cores 1 --net0 virtio,bridge=vmbr0
qm importdisk 9000 /var/lib/vz/template/iso/debian-13-genericcloud-amd64.qcow2 local-lvm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --boot c --bootdisk scsi0
qm set 9000 --serial0 socket --vga std
qm set 9000 --agent enabled=1
qm template 9000
```

Gunakan VMID `9000` sebagai template saat buat paket di admin panel.

---

## Setup Domain via Cloudflare Tunnel

Cloudflare Tunnel sudah termasuk di `docker-compose.yml` sebagai service `cloudflared`.

### 1. Buat Tunnel di Cloudflare Dashboard

1. Buka [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. **Networks → Tunnels → Create a tunnel**
3. Pilih **Cloudflared** → beri nama (misal: `nova`)
4. Pilih environment **Docker** → salin **tunnel token**
5. Klik **Next** → setup **Public Hostnames**:

| Subdomain | Domain | Service |
|---|---|---|
| `api` | `domain.com` | `http://localhost:3000` |
| `app` | `domain.com` | `http://localhost:3001` |
| `admin` | `domain.com` | `http://localhost:3002` |

> **WebSocket**: Cloudflare dashboard → pilih domain → **Network** → **WebSockets: ON** (wajib untuk terminal VM).

### 2. Tambah Token ke .env

```bash
echo 'CLOUDFLARE_TUNNEL_TOKEN=token-panjang-dari-dashboard' > /opt/nova/.env
```

### 3. Jalankan

```bash
docker compose up -d cloudflared
docker compose logs -f cloudflared
```

Status tunnel akan berubah jadi **Healthy** di Cloudflare dashboard dalam beberapa detik.

---

## Setup MikroTik (opsional — untuk NAT VM)

### Aktifkan API MikroTik

Di WinBox: **IP → Services → api** → enable, port `8728`.

### Buat user API terbatas

```
/user add name=nova-api password=PASSWORD_KUAT group=write
```

---

## Konfigurasi Post-Install

### Login Admin Pertama

Buka `https://admin.domain.com`:
- **Email**: `superadmin@nova.local`
- **Password**: `Admin@123!`

**Segera ganti password** setelah login pertama.

### Setup System Config via Admin Panel

Masuk ke **Sistem → Pengaturan Sistem**:

1. **Branding** — nama platform, tagline, logo
2. **Domain** — isi semua subdomain
3. **Proxmox** — host, node, token ID & secret
4. **MikroTik & NAT** — jika pakai VM NAT

### Buat Paket VM

**Admin → Paket** → tambah paket:
- Nama, deskripsi, harga/jam
- vCPU, RAM (MB), disk (GB)
- Template VMID (misal: `9000` untuk Debian 13 template)

### Setup Midtrans (Payment)

1. Daftar di [sandbox.midtrans.com](https://sandbox.midtrans.com)
2. Ambil Server Key & Client Key
3. Set webhook URL: `https://api.domain.com/api/v1/payment/webhook`
4. Update `apps/api/.env`:
   ```env
   MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
   MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"
   MIDTRANS_IS_PRODUCTION="false"
   ```

---

## Variabel Environment Lengkap

| Variable | Keterangan | Contoh |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://nova:pass@postgres:5432/nova` |
| `JWT_SECRET` | Secret token user (min 32 char) | `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Masa berlaku access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Masa berlaku refresh token | `7d` |
| `ADMIN_JWT_SECRET` | Secret token admin (beda dari JWT_SECRET) | random hex |
| `REDIS_HOST` | Redis host | `redis` |
| `REDIS_PORT` | Redis port | `6379` |
| `PROXMOX_HOST` | URL Proxmox (dengan https & port) | `https://10.10.10.250:8006` |
| `PROXMOX_TOKEN_ID` | API token ID | `nova@pve!nova-token` |
| `PROXMOX_TOKEN_SECRET` | API token secret (UUID) | `b6665bf4-...` |
| `PROXMOX_NODE` | Nama node default | `pve` |
| `PROXMOX_VERIFY_SSL` | Verifikasi SSL cert Proxmox | `false` |
| `PROXMOX_SSH_USER` | User SSH ke Proxmox host | `root` |
| `PROXMOX_SSH_PASSWORD` | Password SSH Proxmox | — |
| `MIKROTIK_HOST` | IP MikroTik | `10.10.10.1` |
| `MIKROTIK_USER` | User API MikroTik | `nova-api` |
| `MIKROTIK_PASS` | Password user MikroTik | — |
| `NAT_BRIDGE` | Bridge untuk VM NAT | `vmbr1` |
| `NAT_GATEWAY` | Gateway subnet NAT | `10.20.0.1` |
| `NAT_PUBLIC_IP` | IP publik untuk SSH forwarding | `103.x.x.x` |
| `PUBLIC_BRIDGE` | Bridge untuk VM public IP | `vmbr0` |
| `MIDTRANS_SERVER_KEY` | Server key Midtrans | `SB-Mid-server-xxxx` |
| `MIDTRANS_CLIENT_KEY` | Client key Midtrans | `SB-Mid-client-xxxx` |
| `MIDTRANS_IS_PRODUCTION` | Mode produksi Midtrans | `false` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | Email pengirim | `noreply@domain.com` |
| `SMTP_PASS` | Password / app password | — |
| `EMAIL_FROM` | Nama + email pengirim | `NOVA <noreply@domain.com>` |
| `FRONTEND_URL` | URL user portal — **wajib untuk CORS** | `https://app.domain.com` |
| `ADMIN_URL` | URL admin panel — **wajib untuk CORS** | `https://admin.domain.com` |
| `NODE_ENV` | Environment | `production` |

---

## Perintah Berguna

### Docker Compose

```bash
cd /opt/nova

# Status semua container
docker compose ps

# Logs
docker compose logs -f api
docker compose logs -f web
docker compose logs -f admin

# Restart service tertentu
docker compose restart api

# Update & rebuild setelah git pull
git pull origin main
docker compose up -d --build api

# Masuk ke container
docker compose exec api sh
docker compose exec postgres psql -U nova
```

### Database

```bash
# Buat/update tabel (jalankan setelah perubahan schema)
docker compose run --rm --entrypoint sh api -c "npx --yes prisma@5.14.0 db push"

# Seed ulang (admin user + paket default)
cat > /tmp/seed.js << 'EOF'
const bcrypt = require('/app/node_modules/bcrypt');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('Admin@123!', 12);
  await prisma.adminUser.upsert({
    where: { email: 'superadmin@nova.local' },
    update: {},
    create: { email: 'superadmin@nova.local', passwordHash: hash, role: 'superadmin' }
  });
  console.log('Seed selesai!');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
EOF
docker compose run --rm -v /tmp/seed.js:/seed.js --entrypoint node api /seed.js
```

---

## Troubleshooting

### Login admin gagal "Login gagal"

Pastikan `FRONTEND_URL` dan `ADMIN_URL` sudah diisi di `apps/api/.env` sesuai subdomain Cloudflare. Kedua env ini mengontrol CORS — tanpanya, browser memblokir request ke API. Setelah diisi:

```bash
docker compose restart api
```

### API container Restarting terus

Cek log:
```bash
docker logs nova-api --tail 50
```

Jika error `Cannot find module`, rebuild dengan `--no-cache`:
```bash
docker compose build --no-cache api
docker compose up -d api
```

### Terminal VM tidak muncul / error

Terminal menggunakan SSH dari API server ke Proxmox host (`qm terminal VMID`). Pastikan:
1. `PROXMOX_SSH_USER` dan `PROXMOX_SSH_PASSWORD` sudah diisi di `.env`
2. API server bisa reach Proxmox via SSH: `ssh root@PROXMOX_HOST`
3. VM sudah punya `serial0: socket` — aktifkan di admin panel → VM → Enable Serial Console → reboot VM

### WebSocket terminal terputus via Cloudflare

Cloudflare dashboard → pilih domain → **Network** → aktifkan **WebSockets**.

### Proxmox token error locale warning

```bash
export LC_ALL=C
```

Jalankan perintah `pveum` setelah set env ini.

### VM creation gagal "VM XXXX already exists"

Pastikan API token punya permission `VM.Allocate` dan `Datastore.AllocateSpace`. Cek log:

```bash
docker compose logs api | grep "vmid"
```

---

## Stack Lengkap

| Lapisan | Teknologi |
|---|---|
| Monorepo | Turborepo + pnpm v11 workspaces |
| Backend | NestJS + Prisma + PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Frontend | Next.js 14 App Router + Tailwind CSS |
| Terminal | xterm.js + SSH → `qm terminal` |
| Hypervisor | Proxmox VE 9.x (API Token auth) |
| NAT networking | MikroTik RouterOS API + dnsmasq |
| Payment | Midtrans Snap |
| Email | SMTP (nodemailer) |
| Deployment | LXC + Docker Compose |
| Domain | Cloudflare Tunnel |
