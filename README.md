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
├── LXC nova-app (CT 100) ─── Docker / PM2
│   ├── nova-api      NestJS + Prisma     :3000
│   ├── nova-web      Next.js user portal :3001
│   ├── nova-admin    Next.js admin panel :3002
│   ├── PostgreSQL 16                     :5432
│   └── Redis 7                           :6379
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

Ikuti urutan ini dari awal sampai selesai:

```
1. Proxmox host  →  buat API token + bridge vmbr1 + VM template
2. Proxmox host  →  buat LXC Debian 12 untuk NOVA app
3. Di dalam LXC  →  install Docker
4. Di dalam LXC  →  clone repo + isi .env + docker compose up
5. Browser       →  db:push + db:seed (setup database pertama kali)
6. Admin panel   →  ganti password, isi System Config, buat paket VM
7. Cloudflare    →  setup Tunnel atau DNS + Nginx untuk domain
```

Detail setiap langkah ada di bagian-bagian di bawah.

---

## Prasyarat

- **Proxmox VE 9.x** (diinstall di server/baremetal)
- **MikroTik RouterOS** dengan API aktif — untuk NAT VM (opsional jika pakai public IP)
- **Domain** yang sudah diarahkan ke server (via Cloudflare atau DNS biasa)
- **Akses SSH root** ke Proxmox host

---

## Instalasi

Ada dua cara: **Docker Compose** (lebih mudah) atau **Manual / PM2** (lebih kontrol).

---

## Cara 1 — Docker Compose (Rekomendasi)

### Langkah 1 — Buat LXC Container di Proxmox

SSH ke Proxmox host, buat LXC Debian 13:

```bash
# Cek nama template Debian 13 yang tersedia
pveam update
pveam available --section system | grep debian-13

# Download template Debian 13
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

> **Tip**: Jika pakai NAT, ganti `--net0 name=eth0,bridge=vmbr0,ip=dhcp` dengan `bridge=vmbr1,ip=10.20.0.X/24,gw=10.20.0.1`

### Langkah 2 — Install Docker di LXC

```bash
# Update sistem
apt update && apt install -y ca-certificates curl gnupg

# Tambah Docker repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verifikasi
docker --version
docker compose version
```

### Langkah 3 — Clone Repo & Setup

```bash
# Clone ke /opt/nova
git clone https://github.com/asaptr/nova-platform.git /opt/nova
cd /opt/nova

# Buat env file API
cp apps/api/.env.example apps/api/.env   # atau buat manual
nano apps/api/.env
```

Isi minimal yang **wajib diubah** di `apps/api/.env`:

```env
# Database (biarkan jika pakai Docker Compose — otomatis)
DATABASE_URL="postgresql://nova:GANTI_PASSWORD_INI@postgres:5432/nova"

# JWT — generate dengan: openssl rand -hex 32
JWT_SECRET="isi-random-string-minimal-32-karakter"
ADMIN_JWT_SECRET="isi-string-berbeda-dari-jwt-secret"

# Proxmox
PROXMOX_HOST="IP_PROXMOX_HOST"          # misal: 10.10.10.250
PROXMOX_TOKEN_ID="nova@pve!nova-token"
PROXMOX_TOKEN_SECRET="uuid-token-dari-proxmox"
PROXMOX_NODE="pve"
PROXMOX_VERIFY_SSL="false"

# SSH ke Proxmox (untuk terminal VM)
PROXMOX_SSH_USER="root"
PROXMOX_SSH_PASSWORD="password-root-proxmox"
# Atau pakai key: PROXMOX_SSH_KEY="/path/to/id_rsa"

# MikroTik NAT (skip jika tidak pakai NAT)
MIKROTIK_HOST="10.10.10.1"
MIKROTIK_USER="nova-api"
MIKROTIK_PASS="password-mikrotik"
NAT_BRIDGE="vmbr1"
NAT_GATEWAY="10.20.0.1"
NAT_PUBLIC_IP="IP_PUBLIK_SERVER"

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="email@domain.com"
SMTP_PASS="app-password-gmail"
EMAIL_FROM="NOVA <noreply@domain.com>"

# URL (sesuaikan dengan domain kamu)
FRONTEND_URL="https://app.domain.com"
ADMIN_URL="https://admin.domain.com"
NODE_ENV="production"
```

Buat env untuk frontend:

```bash
# User portal
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://api.domain.com/api/v1
EOF

# Admin panel
cat > apps/admin/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://api.domain.com/api/v1
EOF
```

### Langkah 4 — Jalankan dengan Docker Compose

```bash
cd /opt/nova

# Build & jalankan semua service
docker compose up -d --build

# Cek status
docker compose ps

# Lihat log API
docker compose logs -f api
```

### Langkah 5 — Setup Database (pertama kali)

```bash
# Tunggu container api ready, lalu:
docker compose exec api npx prisma db push
docker compose exec api npx prisma db seed
```

Seed akan membuat:
- Superadmin default: `admin@domain.com` / `Admin1234!`
- Sistem config default

> **Penting**: Ganti password superadmin segera setelah pertama login via admin panel.

### Langkah 6 — Setup dnsmasq untuk DHCP NAT (jika pakai NAT)

NOVA butuh akses ke `/etc/dnsmasq.d` di host Proxmox untuk menulis DHCP reservation. Karena `nova-api` jalan di LXC, perlu bind mount:

```bash
# Di Proxmox host:
ssh root@PROXMOX_HOST

# Jika pakai dnsmasq di LXC (bukan di Proxmox host langsung),
# pastikan dnsmasq terinstall di LXC:
pct exec 100 -- apt install -y dnsmasq
```

Volume `/etc/dnsmasq.d` sudah di-mount di `docker-compose.yml`.

---

## Cara 2 — Manual dengan PM2 (git clone)

Cocok jika ingin lebih kontrol atau tidak mau pakai Docker.

### Langkah 1 — Buat LXC & Install Dependencies

Ikuti Langkah 1 di atas untuk buat LXC, lalu:

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm@11

# Install PM2
npm install -g pm2

# Install PostgreSQL 16
apt install -y postgresql postgresql-contrib

# Install Redis
apt install -y redis-server
systemctl enable --now redis-server
```

### Langkah 2 — Setup PostgreSQL

```bash
sudo -u postgres psql << 'SQL'
CREATE USER nova WITH PASSWORD 'GANTI_PASSWORD_KUAT';
CREATE DATABASE nova OWNER nova;
GRANT ALL PRIVILEGES ON DATABASE nova TO nova;
SQL
```

### Langkah 3 — Clone & Install

```bash
git clone https://github.com/asaptr/nova-platform.git /opt/nova
cd /opt/nova
pnpm install
```

### Langkah 4 — Setup Environment

Sama seperti Langkah 3 di metode Docker, tapi `DATABASE_URL` pakai `localhost`:

```env
DATABASE_URL="postgresql://nova:GANTI_PASSWORD@localhost:5432/nova"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

### Langkah 5 — Build & Migrate

```bash
cd /opt/nova
pnpm build
pnpm db:push
pnpm db:seed
```

### Langkah 6 — Jalankan dengan PM2

```bash
# Start semua service
pm2 start ecosystem.config.js

# Save supaya auto-start setelah reboot
pm2 save
pm2 startup systemd
# Jalankan perintah yang ditampilkan pm2 startup

# Cek status
pm2 list
pm2 logs nova-api --lines 50
```

### Update (setelah git pull)

```bash
cd /opt/nova
git pull origin main
pnpm install
pnpm build
pnpm db:push    # jika ada perubahan schema
pm2 restart all
```

---

## Setup Proxmox

### 0. Update Proxmox setelah fresh install

SSH ke Proxmox host, jalankan ini pertama kali setelah install:

```bash
# Nonaktifkan repo enterprise (PVE 9 memakai format .sources atau .list — cari dulu)
find /etc/apt/sources.list.d/ -name "*enterprise*" -delete
find /etc/apt/sources.list.d/ -name "*ceph*" -delete

# Tambah repo community (free) — PVE 9 berbasis Debian Trixie
echo "deb http://download.proxmox.com/debian/pve trixie pve-no-subscription" \
  > /etc/apt/sources.list.d/pve-community.list

apt update && apt full-upgrade -y
```

### Buat API Token untuk NOVA

SSH ke Proxmox host:

```bash
# Buat user PVE
pveum user add nova@pve --comment "NOVA API User"

# Buat role dengan permission yang dibutuhkan
pveum role add NOVARole -privs \
  "VM.Allocate VM.Clone VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit \
   VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network \
   VM.Config.Options VM.Console VM.Monitor VM.Migrate VM.PowerMgmt \
   VM.Snapshot VM.Snapshot.Rollback Datastore.AllocateSpace \
   Datastore.AllocateTemplate Datastore.Audit SDN.Use Sys.Audit"

# Assign role ke seluruh datacenter
pveum aclmod / -user nova@pve -role NOVARole

# Buat API token (catat output — hanya tampil sekali!)
pveum user token add nova@pve nova-token --privsep=0
```

Output token:
```
┌──────────────┬──────────────────────────────────────┐
│ key          │ value                                │
╞══════════════╪══════════════════════════════════════╡
│ full-tokenid │ nova@pve!nova-token                  │
│ value        │ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │
└──────────────┴──────────────────────────────────────┘
```

Masukkan `full-tokenid` ke `PROXMOX_TOKEN_ID` dan `value` ke `PROXMOX_TOKEN_SECRET`.

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

Terapkan:
```bash
ifup vmbr1
apt install -y iptables-persistent
netfilter-persistent save
```

### Buat VM Template Cloud-Init

Template VM yang dipakai untuk clone **wajib** punya:
- `qemu-guest-agent` terinstall dan aktif
- Format disk yang support cloud-init (qcow2/raw, bukan vmdk)

Contoh buat template Debian 13 (Trixie) minimal:

```bash
# Di Proxmox host
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

# Convert ke template
qm template 9000
```

Gunakan VMID `9000` sebagai `osTemplate` saat buat paket di admin panel.

---

## Setup Domain via Cloudflare

Ada dua opsi untuk expose NOVA ke internet:

### Opsi A — Cloudflare Tunnel (Rekomendasi untuk home lab / tanpa IP publik statis)

Tidak perlu buka port di router. Cloudflare Tunnel membuat koneksi outbound dari server ke Cloudflare.

```bash
# Di LXC nova-app — install cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' \
  | tee /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared

# Login ke Cloudflare
cloudflared tunnel login

# Buat tunnel (ganti "nova" dengan nama terserah)
cloudflared tunnel create nova

# Catat Tunnel ID yang muncul (format UUID)
```

Buat config file `/etc/cloudflared/config.yml`:

```yaml
tunnel: TUNNEL_ID_DARI_PERINTAH_DIATAS
credentials-file: /root/.cloudflared/TUNNEL_ID_DARI_PERINTAH_DIATAS.json

ingress:
  - hostname: app.domain.com
    service: http://localhost:3001
  - hostname: admin.domain.com
    service: http://localhost:3002
  - hostname: api.domain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

> **Catatan WebSocket**: Untuk terminal xterm.js, Cloudflare Tunnel mendukung WebSocket secara otomatis. Pastikan di Cloudflare dashboard → domain → Network → **WebSockets** dalam keadaan **ON**.

Buat DNS record via CLI:

```bash
cloudflared tunnel route dns nova app.domain.com
cloudflared tunnel route dns nova admin.domain.com
cloudflared tunnel route dns nova api.domain.com
```

Jalankan sebagai service:

```bash
cloudflared service install
systemctl enable --now cloudflared
systemctl status cloudflared
```

### Opsi B — Nginx + Certbot (untuk VPS dengan IP publik)

```bash
# Install Nginx & Certbot
apt install -y nginx certbot python3-certbot-nginx

# Buat konfigurasi Nginx
cat > /etc/nginx/sites-available/nova << 'EOF'
# User portal
server {
    listen 80;
    server_name app.domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}

# Admin panel
server {
    listen 80;
    server_name admin.domain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# API
server {
    listen 80;
    server_name api.domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

ln -s /etc/nginx/sites-available/nova /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Issue SSL certificate
certbot --nginx -d app.domain.com -d admin.domain.com -d api.domain.com \
  --email email@domain.com --agree-tos --non-interactive
```

Di Cloudflare dashboard: set DNS record A/CNAME ke IP server, **proxy status: DNS only** (grey cloud) agar SSL Certbot bisa verify. Setelah cert issued, bisa diaktifkan kembali jadi Proxied.

---

## Setup MikroTik (opsional — untuk NAT VM)

### Aktifkan API MikroTik

Di WinBox: **IP → Services → api** → enable, port `8728`.

### Buat user API terbatas

```
/user add name=nova-api password=PASSWORD_KUAT group=write
```

NOVA otomatis menambah/menghapus rule `/ip firewall nat` untuk SSH forwarding (port `220XX` → `22` ke IP internal VM).

---

## Konfigurasi Post-Install

### Login Admin Pertama

Buka `https://admin.domain.com` → login dengan kredensial dari seed:
- Email: `admin@domain.com`
- Password: `Admin1234!`

**Segera ganti password** di profile setelah login.

### Setup System Config via Admin Panel

Setelah login admin, masuk ke **Sistem → Pengaturan Sistem**:

1. **Branding** — nama platform, tagline, logo
2. **Domain** — isi semua subdomain (`app.domain.com`, `admin.domain.com`, dll)
3. **Proxmox** — host, node, token ID & secret (atau biarkan dari `.env`)
4. **MikroTik & NAT** — jika pakai VM NAT

### Buat Paket VM

**Admin → Paket** → tambah paket dengan:
- Nama, deskripsi, harga/jam
- vCPU, RAM (MB), disk (GB)
- Template VMID (misal: `9000` untuk Debian 12 template)

### Setup Midtrans (Payment)

1. Daftar di [sandbox.midtrans.com](https://sandbox.midtrans.com)
2. Ambil Server Key & Client Key
3. Set webhook URL: `https://api.domain.com/api/v1/payment/webhook`
4. Update `.env`:
   ```env
   MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
   MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"
   MIDTRANS_IS_PRODUCTION="false"
   ```

---

## Variabel Environment Lengkap

| Variable | Keterangan | Contoh |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://nova:pass@localhost:5432/nova` |
| `JWT_SECRET` | Secret token user (min 32 char) | `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Masa berlaku access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Masa berlaku refresh token | `7d` |
| `ADMIN_JWT_SECRET` | Secret token admin (beda dari JWT_SECRET) | random hex |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PROXMOX_HOST` | IP/hostname Proxmox | `10.10.10.250` |
| `PROXMOX_PORT` | Port Proxmox API | `8006` |
| `PROXMOX_TOKEN_ID` | API token ID | `nova@pve!nova-token` |
| `PROXMOX_TOKEN_SECRET` | API token secret (UUID) | `b6665bf4-...` |
| `PROXMOX_NODE` | Nama node default | `pve` |
| `PROXMOX_VERIFY_SSL` | Verifikasi SSL cert Proxmox | `false` |
| `PROXMOX_SSH_USER` | User SSH ke Proxmox host | `root` |
| `PROXMOX_SSH_PASSWORD` | Password SSH Proxmox | — |
| `PROXMOX_SSH_KEY` | Path private key SSH (alternatif password) | `/root/.ssh/id_rsa` |
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
| `FRONTEND_URL` | URL user portal (untuk CORS & email) | `https://app.domain.com` |
| `ADMIN_URL` | URL admin panel (untuk CORS) | `https://admin.domain.com` |
| `PORT` | Port API server | `3000` |
| `NODE_ENV` | Environment | `production` |

---

## Perintah Berguna

### Docker Compose

```bash
cd /opt/nova

# Status
docker compose ps

# Logs
docker compose logs -f api
docker compose logs -f web

# Restart service tertentu
docker compose restart api

# Update & rebuild
git pull origin main
docker compose up -d --build api   # rebuild api saja
docker compose exec api npx prisma db push

# Masuk ke container
docker compose exec api sh
docker compose exec postgres psql -U nova
```

### PM2 (jika pakai metode manual)

```bash
pm2 list
pm2 logs nova-api --lines 100
pm2 restart nova-api
pm2 reload all      # zero-downtime reload
```

### Database

```bash
# Docker
docker compose exec api npx prisma db push
docker compose exec api npx prisma db seed

# Manual
cd /opt/nova && pnpm db:push && pnpm db:seed
```

---

## Troubleshooting

### Terminal VM tidak muncul / error

Terminal menggunakan SSH dari API server ke Proxmox host (`qm terminal VMID`). Pastikan:
1. `PROXMOX_SSH_USER`, `PROXMOX_SSH_PASSWORD` atau `PROXMOX_SSH_KEY` sudah diisi di `.env`
2. API server bisa reach Proxmox host via SSH: `ssh root@PROXMOX_HOST`
3. VM sudah punya `serial0: socket` — aktifkan di admin panel → VM → Enable Serial Console → reboot VM

### VM creation gagal "VM XXXX already exists"

NOVA sudah punya fallback: scan VMID tertinggi di semua node + cross-check DB. Jika masih gagal:
- Pastikan API token punya permission `VM.Allocate` dan `Datastore.AllocateSpace`
- Cek log: `docker compose logs api | grep "next vmid"`

### WebSocket terminal terputus via Cloudflare

Di Cloudflare dashboard → pilih domain → **Network** → aktifkan **WebSockets**.
Batas timeout default Cloudflare: 100 detik idle. NOVA mengirim WebSocket ping tiap 30 detik — seharusnya cukup untuk menjaga koneksi tetap hidup.

### noVNC console tidak terhubung

noVNC pakai proxy WS ke Proxmox port 8006. Pastikan:
- Port 8006 Proxmox bisa diakses dari API server (LXC)
- `PROXMOX_VERIFY_SSL=false` jika Proxmox pakai self-signed cert

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
| Deployment | LXC + Docker Compose atau PM2 + Nginx |
| Domain | Cloudflare Tunnel atau Nginx + Certbot |
