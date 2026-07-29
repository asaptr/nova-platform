# NOVA — Node Orchestration & Virtualization Architecture

Self-service IaaS VPS platform berbasis Proxmox VE. User bisa melakukan registrasi, top-up saldo secara *prepaid*, menyewa VM, menyalakan/mematikan/reboot VM, serta mengakses SSH terminal secara langsung melalui web portal milik sendiri (seperti Hetzner/DigitalOcean).

> **Versi**: NOVA Andromeda v1.1  
> **Stack Utama**: NestJS + Next.js 14 + Proxmox VE 9 + MikroTik RouterOS API + Midtrans

---

## Fitur Utama

- 🚀 **Self-service VM** — Provisioning, start, stop, reboot, dan penghapusan VM langsung oleh user.
- 📺 **Web Console & Terminal** — Akses VGA noVNC dan SSH xterm.js langsung ke VM (`qm terminal`) dari browser.
- 💳 **Billing Prepaid** — Pemotongan saldo otomatis per jam, auto-suspend bila saldo habis, dan top-up otomatis via Midtrans.
- 🌐 **NAT & Public IP Networking** — Otomatisasi port forwarding SSH via API MikroTik dan alokasi IP Dedicated.
- ⚡ **Web Setup Wizard** — Instalasi mandiri berbasis GUI untuk setup awal brand, admin, Proxmox, dan jaringan secara instan tanpa CLI manual.
- 🔄 **Dynamic Subdomain Routing** — Pemisahan domain utama (`domain.com`), user portal (`app.domain.com`), dan admin panel (`admin.domain.com`) via template Nginx dinamis.

---

## Arsitektur Aplikasi

```
Proxmox Host
├── LXC nova-app (CT 100) ─── Docker
│   ├── Nginx Proxy   Meneruskan request berdasarkan subdomain  :80
│   ├── nova-api      NestJS + Prisma (Backend Service)        :3000
│   ├── nova-web      Next.js User Portal & Landing Page       :3001
│   ├── nova-admin    Next.js Admin Panel                      :3002
│   ├── PostgreSQL 16 Database Server                          :5432
│   ├── Redis 7       Job Queue & Cache Server                 :6379
│   └── cloudflared   Cloudflare Tunnel (Connector Zero Trust)
├── KVM VMs           (VM user yang di-deploy oleh Nova)
└── vmbr1 bridge      NAT subnet 10.20.0.0/24
```

### Pemetaan Domain & Subdomain

| Subdomain | Kegunaan | Perilaku Routing |
|---|---|---|
| `namadomain.com` | Landing Page Utama / Promosi | Dialihkan ke `app.namadomain.com` untuk login/dashboard |
| `app.namadomain.com` | User Portal & Dashboard | Menangani Registrasi, Sewa VM, Billing, & Console |
| `admin.namadomain.com` | Panel Kontrol Operator / Superadmin | Manajemen Paket, Tiket Support, Keuangan, & Sistem |
| `api.namadomain.com` | Backend REST API & WebSockets | Digunakan untuk request data dari user & admin client |

---

## Cara 1 — Instalasi Lokal untuk Development (macOS/Linux)

Gunakan cara ini untuk menguji Nova di komputer lokal Anda menggunakan Docker untuk database dan proses development lokal.

### Langkah 1 — Clone Repositori
Clone repositori terlebih dahulu ke komputer lokal Anda:
```bash
git clone https://github.com/asaptr/nova-platform.git
cd nova-platform
```

### Langkah 2 — Jalankan Dev Setup Script
Jalankan skrip setup untuk mengonfigurasi environment awal:
```bash
bash scripts/dev-setup.sh
```
Skrip ini akan otomatis melakukan:
1. Instalasi dependensi monorepo (`pnpm install`).
2. Membuat file `.env` default untuk development.
3. Menyalakan PostgreSQL dan Redis via Docker Compose.
4. Membuat database schema & generate Prisma Client.

### Langkah 3 — Jalankan Aplikasi
Jalankan dev server dengan perintah berikut:
```bash
pnpm dev
```
Aplikasi akan berjalan pada port-port berikut:
*   **Landing Page**: `http://localhost` (proxy via Nginx)
*   **User Portal**: `http://app.localhost` (proxy via Nginx)
*   **Admin Panel**: `http://admin.localhost` (proxy via Nginx)
*   **Backend API**: `http://localhost:3000`

### Langkah 4 — Jalankan Setup Wizard
Akses **`http://admin.localhost`** di browser Anda. Sistem akan mendeteksi bahwa sistem belum diinstal dan mengarahkan Anda ke **Setup Wizard** secara visual untuk mengonfigurasi Brand, Akun Admin, Proxmox, dan MikroTik.

---

## Cara 2 — Deployment Produksi (Baremetal Server)

### Langkah 1 — Buat LXC Container di Proxmox
Masuk ke host Proxmox Anda via SSH, unduh template Debian 13, lalu buat LXC khusus untuk Nova:
```bash
pveam update
pveam download local debian-13-standard_13.6-1_amd64.tar.zst

# Buat LXC: 2 Cores, 4GB RAM, 40GB Disk, nesting diaktifkan
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
```

### Langkah 3 — Clone Repositori & Setup Env
```bash
git clone https://github.com/asaptr/nova-platform.git /opt/nova
cd /opt/nova

# Konfigurasikan Domain utama Anda
echo "DOMAIN=namadomain.com" > .env
echo "APP_SUBDOMAIN=app" >> .env
echo "ADMIN_SUBDOMAIN=admin" >> .env
echo "CLOUDFLARE_TUNNEL_TOKEN=token-panjang-dari-cloudflare" >> .env

# Salin env backend dan atur JWT Secret
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```
> Pastikan mengedit `FRONTEND_URL` menjadi `https://app.namadomain.com` dan `ADMIN_URL` menjadi `https://admin.namadomain.com` di `apps/api/.env`.

### Langkah 4 — Setup Routing Cloudflare Tunnel
Pada Cloudflare Zero Trust Dashboard, arahkan subdomain berikut ke container lokal:
- `namadomain.com` & `app.namadomain.com` ➔ `http://localhost:80`
- `admin.namadomain.com` ➔ `http://localhost:80` (Atau bypass port Nginx untuk admin: `http://localhost:3002`)
- `api.namadomain.com` ➔ `http://localhost:3000` (Langsung ke API untuk WebSocket & REST)

> *Catatan*: Nyalakan opsi **WebSockets** di menu Network Cloudflare Domain Anda untuk kelancaran VM terminal.

### Langkah 5 — Build & Nyalakan Container
```bash
docker compose up -d --build
```

Setelah semua container aktif, lakukan database push untuk struktur tabel pertama kali:
```bash
docker compose run --rm --entrypoint sh api -c "npx --yes prisma@5.14.0 db push"
```

Akses **`https://admin.namadomain.com`** di peramban Anda untuk masuk ke Setup Wizard interaktif untuk menyelesaikan konfigurasi Proxmox, MikroTik, dan SMTP.

---

## Setup Infrastruktur Tambahan

### A. Konfigurasi Jaringan Host Proxmox VE
Jalankan skrip ini langsung di terminal **Proxmox VE Host** Anda sebagai root untuk membuat bridge virtual `vmbr1`, DHCP server internal via `dnsmasq`, dan aturan NAT untuk VM user:
```bash
# Download skrip setup
wget https://raw.githubusercontent.com/asaptr/nova-platform/main/scripts/setup-proxmox.sh
# Ubah hak akses & jalankan
chmod +x setup-proxmox.sh
# Jalankan (Anda bisa meng-override nama brand dengan variable env)
BRAND_NAME="Nova" PVE_USER="nova" bash setup-proxmox.sh
```

### B. Konfigurasi MikroTik (Untuk NAT Port Forwarding)
Salin berkas [setup-mikrotik.rsc](file:///Applications/XAMPP/xamppfiles/htdocs/Workspace/nova-platform/scripts/setup-mikrotik.rsc) ke WinBox Terminal, sesuaikan variabel brand, IP Proxmox, dan sandi API di baris teratas skrip, lalu jalankan untuk mengonfigurasi API port, firewall rules, dan address list secara otomatis.

---

## Lisensi
Nova Platform dikembangkan sebagai proyek proprietary untuk manajemen infrastruktur cloud baremetal. Gunakan secara bijak sesuai lisensi penggunaan.
