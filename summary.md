# Summary Scan & Analisis Struktur Folder Nova Platform

Dokumen ini berisi hasil pemindaian dan analisis mendalam terhadap repositori **Nova Platform**. Nova adalah platform IaaS (Infrastructure as a Service) berbasis *self-service* dan *pay-as-you-go* menggunakan **Proxmox VE** sebagai hypervisor utama. 

---

## 1. Ringkasan Arsitektur & Teknologi

Nova dibangun dengan arsitektur **Monorepo** menggunakan **Turborepo** dan **pnpm workspaces**. Berikut adalah stack teknologi utama yang digunakan:

*   **Frontend User Portal (`apps/web`)**: Next.js 14 (App Router) + Tailwind CSS.
*   **Frontend Admin Panel (`apps/admin`)**: Next.js 14 (App Router) + Tailwind CSS.
*   **Backend API (`apps/api`)**: NestJS (TypeScript) + Prisma ORM + PostgreSQL 16 + Redis (BullMQ untuk manajemen antrean job).
*   **Hypervisor Orchestrator**: Proxmox VE 9.x API + QEMU Guest Agent + Cloud-init.
*   **Networking & Gateway**: MikroTik RouterOS API (untuk NAT Port Forwarding) + dnsmasq (untuk DHCP di subnet NAT).
*   **Gateway Pembayaran**: Midtrans Snap API (untuk sistem *top up* saldo *prepaid*).
*   **Reverse Proxy & Routing**: Nginx + Cloudflare Tunnel (cloudflared).

---

## 2. Struktur Direktori Nova Platform

Berikut adalah pemetaan folder utama di dalam repositori:

```
nova-platform/
├── apps/                          # Aplikasi utama (monorepo)
│   ├── api/                       # NestJS API Backend (port 3000)
│   │   ├── prisma/                # Schema database PostgreSQL (Prisma)
│   │   └── src/                   # Source code backend API
│   ├── web/                       # Next.js User Portal Client (port 3001)
│   └── admin/                     # Next.js Admin Panel Client (port 3002)
├── packages/                      # Shared packages antar-aplikasi
│   ├── types/                     # Shared TypeScript interfaces & types
│   ├── ui/                        # Shared UI components (Button, Input, dll.)
│   └── utils/                     # Shared utilities (formatting, sleep, dll.)
├── scripts/                       # Skrip setup otomatis untuk deployment
│   ├── dev-setup.sh               # Inisialisasi environment development lokal
│   ├── setup-proxmox.sh           # Konfigurasi awal di host baremetal Proxmox VE
│   └── setup-mikrotik.rsc         # Konfigurasi router MikroTik via Terminal/WinBox
├── nginx/                         # Konfigurasi reverse proxy
│   └── nginx.conf                 # Aturan routing sub-domain dan rate-limiting Nginx
├── docker-compose.yml             # Orkestrasi Docker container (DB, Redis, Nginx, CF Tunnel)
├── package.json                   # Root package manager configuration
├── pnpm-workspace.yaml            # Definisi ruang kerja monorepo pnpm
└── README.md                      # Panduan instalasi dan dokumentasi teknis utama
```

---

## 3. Analisis Branding & Domain (Langitnode vs. Nova)

Berdasarkan hasil pemindaian di seluruh berkas kode sumber, nama brand **"Langit Node"** dan domain **`langitnode.id`** / **`langitnode.com`** diatur secara dinamis dan statis (hardcoded) pada beberapa bagian:

### A. Konfigurasi Dinamis (Melalui Database & API)
Nova memiliki sistem konfigurasi terpusat (`SystemConfigService`) di `/apps/api/src/system-config/system-config.service.ts` yang menyimpan konfigurasi berikut di tabel database `SystemConfig`:
*   `brand.name` (Nama platform, contoh: **Langit Node** atau **Nova**)
*   `brand.tagline` (Slogan platform)
*   `brand.logo_url` (URL logo kustom)
*   `brand.timezone` (Default: `Asia/Jakarta`)
*   `domain.base` (Domain utama untuk orkestrasi routing)

**Bagaimana Frontend Mendapatkannya?**
*   Kedua frontend (`apps/web` dan `apps/admin`) **tidak melakukan hardcode** nama "Langit Node".
*   Frontend memanggil endpoint backend `GET /api/v1/brand` secara dinamis.
*   Jika `brand.name` atau `domain.base` diubah melalui Admin Panel (**Sistem → Pengaturan Sistem**), backend secara otomatis melakukan pembaruan di database dan melakukan sinkronisasi ulang banner SSH MOTD ke semua Virtual Machine yang sedang berjalan.

---

### B. Konfigurasi Statis / Hardcoded (Harus Disesuaikan Saat Deploy)
Beberapa berkas masih menggunakan referensi hardcoded untuk nama `langitnode` atau domain `langitnode.id`. Berikut adalah lokasi berkas yang perlu disesuaikan atau diubah menjadi parameter variabel saat melakukan deployment brand baru:

#### 1. Nginx Routing (`nginx/nginx.conf`)
Domain di-hardcode langsung di server name block:
*   [nginx.conf L31](file:///Applications/XAMPP/xamppfiles/htdocs/Workspace/nova-platform/nginx/nginx.conf#L31):
    ```nginx
    server_name langitnode.id www.langitnode.id;
    ```
*   [nginx.conf L61](file:///Applications/XAMPP/xamppfiles/htdocs/Workspace/nova-platform/nginx/nginx.conf#L61):
    ```nginx
    server_name admin.langitnode.id;
    ```
    *Rekomendasi:* Buat templat `nginx.conf.template` yang memproses variabel `$DOMAIN` menggunakan envsubst atau script shell saat container Nginx dinyalakan.

#### 2. Skrip Proxmox (`scripts/setup-proxmox.sh`)
Skrip orkestrasi Proxmox menggunakan nama user dan nama token `langitnode`:
*   Username Linux host: `langitnode`
*   PVE API user: `langitnode@pve`
*   PVE Token ID: `langitnode@pve!langitnode-token`
*   *Rekomendasi:* Ganti nama user tersebut dengan nama yang lebih umum seperti `nova` atau buat variabel input `$BRAND_NAME` di dalam skrip.

#### 3. Skrip MikroTik (`scripts/setup-mikrotik.rsc`)
Konfigurasi firewall dan API di MikroTik menggunakan nama `langitnode`:
*   User API: `langitnode-api`
*   Address List: `langitnode-nat`
*   Komentar Firewall: `Langit Node NAT subnet` & `Langit Node — NAT VM ke internet`
*   *Rekomendasi:* Jadikan nama-nama ini generik atau gunakan pencarian dan penggantian string (Find & Replace) sebelum eksekusi skrip di MikroTik.

#### 4. Skrip Development (`scripts/dev-setup.sh`)
Setup lokal development menginisialisasi environment dengan dummy data `langitnode`:
*   DB URL: `postgresql://langitnode:langitnode_dev@localhost:5432/langitnode`
*   Superadmin Email default: `superadmin@langitnode.id`
*   PVE Token ID: `langitnode@pve!langitnode-token`
*   Email notification default: `noreply@langitnode.id`

---

## 4. Cara Kustomisasi Brand Saat Awal Deploy

Untuk mempermudah setup brand baru (contoh: domain kustom atau nama brand kustom), berikut adalah panduan langkah demi langkah:

### Langkah 1: Kustomisasi Environment Variables
Sebelum menjalankan container docker, pastikan file `.env` diisi sesuai domain brand baru:
```env
# apps/api/.env
FRONTEND_URL="https://app.namabrandbaru.com"
ADMIN_URL="https://admin.namabrandbaru.com"
EMAIL_FROM="Brand Baru <noreply@namabrandbaru.com>"
```
Serta file `.env.local` untuk frontend:
```bash
# apps/web/.env.local dan apps/admin/.env.local
NEXT_PUBLIC_API_URL=https://api.namabrandbaru.com/api/v1
```

### Langkah 2: Sesuaikan Nginx
Edit [nginx/nginx.conf](file:///Applications/XAMPP/xamppfiles/htdocs/Workspace/nova-platform/nginx/nginx.conf) dan ubah `langitnode.id` menjadi domain baru Anda (misalnya `namabrandbaru.com` & `admin.namabrandbaru.com`).

### Langkah 3: Setup Pertama Melalui Database Seed
Ketika pertama kali menjalankan database push & seed, ganti email superadmin default di database. Anda juga dapat mengubah data branding awal langsung saat database di-seed dengan memodifikasi pemanggilan Prisma SystemConfig jika diperlukan, atau mengubahnya secara visual melalui Admin Panel setelah login pertama kali.
