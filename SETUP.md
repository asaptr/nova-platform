# NOVA — Fresh Install Setup Guide

> NOVA (Node Orchestration & Virtualization Architecture) — Self-service IaaS VPS platform berbasis Proxmox.
> Panduan ini mencakup setup dari awal: Proxmox fresh install → LXC app server → deploy NOVA.

---

## Prasyarat

- Server/baremetal dengan Proxmox VE 8.x ter-install
- MikroTik RouterOS dengan API aktif (untuk VM NAT)
- Domain + DNS yang bisa dikonfigurasi
- Akses SSH ke Proxmox host

---

## Bagian 1 — Konfigurasi Proxmox Host

### 1.1 Update Proxmox setelah fresh install

```bash
# Nonaktifkan repo enterprise (butuh subscription)
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/pve-enterprise.list
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/ceph.list

# Tambah repo community (free)
echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" \
  > /etc/apt/sources.list.d/pve-community.list

apt update && apt full-upgrade -y
```

### 1.2 Buat bridge vmbr1 untuk VM NAT

Edit `/etc/network/interfaces` — tambahkan di bawah konfigurasi vmbr0 yang sudah ada:

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

Terapkan tanpa reboot:
```bash
ifup vmbr1
```

Verifikasi:
```bash
ip addr show vmbr1      # harus muncul 10.20.0.1/24
ping -c 2 8.8.8.8       # harus berhasil dari host
```

### 1.3 Install iptables-persistent (agar rule NAT survive reboot)

```bash
apt install -y iptables-persistent
netfilter-persistent save
```

### 1.4 Buat user & API token Proxmox untuk NOVA

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

# Assign role ke user (scope: seluruh datacenter)
pveum aclmod / -user nova@pve -role NOVARole

# Buat API token (catat secret yang muncul — hanya tampil sekali!)
pveum user token add nova@pve nova-token --privsep=0
```

Output token akan terlihat seperti:
```
┌──────────────┬──────────────────────────────────────┐
│ key          │ value                                │
╞══════════════╪══════════════════════════════════════╡
│ full-tokenid │ nova@pve!nova-token                  │
│ info         │ {"privsep":"0"}                      │
│ value        │ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx │
└──────────────┴──────────────────────────────────────┘
```

Simpan `full-tokenid` dan `value` — akan dipakai di `.env`.

### 1.5 Buat VM Template Cloud-Init

Ini adalah template yang akan di-clone setiap kali user deploy VM baru.

```bash
# Download image Ubuntu 22.04 Cloud-Init
wget -O /tmp/ubuntu-22.04-cloud.img \
  https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Buat VM kosong sebagai template
qm create 9000 \
  --name ubuntu-22.04-cloudinit \
  --memory 1024 \
  --cores 1 \
  --net0 virtio,bridge=vmbr0 \
  --agent enabled=1 \
  --ostype l26

# Import disk ke storage (ganti "local-lvm" sesuai storage Proxmox kamu)
qm importdisk 9000 /tmp/ubuntu-22.04-cloud.img local-lvm

# Konfigurasi disk dan boot
qm set 9000 \
  --scsihw virtio-scsi-pci \
  --scsi0 local-lvm:vm-9000-disk-0,discard=on \
  --ide2 local-lvm:cloudinit \
  --boot order=scsi0 \
  --vga std \
  --serial0 socket

# Jadikan template
qm template 9000

# Bersihkan file download
rm /tmp/ubuntu-22.04-cloud.img
```

**Penting:** Template ini harus sudah include `qemu-guest-agent`. Cara install ke template yang sudah ada:

```bash
# Aktifkan volume LVM (jika perlu)
lvchange -ay -K pve/vm-9000-disk-0

# Mount dan install guest agent
virt-customize -a /dev/pve/vm-9000-disk-0 \
  --install qemu-guest-agent \
  --run-command "systemctl enable qemu-guest-agent"
```

Atau buat image baru dari cloud image yang sudah include guest agent (Ubuntu cloud images sudah include ini by default).

### 1.6 Buat VM Template Debian 12 (opsional)

```bash
wget -O /tmp/debian-12-cloud.img \
  https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.raw

qm create 9001 \
  --name debian-12-cloudinit \
  --memory 1024 \
  --cores 1 \
  --net0 virtio,bridge=vmbr0 \
  --agent enabled=1 \
  --ostype l26

qm importdisk 9001 /tmp/debian-12-cloud.img local-lvm

qm set 9001 \
  --scsihw virtio-scsi-pci \
  --scsi0 local-lvm:vm-9001-disk-0,discard=on \
  --ide2 local-lvm:cloudinit \
  --boot order=scsi0 \
  --vga std

qm template 9001
rm /tmp/debian-12-cloud.img
```

---

## Bagian 2 — Buat LXC Container untuk App Server

NOVA berjalan di LXC container di atas Proxmox yang sama (bukan di server terpisah untuk fase awal).

### 2.1 Download CT template

Di Proxmox UI: **local → CT Templates → Templates** — download `debian-12-standard`.

Atau via CLI:
```bash
pveam update
pveam download local debian-12-standard_12.7-1_amd64.tar.zst
```

### 2.2 Buat LXC container

```bash
pct create 100 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname nova-app \
  --rootfs local-lvm:20 \
  --memory 2048 \
  --cores 2 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --nameserver 1.1.1.1 \
  --password "ganti-password-root-lxc-ini" \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1
```

Untuk setup IP statis (rekomendasi):
```bash
pct set 100 --net0 name=eth0,bridge=vmbr0,ip=10.10.10.100/24,gw=10.10.10.1
```

Masuk ke container:
```bash
pct exec 100 -- bash
# atau setelah set IP statis:
ssh root@10.10.10.100
```

### 2.3 Install dependencies di dalam LXC

```bash
apt update && apt install -y curl git build-essential

# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verifikasi
node -v    # harus v20.x.x
npm -v

# pnpm
npm install -g pnpm@11
pnpm -v    # harus 11.x.x

# PM2 (process manager)
npm install -g pm2

# PostgreSQL 16
apt install -y postgresql postgresql-contrib

# Redis
apt install -y redis-server

# Nginx
apt install -y nginx

# Utilitas tambahan
apt install -y htop curl wget unzip
```

### 2.4 Konfigurasi PostgreSQL

```bash
# Start PostgreSQL
systemctl enable postgresql && systemctl start postgresql

# Buat user dan database NOVA
su - postgres -c "psql" <<EOF
CREATE USER nova WITH PASSWORD 'ganti-password-db-ini';
CREATE DATABASE nova OWNER nova;
GRANT ALL PRIVILEGES ON DATABASE nova TO nova;
EOF
```

### 2.5 Konfigurasi Redis

```bash
# Aktifkan Redis dan pastikan berjalan di localhost saja
sed -i 's/^# bind 127.0.0.1/bind 127.0.0.1/' /etc/redis/redis.conf
systemctl enable redis-server && systemctl start redis-server

# Verifikasi
redis-cli ping   # harus balas: PONG
```

---

## Bagian 3 — Deploy NOVA

### 3.1 Clone repository

```bash
cd /opt
git clone https://github.com/asaptr/nova-platform.git nova-platform
cd nova-platform
```

Atau jika dari lokal:
```bash
# Upload ke server via scp
scp -r /path/to/nova root@10.10.10.100:/opt/nova-platform
```

### 3.2 Install dependencies

```bash
cd /opt/nova-platform-platform
pnpm install
```

### 3.3 Konfigurasi environment API

```bash
cp apps/api/.env apps/api/.env.backup
nano apps/api/.env
```

Isi dengan nilai yang sesuai:

```env
# Database
DATABASE_URL="postgresql://nova:ganti-password-db-ini@localhost:5432/nova"

# JWT — WAJIB ganti dengan random string yang kuat!
JWT_SECRET="$(openssl rand -hex 32)"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
ADMIN_JWT_SECRET="$(openssl rand -hex 32)"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"

# Proxmox
PROXMOX_HOST="10.10.10.250"        # IP Proxmox host
PROXMOX_PORT="8006"
PROXMOX_TOKEN_ID="nova@pve!nova-token"
PROXMOX_TOKEN_SECRET="uuid-token-dari-langkah-1.4"
PROXMOX_NODE="pve"
PROXMOX_VERIFY_SSL="false"

# MikroTik
MIKROTIK_HOST="10.10.10.1"         # IP MikroTik
MIKROTIK_USER="nova-api"
MIKROTIK_PASS="password-user-mikrotik"

# VM NAT networking
NAT_BRIDGE="vmbr1"
NAT_GATEWAY="10.20.0.1"
NAT_PUBLIC_IP="103.x.x.x"          # IP publik server/MikroTik

# VM Public networking
PUBLIC_BRIDGE="vmbr0"

# Midtrans
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"
MIDTRANS_IS_PRODUCTION="false"

# Email SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="app-password-gmail"
EMAIL_FROM="NOVA <noreply@yourdomain.com>"

# App URLs
PORT=3000
NODE_ENV="production"
FRONTEND_URL="https://app.yourdomain.com"
ADMIN_URL="https://admin.yourdomain.com"
```

Generate JWT secrets secara aman:
```bash
openssl rand -hex 32   # jalankan 2x, pakai hasilnya untuk JWT_SECRET dan ADMIN_JWT_SECRET
```

### 3.4 Konfigurasi environment Frontend

```bash
# User portal
echo 'NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1' > apps/web/.env.local

# Admin panel
echo 'NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1' > apps/admin/.env.local
```

### 3.5 Setup database

```bash
cd /opt/nova-platform

# Push schema ke database (non-interactive, cocok untuk production)
pnpm db:push

# Seed data awal (superadmin + default system config)
pnpm db:seed
```

Default superadmin setelah seed:
```
Email:    superadmin@nova.local
Password: Admin@123!
```

**Ganti password superadmin segera setelah login pertama kali.**

### 3.6 Build semua aplikasi

```bash
cd /opt/nova-platform
pnpm build
```

Proses build akan menghasilkan:
- `apps/api/dist/` — compiled NestJS
- `apps/web/.next/` — compiled Next.js user portal
- `apps/admin/.next/` — compiled Next.js admin panel

### 3.7 Konfigurasi PM2

Buat file `ecosystem.config.js` di root project:

```bash
cat > /opt/nova-platform/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'nova-api',
      cwd: '/opt/nova-platform/apps/api',
      script: 'node',
      args: 'dist/main.js',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 1,
      exec_mode: 'fork',
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'nova-web',
      cwd: '/opt/nova-platform/apps/web',
      script: 'node',
      args: 'node_modules/.bin/next start -p 3001',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'nova-admin',
      cwd: '/opt/nova-platform/apps/admin',
      script: 'node',
      args: 'node_modules/.bin/next start -p 3002',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
EOF
```

Start dan simpan konfigurasi PM2:

```bash
cd /opt/nova-platform
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # jalankan perintah yang muncul agar PM2 auto-start saat boot
```

Verifikasi semua proses berjalan:
```bash
pm2 list
pm2 logs nova-api --lines 30
```

---

## Bagian 4 — Konfigurasi Nginx

### 4.1 Buat konfigurasi virtual host

```bash
cat > /etc/nginx/sites-available/nova << 'EOF'
# API — api.yourdomain.com
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}

# User portal — app.yourdomain.com
server {
    listen 80;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Admin panel — admin.yourdomain.com
server {
    listen 80;
    server_name admin.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/nova /etc/nginx/sites-enabled/nova
nginx -t && systemctl reload nginx
```

### 4.2 Install SSL dengan Certbot

```bash
apt install -y certbot python3-certbot-nginx

# Issue sertifikat untuk semua subdomain sekaligus
certbot --nginx \
  -d api.yourdomain.com \
  -d app.yourdomain.com \
  -d admin.yourdomain.com \
  --email admin@yourdomain.com \
  --agree-tos \
  --no-eff-email

# Verifikasi auto-renewal
certbot renew --dry-run
```

---

## Bagian 5 — Konfigurasi MikroTik

### 5.1 Aktifkan MikroTik API

Di WinBox atau terminal MikroTik:

```
/ip service enable api
/ip service set api port=8728
```

### 5.2 Buat user terbatas untuk NOVA API

```
/user add name=nova-api password=password-kuat-disini group=write
```

### 5.3 Verifikasi koneksi dari LXC

```bash
# Test dari dalam LXC container
apt install -y telnet
telnet 10.10.10.1 8728   # harus connect
```

---

## Bagian 6 — Konfigurasi Sistem NOVA

### 6.1 Login admin panel pertama kali

1. Buka `https://admin.yourdomain.com`
2. Login dengan `superadmin@nova.local` / `Admin@123!`
3. **Ganti password segera** di profil

### 6.2 Konfigurasi sistem via Admin Panel

Buka **Sistem → Pengaturan Sistem** dan isi:

**Branding:**
- Nama Brand: nama platform/perusahaan kamu (contoh: `Langit Node`) — ditampilkan di UI
- Tagline: slogan platform
- Logo URL: URL logo (opsional)
- `NOVA` adalah nama software, tidak bisa diubah dan hanya ditampilkan sebagai label.

**Domain:**
- Domain Utama: `yourdomain.com` — subdomain (`app.`, `admin.`, `api.`, `status.`, `docs.`, `changelog.`) otomatis mengikuti domain ini.

**Infrastructure — Proxmox:**
- Host: IP Proxmox
- Port: `8006`
- Node Name: `pve`
- Token ID: `nova@pve!nova-token`
- Token Secret: isi UUID token

**Infrastructure — MikroTik & NAT:**
- MikroTik Host: IP MikroTik
- MikroTik User: `nova-api`
- MikroTik Password: password yang dibuat di langkah 5.2
- NAT Bridge: `vmbr1`
- NAT Gateway: `10.20.0.1`
- NAT Public IP: IP publik server

### 6.3 Tambah paket VM

Buka **Settings → Paket** dan buat paket awal. Contoh:

| Nama | IP Type | vCPU | RAM | Disk | Harga/jam |
|---|---|---|---|---|---|
| NAT Micro | nat | 1 | 512 MB | 10 GB | Rp 14 |
| NAT Standard | nat | 2 | 2048 MB | 40 GB | Rp 35 |
| Public Starter | public | 1 | 1024 MB | 20 GB | Rp 63 |

### 6.4 Tambah OS Template

Buka **Settings → Templates** dan tambahkan template yang sudah dibuat:

| Nama | Proxmox Value | Tipe |
|---|---|---|
| Ubuntu 22.04 LTS | `9000` | clone |
| Debian 12 | `9001` | clone |

---

## Bagian 7 — Firewall & Security

### 7.1 UFW di LXC container

```bash
apt install -y ufw

# Default deny
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (ganti port jika pakai non-default)
ufw allow 22/tcp

# Allow HTTP dan HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Aktifkan
ufw enable
ufw status
```

### 7.2 Amankan Proxmox panel

Proxmox UI (port 8006) tidak boleh bisa diakses dari internet publik. Pastikan:

```bash
# Di Proxmox host — cek iptables
iptables -L INPUT | grep 8006
# Jika tidak ada rule drop, tambahkan:
iptables -I INPUT -p tcp --dport 8006 ! -s 10.0.0.0/8 -j DROP
iptables-save > /etc/iptables/rules.v4
```

Atau gunakan Cloudflare Tunnel / Wireguard untuk akses Proxmox panel secara aman.

### 7.3 SSH hardening (opsional tapi direkomendasikan)

```bash
# Di LXC container
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
# Upload SSH key terlebih dahulu sebelum menonaktifkan password auth!
systemctl restart sshd
```

---

## Bagian 8 — Monitoring & Maintenance

### 8.1 Cek status semua service

```bash
pm2 list                    # proses NOVA
systemctl status postgresql  # database
systemctl status redis-server # cache/queue
systemctl status nginx        # web server
```

### 8.2 Log aplikasi

```bash
pm2 logs nova-api --lines 100    # API logs
pm2 logs nova-web --lines 50     # User portal logs
pm2 logs nova-admin --lines 50   # Admin panel logs
```

### 8.3 Update NOVA

```bash
cd /opt/nova-platform
git pull origin main
pnpm install
pnpm build
pnpm db:push          # jika ada perubahan schema
pm2 restart all
```

### 8.4 Backup database

```bash
# Backup manual
pg_dump -U nova nova > /backup/nova-$(date +%Y%m%d).sql

# Restore jika perlu
psql -U nova nova < /backup/nova-20260101.sql
```

Setup backup otomatis via cron:
```bash
crontab -e
# Tambahkan:
0 3 * * * pg_dump -U nova nova | gzip > /backup/nova-$(date +\%Y\%m\%d).sql.gz
# Simpan 7 hari
0 4 * * * find /backup -name "nova-*.sql.gz" -mtime +7 -delete
```

---

## Checklist First-Run

Sebelum membuka platform ke user:

- [ ] Proxmox API token berfungsi (test deploy VM manual dari admin panel)
- [ ] VM template bisa di-clone dan boot
- [ ] QEMU guest agent berfungsi di template (test reset password dari admin panel)
- [ ] vmbr1 bridge berfungsi — VM NAT bisa dapat IP dan akses internet
- [ ] MikroTik API terhubung (test create VM NAT → port forward SSH tersedia)
- [ ] Nginx SSL berfungsi di semua subdomain
- [ ] Email terkirim saat register (cek SMTP)
- [ ] Billing cron berjalan — cek `pm2 logs nova-api` setiap jam
- [ ] Password superadmin sudah diganti dari default
- [ ] Akun admin tambahan sudah dibuat (jangan pakai superadmin untuk operasional harian)
- [ ] Paket VM dan OS template sudah dikonfigurasi di admin panel
- [ ] Test full flow: register user → topup manual → deploy VM → SSH → delete

---

## Troubleshooting Umum

### API tidak bisa konek ke Proxmox

```bash
# Test dari LXC container
curl -k -H "Authorization: PVEAPIToken=nova@pve!nova-token=UUID" \
  https://10.10.10.250:8006/api2/json/nodes

# Jika timeout: cek apakah 8006 reachable dari LXC
telnet 10.10.10.250 8006
```

### VM tidak bisa deploy (job gagal)

```bash
pm2 logs nova-api --lines 200   # lihat error message
# Cek BullMQ queue di Redis:
redis-cli
> KEYS bull:vm-provision:*
> LRANGE bull:vm-provision:failed 0 -1
```

### Port SSH NAT tidak terbuat di MikroTik

```bash
# Test koneksi MikroTik API dari LXC
telnet 10.10.10.1 8728
# Verifikasi credential:
# Pastikan user nova-api ada dan group=write
```

### Database connection refused

```bash
systemctl status postgresql
su - postgres -c "psql -c '\l'"   # list databases
# Test connection:
psql -U nova -h localhost nova -c '\dt'
```

### PM2 app crash loop

```bash
pm2 logs nova-api --lines 50 --err   # lihat error spesifik
# Biasanya: env variable kosong atau database tidak bisa dikoneksi
```
