# Langit Node — Dokumen Perencanaan Platform

> **Langit Node** adalah platform VPS cloud provider self-service berbasis Proxmox. User register, topup saldo, pilih paket, dan deploy VM secara mandiri — tanpa intervensi manual dari operator. Dilengkapi admin panel untuk monitoring, VM management, dan financial dashboard.
>
> **Jenis platform**: IaaS (Infrastructure as a Service) — bukan reseller. Langit Node memiliki dan mengoperasikan infrastruktur sendiri, lalu menjual compute resource langsung ke end user dalam bentuk VPS self-service.
>
> **Domain**: langitnode.com / langitnode.id

---

## Cara pakai dokumen ini dengan Claude Code

Dokumen ini adalah **blueprint lengkap** — tidak perlu dibuat/dieksekusi manual. Gunakan bersama Claude Code (CLI) yang terkoneksi ke IDE lo:

```bash
# Install Claude Code jika belum ada
npm install -g @anthropic-ai/claude-code

# Masuk ke folder project
cd /path/to/langitnode

# Jalankan Claude Code dengan context MD ini
claude
```

Contoh prompt yang bisa langsung dipakai di Claude Code:

```
"Baca file BLUEPRINT.md ini. Mulai Sprint 0 — init project dan buat struktur folder monorepo."

"Lanjut Sprint 1 — buat file .env, schema.prisma, main.ts, dan app.module.ts sesuai blueprint."

"Buat src/proxmox/proxmox.service.ts dan proxmox.module.ts sesuai section 21 di blueprint."

"Buat src/vms/ lengkap: vms.service.ts, vms.controller.ts, vms.module.ts, dan provision.job.ts."
```

Claude Code akan baca blueprint ini, generate file, dan langsung tulis ke folder project — tidak perlu copy-paste manual.

---

## Daftar Isi

1. [Arsitektur Sistem](#1-arsitektur-sistem)
2. [Tech Stack](#2-tech-stack)
3. [Skema Database (ERD)](#3-skema-database-erd)
4. [User Journey](#4-user-journey)
5. [Admin Panel](#5-admin-panel)
6. [Keamanan (Security)](#6-keamanan-security)
7. [Strategi Backup](#7-strategi-backup)
8. [Infrastruktur & Scaling](#8-infrastruktur--scaling)
9. [Mitigasi Risiko](#9-mitigasi-risiko)
10. [Roadmap Development](#10-roadmap-development)
11. [Dark & Light Mode](#11-dark--light-mode)
12. [Testing](#12-testing)
13. [UI Library & Design System](#13-ui-library--design-system)
14. [Struktur Folder Project](#14-struktur-folder-project)
15. [Future Update Plan](#15-future-update-plan)
16. [Struktur Paket & Pricing](#16-struktur-paket--pricing)
17. [VM Console (Web-based)](#17-vm-console-web-based)
18. [VM ID, Penamaan & Akses SSH](#18-vm-id-penamaan--akses-ssh)
19. [Skenario Testing — VM ID, SSH & Akses](#19-skenario-testing--vm-id-ssh--akses)
20. [Konfigurasi Jaringan — Mikrotik & Proxmox](#20-konfigurasi-jaringan--mikrotik--proxmox)
21. [Panduan Pembuatan File Backend](#21-panduan-pembuatan-file-backend-step-by-step)
22. [Konfigurasi Proxmox Sebelum Backend Dijalankan](#22-konfigurasi-proxmox-sebelum-backend-dijalankan)
---

## 1. Arsitektur Sistem

Platform terbagi menjadi 4 layer utama yang terisolasi satu sama lain:

```
┌──────────────────────────────────────────────────────────────┐
│  USER LAYER                                                  │
│  Web Portal (responsive)  │  REST API publik (untuk power user) │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND + AUTH                                             │
│  Auth Service (JWT)  │  User Dashboard  │  Billing Panel     │
│  Admin Panel (superadmin & admin)                            │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  BACKEND MIDDLEWARE  ← Lindungi Proxmox dari akses langsung  │
│  VM Service  │  Billing Service  │  Notif Service            │
│  Job Queue   │  Payment Gateway  │  PostgreSQL + Redis        │
│  Proxmox API Wrapper (satu-satunya yang hit Proxmox)         │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  PROXMOX INFRASTRUCTURE                                      │
│  KVM Cluster  │  Storage (Ceph/NFS)  │  SDN/VLAN            │
└──────────────────────────────────────────────────────────────┘
```

### Prinsip desain utama

- **Proxmox tidak pernah diakses langsung oleh user maupun admin panel.** Semua request melewati middleware yang memvalidasi identitas, role, dan permission terlebih dahulu.
- **Setiap proses provisioning VM berjalan async** via job queue — tidak pernah blocking HTTP response.
- **Setiap user terisolasi di network level** menggunakan VLAN/SDN Proxmox.
- **Semua aksi admin ke VM tercatat di audit log** dengan field `actor_type = 'admin'` untuk keperluan accountability.

---

## 2. Tech Stack

| Komponen | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js + Tailwind CSS | SSR, cepat, ekosistem besar |
| Backend API | Node.js (NestJS) | Typed, modular, cocok untuk microservice |
| Database utama | PostgreSQL | Relasional, stabil, support JSONB |
| Cache & queue | Redis + BullMQ | Job queue async, session, rate limit |
| Payment | Midtrans / Xendit | Support metode Indonesia (VA, QRIS) |
| Proxmox wrapper | Axios + Proxmox API token | Isolasi akses, bisa di-rate-limit |
| Monitoring | Prometheus + Grafana | Metrics resource VM dan sistem |
| Deploy | Docker + Nginx | Portabel, mudah di-scale |
| Infra konfigurasi | Ansible | Reproducible setup untuk scale-out |
| Console VM | noVNC (via Proxmox) | Akses langsung ke VM untuk tshoot |

---

## 3. Skema Database (ERD)

### Tabel utama

#### `users`
```sql
id                UUID PRIMARY KEY
email             VARCHAR UNIQUE NOT NULL
password_hash     VARCHAR NOT NULL
full_name         VARCHAR
phone             VARCHAR
status            VARCHAR DEFAULT 'active'   -- active | suspended | banned
balance           DECIMAL(15,2) DEFAULT 0
email_verified_at TIMESTAMP
created_at        TIMESTAMP DEFAULT NOW()
```

#### `admin_users`
```sql
id            UUID PRIMARY KEY
email         VARCHAR UNIQUE NOT NULL
password_hash VARCHAR NOT NULL
full_name     VARCHAR
role          VARCHAR DEFAULT 'admin'        -- admin | superadmin
status        VARCHAR DEFAULT 'active'       -- active | inactive
last_login_at TIMESTAMP
created_at    TIMESTAMP DEFAULT NOW()
```

#### `packages`
```sql
id             UUID PRIMARY KEY
name           VARCHAR NOT NULL              -- "Starter", "Pro", "Business"
vcpu           INT NOT NULL
ram_mb         INT NOT NULL
disk_gb        INT NOT NULL
bandwidth_gb   INT NOT NULL
price_monthly  DECIMAL(12,2) NOT NULL
price_hourly   DECIMAL(12,4) NOT NULL
is_active      BOOLEAN DEFAULT TRUE
```

#### `vms`
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users(id)
package_id      UUID REFERENCES packages(id)
proxmox_vmid    VARCHAR NOT NULL             -- ID VM di Proxmox (misal: 100, 101)
proxmox_node    VARCHAR NOT NULL             -- Nama node Proxmox
hostname        VARCHAR NOT NULL             -- diset user saat create, muncul di shell (root@hostname) dan dashboard
                                             -- jika dikosongkan, default ke display_id (ln-nat-0001)
status          VARCHAR DEFAULT 'pending'    -- pending | provisioning | running | stopped | suspended | deleted
ip_address      CIDR
os_template     VARCHAR
expires_at      TIMESTAMP
created_at      TIMESTAMP DEFAULT NOW()
```

#### `transactions`
```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users(id)
type        VARCHAR                          -- topup | debit | refund | adjustment
amount      DECIMAL(15,2) NOT NULL
status      VARCHAR DEFAULT 'pending'        -- pending | success | failed
payment_ref VARCHAR                          -- ref dari payment gateway
gateway     VARCHAR                          -- midtrans | xendit | manual
notes       VARCHAR                          -- keterangan untuk adjustment manual oleh superadmin
created_by  UUID                             -- NULL jika oleh sistem, admin_user_id jika manual
created_at  TIMESTAMP DEFAULT NOW()
```

#### `billing_usage`
```sql
id             UUID PRIMARY KEY
vm_id          UUID REFERENCES vms(id)
user_id        UUID REFERENCES users(id)
amount_charged DECIMAL(12,4)
period_start   TIMESTAMP
period_end     TIMESTAMP
```

#### `audit_logs`
```sql
id            UUID PRIMARY KEY
actor_type    VARCHAR NOT NULL               -- user | admin | system
actor_id      UUID NOT NULL                  -- user_id atau admin_user_id
action        VARCHAR NOT NULL               -- vm.create | vm.stop | admin.login | topup.adjust, dst
resource_type VARCHAR                        -- vm | user | package | transaction
resource_id   VARCHAR
metadata      JSONB                          -- payload fleksibel
ip_address    INET
created_at    TIMESTAMP DEFAULT NOW()
```

#### `tickets`
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users(id)
vm_id           UUID REFERENCES vms(id)      -- VM terkait (opsional, untuk konteks tshoot)
subject         VARCHAR NOT NULL
status          VARCHAR DEFAULT 'open'        -- open | in_progress | resolved | closed
priority        VARCHAR DEFAULT 'normal'      -- low | normal | high | urgent
assigned_to     UUID REFERENCES admin_users(id)
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

#### `ticket_messages`
```sql
id          UUID PRIMARY KEY
ticket_id   UUID REFERENCES tickets(id)
sender_type VARCHAR NOT NULL                 -- user | admin
sender_id   UUID NOT NULL
message     TEXT NOT NULL
created_at  TIMESTAMP DEFAULT NOW()
```

#### `server_costs`
```sql
id           UUID PRIMARY KEY
label        VARCHAR NOT NULL               -- "Hetzner AX41 - Node 1", dst
amount       DECIMAL(12,2) NOT NULL         -- biaya per bulan dalam IDR
currency     VARCHAR DEFAULT 'IDR'
period_month DATE NOT NULL                  -- bulan berlaku (YYYY-MM-01)
notes        VARCHAR
created_by   UUID REFERENCES admin_users(id)
created_at   TIMESTAMP DEFAULT NOW()
```

### Indeks penting
```sql
CREATE INDEX idx_vms_user_id ON vms(user_id);
CREATE INDEX idx_vms_status ON vms(status);
CREATE INDEX idx_vms_proxmox_node ON vms(proxmox_node);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_actor_type ON audit_logs(actor_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_billing_usage_period ON billing_usage(period_start, period_end);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
```

---

## 4. User Journey

### Register → VM Aktif

```
[1] Register
    Input: nama, email, password, no. HP
    Output: akun dibuat, email verifikasi dikirim
         │
         ▼
[2] Verifikasi email
    Klik link token di email
    Output: status email_verified_at terisi
         │
         ▼
[3] Login → Dashboard
    Saldo: Rp 0  |  VM: belum ada
         │
         ▼
[4] Topup saldo
    Pilih nominal → redirect payment gateway (Midtrans/Xendit)
    Webhook callback → saldo otomatis terisi
    ┌──────────────┐
    │ Gagal?       │→ User bisa retry, tidak ada saldo masuk
    └──────────────┘
         │ Sukses
         ▼
[5] Pilih paket + OS template + isi form create VM
    Form: Hostname (opsional), Password Root (wajib, min 8 char huruf+angka)
    Sistem cek: apakah saldo ≥ harga paket?
         │
         ▼
[6] Konfirmasi order
    Saldo dipotong, VM masuk status "pending"
         │
         ▼
[7] Provisioning (async via job queue)
    Backend → Proxmox API → buat VM
    Hostname + password root di-set via cloud-init / QEMU guest agent
    UI menampilkan status "provisioning..." (polling/websocket)
    Estimasi: 30 detik – 2 menit
         │
         ▼
[8] VM Running
    UI update: status "running", tampilkan IP + hostname + perintah SSH siap salin
    Password tidak ditampilkan ulang (user sudah tahu karena input sendiri)
    Notifikasi email + in-app dikirim
```

### Siklus billing (model prepaid)

```
Setiap jam: cron job cek semua VM aktif
  → Potong saldo sesuai price_hourly paket
  → Catat di billing_usage

Jika saldo < threshold (misal Rp 10.000):
  → Kirim notifikasi warning ke user

Jika saldo = 0:
  → VM di-suspend otomatis
  → User diberi grace period 3 hari untuk topup

Jika setelah 3 hari tidak topup:
  → VM dihapus permanen
  → Data di Proxmox didelete
```

---

## 5. Admin Panel

Admin panel adalah dashboard terpisah dari user portal, hanya bisa diakses oleh `admin_users`. Terdiri dari 3 domain utama: **Monitoring Ops**, **VM Management**, dan **Financial Dashboard**.

### Role: Admin vs Superadmin

| Kemampuan | Admin | Superadmin |
|---|---|---|
| Lihat monitoring & node health | ✓ | ✓ |
| Lihat semua VM (semua user) | ✓ | ✓ |
| Aksi ke VM user (stop/reboot/suspend/dll) | ✓ | ✓ |
| Akses console VM (noVNC) | ✓ | ✓ |
| Lihat & balas tiket support | ✓ | ✓ |
| Lihat audit log (aksi user) | ✓ | ✓ |
| Lihat financial dashboard & profit | ✗ | ✓ |
| Input biaya server (COGS) | ✗ | ✓ |
| Kelola paket harga (CRUD) | ✗ | ✓ |
| Adjust saldo user secara manual | ✗ | ✓ |
| Buat / nonaktifkan akun admin | ✗ | ✓ |
| Lihat audit log semua admin | ✗ | ✓ |

---

### Domain 1 — Monitoring Ops

Halaman utama yang dibuka setiap hari. Berisi overview kesehatan sistem secara real-time.

#### Node health
Diambil dari Proxmox API secara periodik (polling setiap 30 detik):
- CPU usage per node (%)
- RAM tersisa vs total per node
- Disk usage per storage pool
- Network throughput (inbound/outbound) per node
- Status node: online | offline | degraded

Alert visual jika:
- CPU > 80% sustained 10 menit
- RAM tersisa < 10%
- Disk > 80%

#### VM overview
Tabel semua VM dari semua user dengan kolom:

| Kolom | Keterangan |
|---|---|
| VM name | Nama VM + link ke detail |
| Owner | Nama + email user |
| Status | running / stopped / suspended / provisioning |
| Node | Proxmox node tempat VM berjalan |
| Paket | Nama paket (CPU/RAM/disk) |
| CPU % | Real-time usage |
| RAM % | Real-time usage |
| IP | Alamat IP VM |
| Dibuat | Tanggal create |

Filter: by status, by node, by paket, by user. Search by nama VM atau email user.

#### User activity feed
Log aktivitas terbaru secara real-time:
- Login berhasil / gagal berulang (flag potensi brute force)
- Topup masuk
- VM baru dibuat / dihapus
- Tiket baru masuk
- Alert anomali (CPU spike, traffic spike, saldo hampir habis banyak user)

#### Support tickets queue
Antrian tiket dengan tampilan:
- Total tiket terbuka, in-progress, resolved hari ini
- Tiket per prioritas (urgent merah, high oranye)
- Setiap tiket menampilkan: subjek, nama user, VM terkait, waktu buka, status
- Klik tiket → halaman detail tiket dengan history percakapan + tombol aksi VM terkait

---

### Domain 2 — VM Management (Troubleshoot)

Flow tshoot saat user laporan tiket:

```
User buka tiket → Admin buka tiket di panel →
Lihat VM terkait yang ter-link di tiket →
Klik "Lihat detail VM" → Halaman detail VM →
Lihat status, resource history, Proxmox task log →
Ambil aksi yang diperlukan
```

#### Aksi yang tersedia per VM

| Aksi | Kapan dipakai | Efek |
|---|---|---|
| Start | VM dalam kondisi stopped | Menjalankan VM |
| Stop (graceful) | Shutdown normal | Kirim sinyal shutdown ke OS |
| Stop (force) | VM hang, tidak responsif | Hard power off langsung |
| Reboot | Refresh sistem | Restart VM |
| Suspend | Manual suspend karena abuse atau tagihan | VM pause, tidak konsumsi CPU |
| Unsuspend | Setelah issue teratasi | VM resume kembali |
| Console (noVNC) | Diagnosa langsung dari dalam VM | Buka terminal VM di browser |
| Reset password root | User lupa password | Set password baru via Proxmox agent |
| Rebuild VM | VM corrupt, perlu reinstall OS | Hapus disk + reinstall dari template |
| Migrate ke node lain | Maintenance node atau load balancing | Live migration ke node tujuan |
| Extend expired_at | Grace period manual | Perpanjang masa aktif VM |

#### Halaman detail VM
Menampilkan:
- Info dasar: ID, nama, owner, paket, node, IP, status, tanggal buat
- Resource usage chart: CPU, RAM, disk I/O, network (24 jam terakhir)
- Proxmox task log: semua task yang pernah berjalan di VM ini (create, backup, migrate, dll)
- Billing history: riwayat pemotongan saldo VM ini
- Audit log VM: semua aksi yang pernah dilakukan (oleh user maupun admin)
- Tiket terkait VM ini

#### Penting: semua aksi admin dicatat
Setiap aksi admin ke VM wajib tercatat di `audit_logs` dengan:
```
actor_type = 'admin'
actor_id   = <id admin yang melakukan aksi>
action     = 'vm.reboot' / 'vm.force_stop' / 'vm.console_access' / dst
resource_type = 'vm'
resource_id   = <vm_id>
metadata   = { reason: "tshoot tiket #123", ticket_id: "..." }
```

---

### Domain 3 — Financial Dashboard

Khusus superadmin. Berisi semua data keuangan untuk pengambilan keputusan bisnis.

#### Revenue overview

| Metrik | Deskripsi | Sumber data |
|---|---|---|
| MRR (Monthly Recurring Revenue) | Total billing_usage bulan berjalan | `billing_usage` |
| Topup volume | Total nominal topup masuk per hari/minggu/bulan | `transactions` (type=topup, status=success) |
| ARPU | MRR ÷ jumlah user dengan VM aktif | Kalkulasi |
| Top spenders | 10 user dengan billing usage tertinggi | `billing_usage` GROUP BY user |
| Revenue trend | Grafik MRR 6 bulan terakhir | `billing_usage` per bulan |

#### Profit estimator

Formula yang ditampilkan sebagai widget kalkulasi di dashboard:

```
Revenue bulan ini  = Σ billing_usage.amount_charged (period bulan ini)
COGS               = Σ server_costs.amount (bulan ini, input manual)
PG fee             = Σ transactions.amount × 2%  (estimasi rata-rata)
──────────────────────────────────────────────────────────────────
Gross profit       = Revenue − COGS − PG fee
Gross margin %     = (Gross profit ÷ Revenue) × 100

Break-even VM      = COGS ÷ rata-rata revenue per VM per bulan
```

Semua angka bisa di-drill down per periode (bulan ini, bulan lalu, custom range).

#### Capacity planner

| Metrik | Cara hitung |
|---|---|
| Slot VM tersisa (by RAM) | (RAM node total − RAM terpakai semua VM) ÷ RAM paket terkecil |
| Slot VM tersisa (by CPU) | (vCPU total node − vCPU terpakai) ÷ vCPU paket terkecil |
| Slot VM tersisa (by disk) | (Disk total − disk terpakai) ÷ disk paket terkecil |
| Slot efektif tersisa | min(slot RAM, slot CPU, slot disk) — bottleneck sebenarnya |
| Max revenue potential | Slot efektif tersisa × harga paket terkecil |
| Proyeksi penuh | Berdasarkan tren growth VM aktif per minggu |

Berguna untuk memutuskan kapan harus tambah/upgrade server sebelum kehabisan kapasitas.

#### User health metrics

| Metrik | Deskripsi |
|---|---|
| Churn risk | User dengan saldo < 1 hari usage + tidak ada topup 7 hari terakhir |
| Conversion rate | Register → topup → buat VM pertama (funnel) |
| New user per bulan | Tren registrasi |
| User aktif vs dormant | User yang punya VM running vs tidak ada VM aktif |

---

## 6. Keamanan (Security)

### Layer 1 — Network perimeter

- **Cloudflare** di depan semua traffic: proteksi DDoS L3/L4/L7, WAF, SSL termination.
- **Nginx reverse proxy**: hanya forward ke backend, tidak ada port backend yang expose ke public.
- **UFW/iptables** di server: whitelist hanya port 80, 443, dan SSH (port non-default).
- **Proxmox panel (port 8006) TIDAK pernah diakses dari internet.** Akses hanya via SSH tunnel atau Wireguard VPN internal.
- **Admin panel di subdomain terpisah** (misal `admin.langitnode.id`) dengan IP whitelist opsional untuk keamanan ekstra.

### Layer 2 — Application security

- **JWT dengan expiry pendek** (15 menit access token + refresh token 7 hari).
- **Rate limiting** per IP dan per user:
  - Login: 5x percobaan / 15 menit, lalu lock sementara
  - API: 100 req/menit untuk user biasa, 10 req/menit untuk endpoint sensitif
  - Admin login: 3x percobaan / 15 menit, notif email jika gagal berulang
- **RBAC (Role-Based Access Control)**:
  - `user`: hanya bisa akses resource milik sendiri, validasi `user_id` di setiap query
  - `admin`: akses monitoring, VM management, tiket — tidak bisa akses finansial
  - `superadmin`: akses penuh termasuk finansial, manajemen admin, adjustment saldo
  - Validasi role di middleware DAN di service layer (defense in depth)
- **Audit log** wajib untuk semua aksi sensitif: semua aksi admin ke VM, login admin, perubahan paket, adjustment saldo.
- **Input validation** ketat di semua endpoint — jangan percaya data dari client.
- **HTTPS only**, HSTS enabled, semua cookie dengan flag `Secure` dan `HttpOnly`.
- **2FA (opsional di awal)** untuk akun admin dan superadmin — rekomendasikan aktifkan sebelum launch.

### Layer 3 — Proxmox isolation

- **Network isolation**: setiap user mendapat VLAN tersendiri. VM antar user tidak bisa saling berkomunikasi secara default.
- **Resource limit via cgroup**:
  - CPU: `cpulimit` sesuai paket, burst dibatasi
  - RAM: hard limit, tidak bisa swap ke resource VM lain
  - Disk I/O: throttling via blkio cgroup
  - Bandwidth: limit outbound per VM (cegah abuse untuk DDoS/mining)
- **Proxmox API token**: middleware menggunakan token dengan scope terbatas (bukan root), satu token per service.
- **Monitoring anomali**: alert jika CPU > 95% selama > 10 menit atau outbound traffic spike drastis.

### Checklist keamanan sebelum launch

- [ ] Proxmox tidak bisa diakses dari IP publik
- [ ] SSH key-only, password auth dinonaktifkan
- [ ] Port scan dari luar hanya tampilkan 80 dan 443
- [ ] Rate limiting aktif di semua endpoint auth (user dan admin)
- [ ] Audit log menyimpan semua aksi sensitif dengan actor_type
- [ ] VLAN per user sudah dikonfigurasi dan ditest isolasinya
- [ ] Admin panel hanya bisa diakses oleh akun `admin_users` (bukan `users`)
- [ ] Backup pertama sudah berjalan dan berhasil di-restore (test!)
- [ ] ToS dan privacy policy sudah tertulis dan dipublish

---

## 7. Strategi Backup

### Tier 1 — VM snapshot (harian, lokal)

- **Tools**: `vzdump` bawaan Proxmox
- **Frekuensi**: setiap hari pukul 03.00 WIB (low traffic)
- **Retensi**: 7 hari terakhir
- **Storage**: disk lokal node Proxmox
- **RTO**: ~15 menit | **RPO**: 24 jam

```bash
# Contoh konfigurasi vzdump di /etc/cron.d/vzdump
0 3 * * * root vzdump --all --compress lzo --storage local --maxfiles 7
```

### Tier 2 — Offsite backup (mingguan)

- **Tools**: `rclone` + Backblaze B2 atau Wasabi (lebih murah dari AWS S3)
- **Frekuensi**: setiap Minggu pukul 04.00 WIB
- **Retensi**: 30 hari
- **Enkripsi**: enkripsi sebelum upload (`rclone crypt` atau `restic`)
- **RTO**: 1–4 jam | **RPO**: 7 hari

```bash
# Contoh sync ke Backblaze B2
rclone sync /var/lib/vz/dump/ b2:nama-bucket-backup/proxmox/ \
  --transfers 4 --b2-hard-delete
```

### Tier 3 — Disaster recovery (saat server mati total)

- **Runbook DR tertulis** dan disimpan di Git (bukan di server yang sama!)
- Langkah-langkah mencakup: sewa server baru → setup Proxmox → restore dari offsite → update DNS → notif user
- **Ansible playbook** untuk automate setup Proxmox di server baru
- **RTO**: 4–24 jam | **RPO**: 7 hari

### Yang wajib di-test sebelum launch

Backup yang tidak pernah dicoba restore = tidak ada backupnya. Lakukan full restore test ke environment terpisah sebelum menerima user pertama.

---

## 8. Infrastruktur & Scaling

### Rekomendasi provider

Gunakan **baremetal**, bukan VDS. Proxmox butuh akses langsung ke hardware (KVM). Nested virtualization di atas VDS performanya buruk dan banyak provider melarangnya.

Provider yang direkomendasikan:
- **Hetzner** (EU): harga terbaik untuk performa, reliabel. AX41 ~€40/bulan.
- **OVH** (EU/ID): ada DC Singapore, latency ke Indonesia lebih baik.
- **Vultr Bare Metal**: harga lebih tinggi tapi ada DC Jakarta.

### Roadmap scaling

#### Fase 1 — Launch (0–50 VM)

```
1x Baremetal server
  Spec: 32GB RAM, 4–6 core, 1TB NVMe
  Estimasi kapasitas: 15–20 VM aktif bersamaan
  Biaya infra: ~€40–60/bulan
```

Pisahkan layanan berikut ke VM/container kecil di server yang sama:
- Proxmox node (bare)
- App server (Docker: Next.js + NestJS + Redis + PostgreSQL)
- Nginx reverse proxy

#### Fase 2 — Growth (50–200 VM)

```
1x Server lama (Proxmox node 1)
1x Server baru (Proxmox node 2) → tambah cluster
  Spec tiap node: 64GB RAM, 8 core, 2TB NVMe
  Keuntungan: live migration VM antar node, HA dasar
```

Di fase ini, pisahkan app server ke server terpisah dari Proxmox cluster.

#### Fase 3 — Scale (200+ VM)

```
Proxmox cluster: 3+ node → kuorum stabil (odd number)
Storage: Ceph distributed storage antar node
Load balancer: HAProxy atau Nginx untuk app server
Database: PostgreSQL read replica untuk query-heavy
```

### Tips desain yang memudahkan scaling

- Jangan hardcode IP Proxmox node — gunakan hostname internal dan environment variable.
- Simpan semua konfigurasi infra di Git (Ansible, docker-compose, env template).
- Desain billing per jam dari awal — lebih fleksibel daripada migrasi dari monthly billing.
- Gunakan `proxmox_node` sebagai kolom di tabel `vms` — sudah siap multi-node.

---

## 9. Mitigasi Risiko

### Risiko teknis

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| Server baremetal mati total | Kritis | Sedang | Backup offsite aktif. Runbook DR tertulis. Status page untuk notif user. SLA jelas di ToS. |
| User abuse resource (CPU/RAM) | Tinggi | Tinggi | Cgroup limit per VM. Alert jika usage > 90% selama 10 menit. Auto-suspend jika abuse terdeteksi. Admin bisa force-stop dari panel. |
| VM user dijadikan sumber DDoS/spam | Kritis | Sedang | Batasi outbound bandwidth per VM. Monitor traffic anomali. Admin bisa null-route IP dan suspend VM langsung dari panel. |
| Storage penuh | Tinggi | Sedang | Alert di 70% dan 80% kapasitas (tampil di node health admin). Auto-stop provisioning baru jika > 85%. |
| Bug provisioning: saldo dipotong tapi VM gagal dibuat | Tinggi | Rendah | Transaksi atomik: potong saldo HANYA setelah Proxmox confirm berhasil. Saldo dikembalikan otomatis jika job gagal. Superadmin bisa manual refund dari panel. |
| Akun admin dibobol | Kritis | Rendah | Rate limit login admin ketat. Notif email setiap login admin. 2FA untuk admin dan superadmin. Audit log semua aksi admin. |

### Risiko bisnis

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| Saldo habis, VM tidak dibayar | Tinggi | Tinggi | Model prepaid wajib. Alert saldo < threshold. Auto-suspend VM jika saldo 0. Grace period 3 hari, lalu hapus. Admin bisa extend grace period manual jika perlu. |
| Fraud topup / chargeback | Tinggi | Sedang | Verifikasi nomor HP untuk topup > Rp 500.000. Tunda aktivasi 1x24 jam untuk akun baru. Limit topup pertama. Superadmin bisa freeze akun dari panel. |
| Provider baremetal naik harga atau tutup | Tinggi | Rendah | Desain multi-node dari awal. Margin pricing minimal 30–40%. Kontrak bulanan dulu, bukan tahunan. |
| Kompetisi harga agresif | Sedang | Tinggi | Diferensiasi lewat UX yang lebih baik, support responsif, dan lokasi DC. Jangan race to bottom di harga. |

### Risiko regulasi & legal

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| Keluhan data privacy / UU PDP Indonesia | Kritis | Rendah | Enkripsi data at rest dan in transit. Privacy policy jelas. Jangan simpan data sensitif yang tidak perlu. Konsultasi pengacara IT sebelum launch. |
| User menggunakan VM untuk aktivitas ilegal | Kritis | Sedang | ToS jelas melarang aktivitas ilegal. Audit log lengkap. Admin bisa suspend VM dan freeze akun dari panel. Prosedur takedown tertulis. Simpan log minimal 6 bulan. |

### Manajemen insiden

Sebelum launch, tulis runbook untuk skenario berikut:
1. Server down mendadak → siapa yang dihubungi, langkah apa, cara komunikasi ke user via status page
2. VM user kena hack / dijadikan sumber serangan → admin suspend VM dari panel, langkah investigasi
3. Bug billing: saldo salah potong → superadmin rollback dan refund manual via panel
4. Payment gateway down → fallback atau maintenance page topup
5. Akun admin dicurigai dibobol → nonaktifkan akun dari panel, audit semua aksi akun tersebut

---

## 10. Roadmap Development

### Sprint 1 — Foundation (minggu 1–3)

- [ ] Setup infrastruktur: baremetal, Proxmox, Docker, PostgreSQL, Redis
- [ ] Auth service: register, login, JWT, verifikasi email (user)
- [ ] Auth admin: login admin/superadmin, RBAC middleware
- [ ] User dashboard (skeleton): halaman utama, profil
- [ ] Proxmox API wrapper: connect, list nodes, basic VM operations
- [ ] Admin panel skeleton: layout, sidebar, autentikasi admin terpisah

### Sprint 2 — Core features (minggu 4–6)

- [ ] Manajemen paket: CRUD paket di admin (superadmin), tampilkan di frontend
- [ ] Billing: sistem saldo prepaid, topup via Midtrans/Xendit, webhook
- [ ] VM lifecycle: create, start, stop, restart, delete (dengan job queue)
- [ ] Real-time provisioning status (polling atau websocket)
- [ ] Notifikasi email (verifikasi, topup sukses, VM siap, saldo rendah)
- [ ] Admin: VM overview table + filter + search
- [ ] Admin: aksi VM (start/stop/reboot/suspend) dari panel

### Sprint 3 — Security & stability (minggu 7–9)

- [ ] Rate limiting di semua endpoint sensitif (user dan admin)
- [ ] VLAN per user di Proxmox (network isolation)
- [ ] Resource limit cgroup per VM
- [ ] Audit log lengkap (user actions + admin actions)
- [ ] Backup otomatis: vzdump + rclone ke offsite
- [ ] Monitoring: Prometheus + Grafana, alert basic
- [ ] Admin: node health dashboard (CPU/RAM/disk/network)
- [ ] Admin: user activity feed + anomali alert
- [ ] Status page publik

### Sprint 4 — Admin panel lengkap (minggu 10–11)

- [ ] Console VM (noVNC via Proxmox) untuk admin tshoot
- [ ] Sistem tiket support: user buat tiket, admin reply, link ke VM
- [ ] Admin: halaman detail VM (resource chart, task log, audit log, tiket terkait)
- [ ] Admin: emergency actions (reset password, rebuild VM, migrate node)
- [ ] Superadmin: financial dashboard (revenue, profit estimator, capacity planner)
- [ ] Superadmin: input biaya server (server_costs)
- [ ] Superadmin: adjust saldo user manual + catat di audit log
- [ ] Superadmin: manajemen akun admin (buat, nonaktifkan)

### Sprint 5 — Polish & launch (minggu 12–14)

- [ ] Halaman billing history + invoice PDF (user)
- [ ] Load testing: simulasi 20+ VM provisioning bersamaan
- [ ] Security audit: port scan, penetration test dasar
- [ ] ToS, privacy policy, halaman harga
- [ ] Runbook insiden tertulis untuk semua skenario kritis
- [ ] Soft launch ke beta user terbatas (5–10 user)

---

## Catatan penting

**Jangan launch sebelum:**
1. Backup berhasil di-restore ke environment terpisah (bukan hanya berhasil dibuat)
2. VLAN isolation ditest (user A tidak bisa ping VM user B)
3. Skenario saldo 0 → suspend VM berjalan otomatis
4. Admin panel ditest: semua aksi VM berfungsi dan tercatat di audit log
5. ToS dan privacy policy dipublish

**Margin pricing yang aman untuk awal:**
- Hitung biaya server ÷ kapasitas VM yang bisa dijual
- Tambah margin minimal 40% untuk menutup biaya operasional, support, dan unexpected cost
- Contoh: server €40/bulan (~Rp 700.000), bisa isi 20 VM → biaya per VM ~Rp 35.000/bulan → jual minimal Rp 80.000–120.000/bulan per VM kecil
- Jangan lupa hitung biaya payment gateway (~2% per transaksi topup) dalam kalkulasi margin

**Formula break-even sederhana:**
```
BEP (VM) = Biaya server per bulan ÷ rata-rata revenue per VM per bulan
Contoh   = Rp 700.000 ÷ Rp 100.000 = 7 VM aktif untuk BEP
```

---

*Dokumen ini dibuat sebagai panduan perencanaan. Sesuaikan dengan kebutuhan bisnis dan kondisi infrastruktur aktual.*

---

## 11. Dark & Light Mode

Kedua portal (user portal dan admin panel) wajib mendukung dark mode dan light mode. Ini bukan fitur kosmetik — user yang kerja malam hari atau di lingkungan gelap sangat terbantu dengan dark mode.

### Strategi implementasi (Next.js)

**Library**: `next-themes` — wrapper satu baris di `_app.tsx`, langsung dapat toggle + persist + SSR-safe.

```tsx
// _app.tsx
import { ThemeProvider } from 'next-themes'

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
```

**Tailwind config**: semua warna via CSS variables, bukan hardcoded hex.

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        card:       'var(--color-card)',
        border:     'var(--color-border)',
        primary:    'var(--color-text-primary)',
        muted:      'var(--color-text-muted)',
        accent:     'var(--color-accent)',
      }
    }
  }
}
```

```css
/* globals.css */
:root {
  --color-bg:           #F8F7F4;
  --color-card:         #FFFFFF;
  --color-border:       #E5E3DC;
  --color-text-primary: #1A1A18;
  --color-text-muted:   #737069;
  --color-accent:       #185FA5;
}

.dark {
  --color-bg:           #1C1C1A;
  --color-card:         #252523;
  --color-border:       #383836;
  --color-text-primary: #E8E6DF;
  --color-text-muted:   #9C9A92;
  --color-accent:       #5BA3E8;
}
```

**Toggle button** di navbar — tersimpan di `localStorage`, fallback ke system preference OS user:

```tsx
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
```

### Token warna per portal

| Token | User portal (light) | User portal (dark) | Admin panel (light) | Admin panel (dark) |
|---|---|---|---|---|
| Background | `#F8F7F4` | `#1C1C1A` | `#F4F3F7` | `#18181C` |
| Card | `#FFFFFF` | `#252523` | `#FFFFFF` | `#222228` |
| Accent | `#185FA5` (biru) | `#5BA3E8` | `#534AB7` (ungu) | `#9A94E8` |
| Danger | `#A32D2D` | `#F09595` | sama | sama |
| Success | `#3B6D11` | `#C0DD97` | sama | sama |

Admin panel pakai accent **ungu** untuk membedakan secara visual dari user portal yang biru — membantu admin tidak salah panel saat bekerja.

### Aturan implementasi

- Tidak boleh ada hardcoded hex di komponen (`color: #333` dll) — semua harus pakai CSS variable atau Tailwind token.
- Semua gambar/ilustrasi cek kontras di kedua mode.
- Tabel, chart (Recharts/Chart.js), dan badge warna harus ditest di dark mode — library charting sering punya warna default yang tidak ada dark mode-nya.
- Icon: gunakan library yang mendukung currentColor (Lucide, Tabler) agar icon ikut warna teks otomatis.
- Status badge (`running`, `stopped`, `suspended`) pakai background dari color ramp yang tepat:

```tsx
const statusColors = {
  running:     'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200',
  stopped:     'bg-gray-100 text-gray-700  dark:bg-gray-800 dark:text-gray-300',
  suspended:   'bg-amber-50 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  provisioning:'bg-blue-50  text-blue-800  dark:bg-blue-900  dark:text-blue-200',
  deleted:     'bg-red-50   text-red-800   dark:bg-red-900   dark:text-red-200',
}
```

---

## 12. Testing

Testing dibagi menjadi 5 level, dari yang paling granular (unit) hingga infrastructure testing. Jalankan dalam urutan ini — jangan skip ke load test sebelum unit test hijau semua.

### Level 1 — Unit testing

**Tools**: Jest (backend NestJS) + Vitest (frontend Next.js)
**Target coverage**: minimal 70% untuk service layer

| Test case | Yang divalidasi |
|---|---|
| Kalkulasi billing per jam | `price_hourly × hours` menghasilkan angka yang tepat per paket |
| Saldo check sebelum create VM | Tolak jika `balance < package.price_hourly × 24` (minimum 1 hari) |
| Validasi input register | Email format, password min 8 karakter, no. HP Indonesia |
| JWT generate & verify | Token valid bisa di-decode, expired token throw error |
| RBAC middleware | Role `user` ditolak di endpoint admin, role `admin` ditolak di endpoint superadmin |
| Rate limit counter | Counter increment per request, reset setelah window berakhir |
| Audit log builder | Setiap event menghasilkan object log dengan field yang lengkap |

### Level 2 — Integration testing

**Tools**: Supertest + database PostgreSQL test (bisa pakai Docker testcontainer)
**Prinsip**: test flow end-to-end antar service, dengan database nyata tapi terpisah dari production

| Test case | Yang divalidasi |
|---|---|
| Register → verifikasi email → login | Seluruh flow auth menghasilkan JWT yang valid |
| Topup webhook Midtrans | Callback POST → saldo user bertambah di DB |
| Create VM happy path | Saldo dipotong + job masuk Redis queue + VM record dibuat dengan status `pending` |
| Create VM saldo kurang | 402 response, saldo tidak berubah, tidak ada job di queue |
| Job gagal di queue | Proxmox API mock return error → saldo dikembalikan otomatis via refund transaction |
| Delete VM | Billing usage berhenti + VM status berubah jadi `deleted` + Proxmox VM dihapus |
| Admin stop VM | VM status berubah + audit log tercatat dengan `actor_type = 'admin'` |
| Cron billing | Setelah 1 jam, semua VM dengan status `running` saldo user dipotong sesuai `price_hourly` |

### Level 3 — E2E testing

**Tools**: Playwright
**Prinsip**: simulasi user nyata di browser, termasuk klik, form, dan navigasi

| Test case | Skenario |
|---|---|
| Happy path user | Register → verifikasi email → login → topup → pilih paket → buat VM → VM running → tampil IP |
| Dark/light mode | Toggle tema → semua elemen tampil benar (tidak ada teks invisible atau badge yang hilang) |
| Responsive web | Semua halaman usable di viewport 375px (mobile browser) dan 768px (tablet) tanpa horizontal scroll |
| Admin login + aksi VM | Login admin → buka VM overview → klik stop → konfirmasi → status VM berubah di UI |
| Superadmin financial | Login superadmin → buka financial dashboard → profit estimator menampilkan angka yang masuk akal |
| Tiket support | User buat tiket dengan VM terkait → admin reply → user dapat notifikasi in-app |
| Saldo habis flow | Saldo 0 → VM auto-suspend → UI menampilkan peringatan → user topup → VM resume |

### Level 4 — Security & edge case testing

**Tools**: manual + OWASP ZAP (otomatis), nmap (port scan)

#### Security tests

| Test case | Expected result |
|---|---|
| IDOR: user A akses VM user B | `403 Forbidden` — bukan 404, bukan 200 |
| IDOR: user A hapus VM user B | `403 Forbidden`, VM user B tidak tersentuh |
| Brute force login | Setelah 5 gagal dalam 15 menit → `429 Too Many Requests` + lock 15 menit |
| JWT expired | Request dengan token expired → `401 Unauthorized` |
| Admin akses endpoint superadmin | `403 Forbidden` |
| Privilege escalation via payload | Kirim `{"role":"superadmin"}` di body request → role tidak berubah |
| Port scan dari luar | Hanya port 80 dan 443 terbuka. Port 8006 (Proxmox), 5432 (PG), 6379 (Redis) tidak terlihat |
| Akses Proxmox panel dari IP publik | Timeout / connection refused |
| XSS di nama VM | Input `<script>alert(1)</script>` sebagai nama VM → di-escape, tidak dieksekusi |
| SQL injection di search | Input `'; DROP TABLE users; --` → tidak ada efek ke DB |

#### Edge case tests

| Test case | Expected result |
|---|---|
| Race condition saldo | Dua create VM bersamaan, saldo cukup untuk satu → hanya satu yang berhasil, satu tolak |
| Proxmox API timeout | Job retry otomatis 3x, lalu fail gracefully + saldo refund |
| VM name duplikat | Sistem generate nama unik atau tolak dengan pesan jelas |
| Topup webhook replay | Webhook yang sama dikirim dua kali → saldo hanya naik sekali (idempotency check) |
| Billing cron saat saldo tepat 0 | VM suspend, tidak ada saldo negatif |

### Level 5 — Load & infrastructure testing

**Tools**: k6 (load), manual (infra)

#### Load tests

```js
// Contoh k6 script: simulasi 20 user topup bersamaan
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 20,
  duration: '30s',
};

export default function () {
  const res = http.post('https://api.langitnode.id/billing/topup', {
    amount: 100000,
  }, { headers: { Authorization: `Bearer ${__ENV.TOKEN}` } });

  check(res, { 'topup success': (r) => r.status === 200 });
}
```

| Skenario load test | Target yang harus dicapai |
|---|---|
| 20 user register + topup bersamaan | Semua berhasil, response time < 2 detik |
| 10 VM dibuat serentak | Semua masuk queue, tidak ada job yang hilang atau deadlock |
| Billing cron dengan 50 VM aktif | Semua VM diproses dalam < 60 detik |
| 100 request/detik ke endpoint dashboard | p95 response time < 500ms |

#### Infrastructure tests (manual, wajib sebelum launch)

| Test | Cara melakukan | Expected result |
|---|---|---|
| Backup restore penuh | Restore VM dari backup offsite ke server staging baru | VM bisa nyala, data lengkap |
| Node Proxmox mati | Matikan server secara paksa | Alert muncul di admin panel dalam < 5 menit |
| Storage limit | Isi disk hingga > 85% | Auto-stop provisioning aktif, alert muncul |
| Cron billing mati dan restart | Kill proses cron, nyalakan lagi | Tidak ada double billing, tidak ada billing yang terlewat |
| Redis restart | Restart Redis | Job queue recovery, tidak ada job hilang (pakai BullMQ persistence) |

### Checklist sebelum soft launch

- [ ] Semua unit test hijau, coverage ≥ 70% service layer
- [ ] Semua integration test hijau di environment staging
- [ ] E2E happy path berhasil di Chrome, Firefox, Safari
- [ ] Dark mode dan light mode ditest di semua halaman
- [ ] Responsive web ditest di viewport 375px (mobile browser) dan 768px (tablet)
- [ ] IDOR test berhasil (akses VM orang lain ditolak)
- [ ] Brute force protection aktif
- [ ] Port scan menunjukkan hanya 80 dan 443 terbuka
- [ ] Proxmox panel tidak bisa diakses dari IP publik
- [ ] Backup restore test berhasil ke environment terpisah
- [ ] Load test 20 concurrent user berhasil tanpa error
- [ ] Race condition saldo ditest dan tidak ada double debit

---

*Dokumen ini dibuat sebagai panduan perencanaan. Sesuaikan dengan kebutuhan bisnis dan kondisi infrastruktur aktual.*

---

## 13. UI Library & Design System

### Rekomendasi stack

Untuk vibe clean & minimal (Linear, Vercel), stack berikut adalah pilihan terbaik:

| Library | Fungsi | Alasan |
|---|---|---|
| `shadcn/ui` | Komponen UI utama | Copy-paste bukan install — kode jadi milik sendiri, bundle minimal |
| `Tailwind CSS v4` | Styling | Utility-first, dark mode native, tidak ada runtime overhead |
| `Lucide React` | Icons | Ringan, konsisten, tree-shakeable |
| `Recharts` | Chart & grafik | CPU/RAM graph, revenue chart — native React, dark mode via prop |
| `TanStack Table` | Tabel data besar | VM list, user list — headless, zero styling assumption |
| `next-themes` | Dark/light toggle | SSR-safe, persist localStorage, auto system preference |
| `Geist` | Font | Font dari Vercel — clean, modern, gratis, cocok untuk SaaS |

### Kenapa bukan Material UI?

MUI terlalu "Google-ish" untuk vibe minimal yang diinginkan:
- Bundle besar (~300KB+)
- Styling override butuh `sx` prop atau `styled()` — verbose dan tidak intuitif
- Sangat susah keluar dari estetika Material Design tanpa effort besar

### Kenapa shadcn/ui?

shadcn/ui bukan library dalam arti tradisional — ini koleksi komponen yang di-copy langsung ke dalam project. Keuntungannya:
- Tidak ada dependency runtime tambahan
- Kode sepenuhnya bisa dimodifikasi — tidak ada black box
- Dark mode otomatis via CSS variables
- Aksesibilitas (a11y) dari Radix UI primitives
- Tampilan default sudah clean & minimal

### Setup awal

```bash
npx create-next-app@latest langitnode-panel --typescript --tailwind --app
cd langitnode-panel
npx shadcn@latest init
npx shadcn@latest add button card input table badge dialog dropdown-menu
```

### Token warna custom (globals.css)

```css
:root {
  /* User portal — accent biru */
  --color-accent:       #185FA5;
  --color-accent-hover: #0C447C;

  /* Admin panel — accent ungu (override di layout admin) */
  --color-accent-admin:       #534AB7;
  --color-accent-admin-hover: #3C3489;
}

.dark {
  --color-accent:       #5BA3E8;
  --color-accent-hover: #85B7EB;
  --color-accent-admin:       #9A94E8;
  --color-accent-admin-hover: #AFA9EC;
}
```

### Status badge component

```tsx
const statusVariants = {
  running:      'bg-green-50  text-green-800  dark:bg-green-950  dark:text-green-300',
  stopped:      'bg-gray-100  text-gray-700   dark:bg-gray-800   dark:text-gray-300',
  suspended:    'bg-amber-50  text-amber-800  dark:bg-amber-950  dark:text-amber-300',
  provisioning: 'bg-blue-50   text-blue-800   dark:bg-blue-950   dark:text-blue-300',
  deleted:      'bg-red-50    text-red-800    dark:bg-red-950    dark:text-red-300',
}

export function VmStatusBadge({ status }: { status: keyof typeof statusVariants }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusVariants[status]}`}>
      {status}
    </span>
  )
}
```

---

## 14. Struktur Folder Project

### Overview monorepo

```
langitnode/
├── apps/
│   ├── web/          ← User portal (Next.js)
│   ├── admin/        ← Admin panel (Next.js)
│   └── api/          ← Backend API (NestJS)
├── packages/
│   ├── ui/           ← Shared shadcn/ui components
│   ├── types/        ← Shared TypeScript types
│   └── utils/        ← Shared utility functions
├── docker-compose.yml
├── turbo.json        ← Turborepo config
└── package.json
```

Pakai **Turborepo** untuk monorepo — user portal dan admin panel share komponen UI dan types tanpa duplikasi.

### User portal (`apps/web`)

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── verify-email/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          ← Sidebar + navbar wrapper
│   │   ├── page.tsx            ← Overview: saldo, VM summary
│   │   ├── vms/
│   │   │   ├── page.tsx        ← List semua VM user
│   │   │   ├── new/page.tsx    ← Pilih paket + deploy
│   │   │   └── [id]/page.tsx   ← Detail VM: status, console, aksi
│   │   ├── billing/
│   │   │   ├── page.tsx        ← Saldo + history transaksi
│   │   │   └── topup/page.tsx  ← Form topup
│   │   ├── support/
│   │   │   ├── page.tsx        ← List tiket
│   │   │   └── [id]/page.tsx   ← Detail tiket + reply
│   │   └── settings/page.tsx   ← Profil, password, notif
│   └── api/                    ← Next.js route handlers (proxy ke NestJS)
├── components/
│   ├── ui/                     ← shadcn/ui components
│   ├── vm/
│   │   ├── vm-card.tsx
│   │   ├── vm-status-badge.tsx
│   │   └── vm-console.tsx      ← noVNC wrapper
│   ├── billing/
│   │   ├── balance-card.tsx
│   │   └── topup-form.tsx
│   └── layout/
│       ├── sidebar.tsx
│       ├── navbar.tsx
│       └── theme-toggle.tsx
├── lib/
│   ├── api.ts                  ← Axios client + interceptors
│   ├── auth.ts                 ← next-auth config
│   └── utils.ts
└── hooks/
    ├── use-vm-status.ts        ← Polling VM status
    └── use-balance.ts
```

### Admin panel (`apps/admin`)

```
apps/admin/
├── app/
│   ├── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx
│       ├── page.tsx              ← Overview: node health, VM aktif, tiket baru
│       ├── nodes/page.tsx        ← Node health: CPU/RAM/disk/network
│       ├── vms/
│       │   ├── page.tsx          ← Semua VM semua user + filter
│       │   └── [id]/page.tsx     ← Detail VM: aksi, log, chart resource
│       ├── users/
│       │   ├── page.tsx          ← List user + search
│       │   └── [id]/page.tsx     ← Detail user: VM, transaksi, audit log
│       ├── tickets/
│       │   ├── page.tsx          ← Queue tiket
│       │   └── [id]/page.tsx     ← Detail tiket + reply + aksi VM
│       ├── finance/              ← Superadmin only
│       │   ├── page.tsx          ← Revenue overview + profit estimator
│       │   ├── costs/page.tsx    ← Input biaya server
│       │   └── capacity/page.tsx ← Capacity planner
│       └── settings/
│           ├── packages/page.tsx ← CRUD paket harga
│           └── admins/page.tsx   ← Kelola akun admin
├── components/
│   ├── ui/
│   ├── nodes/
│   │   ├── node-health-card.tsx
│   │   └── resource-chart.tsx    ← Recharts CPU/RAM/network
│   ├── vms/
│   │   ├── vm-table.tsx          ← TanStack Table
│   │   ├── vm-actions.tsx        ← Stop/reboot/suspend/console
│   │   └── vm-detail-panel.tsx
│   └── finance/
│       ├── profit-estimator.tsx
│       └── capacity-gauge.tsx
└── lib/
    ├── api.ts
    └── auth.ts                   ← Terpisah dari user portal auth
```

### Backend API (`apps/api`)

```
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts       ← Login, register, JWT
│   │   ├── auth.controller.ts
│   │   └── guards/
│   │       ├── jwt.guard.ts
│   │       ├── roles.guard.ts    ← RBAC: user | admin | superadmin
│   │       └── admin-jwt.guard.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   └── users.controller.ts
│   ├── vms/
│   │   ├── vms.module.ts
│   │   ├── vms.service.ts        ← Orchestrate: billing check → queue → Proxmox
│   │   ├── vms.controller.ts
│   │   └── vm-jobs/
│   │       ├── provision.job.ts  ← BullMQ job: create VM di Proxmox
│   │       └── delete.job.ts
│   ├── billing/
│   │   ├── billing.module.ts
│   │   ├── billing.service.ts    ← Topup, debit, cron job
│   │   └── billing.controller.ts
│   ├── proxmox/
│   │   ├── proxmox.module.ts
│   │   ├── proxmox.service.ts    ← Wrapper Proxmox API (satu-satunya yang hit Proxmox)
│   │   └── proxmox.types.ts
│   ├── payment/
│   │   ├── payment.module.ts
│   │   ├── midtrans.service.ts
│   │   └── payment.controller.ts ← Webhook handler
│   ├── tickets/
│   │   ├── tickets.module.ts
│   │   ├── tickets.service.ts
│   │   └── tickets.controller.ts
│   ├── admin/
│   │   ├── admin.module.ts
│   │   ├── admin-vms.controller.ts   ← Aksi admin ke VM
│   │   └── admin-finance.controller.ts ← Superadmin: revenue, profit
│   ├── notifications/
│   │   ├── notifications.module.ts
│   │   └── notifications.service.ts  ← Email + in-app
│   ├── audit/
│   │   ├── audit.module.ts
│   │   └── audit.service.ts          ← Catat semua aksi ke audit_logs
│   └── common/
│       ├── decorators/
│       │   ├── roles.decorator.ts
│       │   └── current-user.decorator.ts
│       ├── interceptors/
│       │   └── audit-log.interceptor.ts
│       └── filters/
│           └── http-exception.filter.ts
├── prisma/
│   └── schema.prisma             ← ORM schema (Prisma)
└── test/
    ├── auth.e2e-spec.ts
    ├── vms.e2e-spec.ts
    └── billing.e2e-spec.ts
```

### Tips struktur

- `proxmox.service.ts` adalah satu-satunya file yang boleh menggunakan Proxmox API token. Tidak ada module lain yang import Proxmox client langsung.
- `audit-log.interceptor.ts` dipasang sebagai global interceptor — setiap request yang masuk ke controller admin otomatis tercatat tanpa perlu manual di setiap method.
- Gunakan **Prisma** sebagai ORM untuk PostgreSQL — type-safe, migration mudah, DX bagus di NestJS.
- `packages/types/` berisi interface TypeScript yang di-share antara frontend dan backend (misalnya `VmStatus`, `PackageDto`) — satu sumber kebenaran, tidak perlu define ulang.


---

## 15. Future Update Plan

Roadmap ini disusun berdasarkan prioritas bisnis — fitur yang paling langsung berdampak ke revenue dan retensi user dikerjakan lebih dulu.

### Phase 2 — Stability & Growth (bulan 4–6 setelah launch)

Fokus: perkuat fondasi yang sudah ada, tambah fitur yang paling banyak diminta user awal.

#### 2.1 — Billing & paket yang lebih fleksibel
- **Custom resource**: user bisa pilih vCPU, RAM, disk secara bebas (bukan hanya paket preset) dengan harga dihitung otomatis per komponen
- **Auto-renewal**: opsi user aktifkan auto-topup via kartu kredit/GoPay saat saldo mendekati threshold
- **Invoice PDF**: generate invoice per bulan yang bisa diunduh user (berguna untuk klaim reimbursement perusahaan)
- **Promo code & voucher**: superadmin bisa buat kode promo dengan diskon nominal atau persen, dengan batas penggunaan dan expiry

#### 2.2 — VM features tambahan
- **Snapshot manual oleh user**: user bisa ambil snapshot VM kapan saja (bukan hanya backup otomatis oleh sistem), dengan limit jumlah snapshot per paket
- **Resize VM**: user bisa upgrade/downgrade paket VM tanpa harus hapus dan buat ulang (live resize RAM/disk via Proxmox API)
- **Multiple IP**: opsi tambah IP address ke VM yang sama dengan biaya tambahan
- **OS template library diperluas**: tambah template Windows Server (jika lisensi memungkinkan), FreeBSD, AlmaLinux, Rocky Linux

#### 2.3 — Developer experience
- **API publik dengan dokumentasi**: user bisa manage VM mereka via REST API sendiri (buat, hapus, start, stop) dengan API key per user — berguna untuk power user yang mau otomasi
- **Webhook**: user bisa set URL webhook untuk menerima event (VM running, saldo rendah, VM suspended)

#### 2.4 — Admin & operasional
- **Bulk actions di admin panel**: stop/suspend/delete banyak VM sekaligus
- **Scheduled maintenance mode**: admin bisa set window maintenance dengan notif otomatis ke user yang terpengaruh
- **Export data**: superadmin bisa export revenue report, user list, VM list ke CSV/Excel

---

### Phase 3 — Scale & Differentiation (bulan 7–12)

Fokus: fitur yang membedakan Langit Node dari kompetitor dan mendukung scaling infrastruktur.

#### 3.1 — Multi-region / multi-node
- **Pilihan lokasi**: user bisa pilih region/datacenter saat deploy VM (misal: Jakarta, Singapore)
- **Node selector**: admin bisa set aturan distribusi VM ke node tertentu (by region, by kapasitas)
- **Live migration via panel**: admin bisa migrate VM antar node tanpa downtime langsung dari admin panel

#### 3.2 — Networking lanjutan
- **Private network**: user bisa buat private VLAN sendiri untuk menghubungkan beberapa VM miliknya secara internal tanpa traffic ke internet
- **Firewall rules UI**: user bisa set inbound/outbound firewall rules VM-nya langsung dari dashboard (abstraksi di atas Proxmox firewall)
- **Floating IP / Elastic IP**: IP yang bisa dipindah-pindah antar VM tanpa downtime

#### 3.3 — Storage tambahan
- **Block storage**: user bisa tambah volume disk tambahan yang bisa di-attach/detach ke VM (mirip EBS di AWS)
- **Object storage**: layanan S3-compatible storage (pakai MinIO) sebagai produk tambahan selain VM

#### 3.4 — Managed services (differentiator)
- **Managed database**: deploy database (MySQL/PostgreSQL/Redis) sebagai managed service — user tidak perlu setup sendiri
- **One-click apps**: template VM yang sudah pre-install aplikasi siap pakai: WordPress, Nginx, Node.js, Docker
- **Automated backup user-facing**: user bisa setting jadwal backup VM-nya sendiri dengan retensi yang bisa dikonfigurasi, tersimpan di object storage

---

### Phase 4 — Enterprise & Ecosystem (tahun 2+)

Fokus: membuka segmen enterprise dan membangun ekosistem.

#### 4.1 — Enterprise features
- **Sub-user / team**: satu akun organisasi bisa punya banyak anggota dengan permission berbeda (owner, developer, billing-only)
- **Spending limit per user**: owner tim bisa set batas pengeluaran per anggota
- **Dedicated node**: opsi sewa node Proxmox dedicated untuk enterprise yang butuh isolasi penuh
- **SLA tier berbayar**: paket SLA 99.9% dengan kompensasi kredit otomatis jika downtime melebihi threshold

#### 4.2 — Monitoring & observability untuk user
- **Built-in monitoring dashboard**: user bisa lihat metrics CPU, RAM, disk, network VM-nya dalam 30 hari terakhir langsung di portal
- **Alert custom**: user bisa set alert jika CPU > X% atau disk > Y% — notif via email atau Telegram
- **Status page per user**: user bisa lihat history uptime VM-nya

#### 4.3 — Ekosistem & integrasi
- **Marketplace**: third-party bisa daftarkan template/app ke Langit Node marketplace
- **Affiliate program**: user bisa dapat komisi dari referral yang berhasil topup dan aktif
- **WHMCS / billing system integration**: untuk reseller yang mau jualan ulang layanan Langit Node ke klien mereka
- **Terraform provider**: power user bisa manage infrastruktur Langit Node via Terraform (infrastructure as code)

---

### Ringkasan timeline

```
Bulan 1–3   → Launch: core features (auth, billing, VM lifecycle, admin panel)
Bulan 4–6   → Phase 2: custom resource, snapshot user, API publik, resize VM
Bulan 7–12  → Phase 3: multi-region, private network, block storage, one-click apps
Tahun 2+    → Phase 4: enterprise, monitoring user, marketplace, affiliate
```

### Prioritas keputusan

Sebelum mengerjakan fitur Phase 2 ke atas, validasi dulu dengan data dari user aktif:
- Fitur mana yang paling banyak diminta di tiket support?
- Paket mana yang paling laku? (informasikan keputusan custom resource)
- Berapa persen user aktif menggunakan lebih dari 1 VM? (informasikan keputusan private network)

Jangan build fitur berdasarkan asumsi — build berdasarkan data.


---

## 16. Struktur Paket & Pricing

### Dua tier paket utama

Langit Node menawarkan dua jenis paket berdasarkan tipe IP:

#### Paket NAT
Cocok untuk: development, testing, belajar, bot, scraper, tunneling, service internal. Semua VM berbagi satu IP publik milik Langit Node, akses dari luar via port forwarding.

| Paket | vCPU | RAM | SSD | Bandwidth | Harga/bulan | Harga/jam |
|---|---|---|---|---|---|---|
| NAT Micro | 1 | 512 MB | 10 GB | 500 GB | Rp 10.000 | Rp 14 |
| NAT Lite | 1 | 1 GB | 20 GB | 1 TB | Rp 15.000 | Rp 21 |
| NAT Standard | 2 | 2 GB | 40 GB | 2 TB | Rp 25.000 | Rp 35 |
| NAT Pro | 4 | 4 GB | 60 GB | 3 TB | Rp 45.000 | Rp 63 |
| NAT Advanced | 4 | 8 GB | 80 GB | 4 TB | Rp 75.000 | Rp 104 |
| NAT Business | 8 | 16 GB | 120 GB | 5 TB | Rp 130.000 | Rp 181 |
| NAT Business+ | 8 | 24 GB | 160 GB | 6 TB | Rp 185.000 | Rp 257 |
| NAT Enterprise | 16 | 32 GB | 200 GB | 8 TB | Rp 240.000 | Rp 333 |
| NAT Enterprise+ | 16 | 48 GB | 300 GB | 10 TB | Rp 340.000 | Rp 472 |
| NAT Custom | Bebas (1–16) | Bebas | Bebas | Bebas | Dihitung otomatis | — |

Termasuk di paket NAT: IP private, 2 port TCP forward gratis (SSH + 1 port aplikasi).

#### Paket IP Public
Cocok untuk: web server, game server, API production, VPN, mail server, semua kebutuhan yang butuh IP dedicated. Setiap VM mendapat 1 IP publik dedicated, semua port bebas digunakan.

| Paket | vCPU | RAM | SSD | Bandwidth | Harga/bulan | Harga/jam |
|---|---|---|---|---|---|---|
| Public Starter | 1 | 1 GB | 20 GB | 1 TB | Rp 45.000 | Rp 63 |
| Public Lite | 2 | 2 GB | 40 GB | 2 TB | Rp 80.000 | Rp 111 |
| Public Pro | 4 | 4 GB | 60 GB | 3 TB | Rp 130.000 | Rp 181 |
| Public Advanced | 4 | 8 GB | 80 GB | 4 TB | Rp 200.000 | Rp 278 |
| Public Business | 8 | 16 GB | 120 GB | 5 TB | Rp 350.000 | Rp 486 |
| Public Business+ | 8 | 24 GB | 160 GB | 6 TB | Rp 490.000 | Rp 681 |
| Public Enterprise | 16 | 32 GB | 200 GB | 8 TB | Rp 650.000 | Rp 903 |
| Public Enterprise+ | 16 | 48 GB | 300 GB | 10 TB | Rp 890.000 | Rp 1.236 |
| Public Custom | Bebas (1–16) | Bebas | Bebas | Bebas | Dihitung otomatis | — |

Termasuk di paket IP Public: 1 IP public dedicated, semua port bebas digunakan.

> **Catatan harga**: Semua harga di atas sudah disesuaikan dengan referensi pasar lokal (Whplus, Natanetwork, Biznet Gio). Paket NAT diposisikan sebagai entry point kompetitif. Paket IP Public adalah profit center utama.

### Add-on & harga resource custom

| Resource | Harga |
|---|---|
| vCPU tambahan | Rp 8.000 / core / bulan |
| RAM tambahan | Rp 8.000 / GB / bulan |
| SSD tambahan | Rp 2.000 / 10 GB / bulan |
| Bandwidth tambahan | Rp 3.000 / 100 GB |
| IP public tambahan (ke-2, ke-3, dst) | Rp 20.000 / IP / bulan |
| Port forward tambahan (NAT) | Rp 1.500 / port / bulan |

### Formula harga custom

Untuk paket custom, harga dihitung otomatis di frontend saat user memilih resource:

```
Paket NAT custom:
  Harga = (vCPU × 8.000)
        + (RAM_GB × 8.000)
        + (SSD_GB ÷ 10 × 2.000)
        + (BW_GB ÷ 100 × 3.000)

Paket IP Public custom:
  Harga = (vCPU × 8.000)
        + (RAM_GB × 8.000)
        + (SSD_GB ÷ 10 × 2.000)
        + (BW_GB ÷ 100 × 3.000)
        + 25.000   ← biaya IP public (sudah termasuk 1 IP)
        + (extra_ip × 20.000)
```

Implementasi di frontend sebagai kalkulator real-time — user geser slider, harga otomatis update tanpa reload halaman.

### Perbandingan dengan kompetitor

| Provider | Paket | Spec | Harga/bln |
|---|---|---|---|
| **Langit Node** | NAT Lite | 1 vCPU / 1GB / 20GB | **Rp 15.000** |
| Whplus | NAT | 1GB / 15GB | Rp 17.500 |
| **Langit Node** | Public Starter | 1 vCPU / 1GB / 20GB | **Rp 45.000** |
| Natanetwork | IP Public | 1C / 1GB / 20GB SSD | Rp 40.000 |
| Biznet Gio | IP Public | 1C / 1GB / 60GB + free BW | Rp 50.000 |
| **Langit Node** | Public Pro | 4 vCPU / 4GB / 60GB | **Rp 130.000** |
| Whplus | IP Public | 2GB / 60GB / 2TB | Rp 150.000 |

### Strategi pricing

- **NAT = entry point / loss leader**: harga murah untuk tarik user masuk dan coba platform. Target konversi: user upgrade ke IP Public setelah nyaman.
- **IP Public = profit center**: margin utama ada di sini. Harga Rp 45.000–650.000 kompetitif sekaligus profitable di occupancy 60–70%.
- **Paket Enterprise (16 core)**: target segmen developer/bisnis yang butuh resource besar — margin per unit jauh lebih besar.
- **Jangan race to bottom di NAT**: Whplus bisa jual Rp 12.500 karena skala ribuan user. Langit Node cukup kompetitif di Rp 10.000–15.000 untuk tier bawah.

### Estimasi break-even (server Hetzner AX41 ~Rp 680.000/bln)

| Skenario | VM aktif yang dibutuhkan | Revenue | Profit |
|---|---|---|---|
| Semua NAT Lite | 46 VM | Rp 690.000 | ~BEP |
| Semua Public Starter | 16 VM | Rp 720.000 | +Rp 40.000 |
| Mix: 20 NAT + 10 Public Pro | 30 VM | Rp 1.100.000 | +Rp 420.000 |
| Mix: 10 NAT + 8 Public Pro + 2 Public Enterprise | 20 VM | Rp 2.825.000 | +Rp 2.145.000 |

Skenario ideal adalah mix — paket NAT menarik volume user, paket IP Public (terutama Business & Enterprise) yang mendatangkan margin besar.

### Logika paket di database

```sql
-- packages table diperluas dengan kolom tipe IP
ALTER TABLE packages ADD COLUMN ip_type VARCHAR DEFAULT 'nat';
-- ip_type: 'nat' | 'public'
ALTER TABLE packages ADD COLUMN included_ports INT DEFAULT 2;
-- untuk NAT: berapa port forward yang termasuk gratis
ALTER TABLE packages ADD COLUMN is_custom BOOLEAN DEFAULT FALSE;
-- paket custom: resource dihitung dari vm_overrides

-- vm_addons: add-on per VM (IP tambahan, port tambahan, dll)
CREATE TABLE vm_addons (
  id            UUID PRIMARY KEY,
  vm_id         UUID REFERENCES vms(id),
  user_id       UUID REFERENCES users(id),
  addon_type    VARCHAR NOT NULL,   -- 'extra_ip' | 'extra_port' | 'extra_cpu' | 'extra_ram' | 'extra_disk'
  quantity      INT DEFAULT 1,
  unit_price    DECIMAL(12,4),
  metadata      JSONB,              -- { ip_address: "x.x.x.x", port: 2222 } dll
  created_at    TIMESTAMP DEFAULT NOW()
);

-- nat_port_forwards: mapping port forward per VM NAT
CREATE TABLE nat_port_forwards (
  id            UUID PRIMARY KEY,
  vm_id         UUID REFERENCES vms(id),
  external_port INT NOT NULL,       -- port di IP publik Langit Node
  internal_port INT NOT NULL,       -- port di dalam VM
  protocol      VARCHAR DEFAULT 'tcp',
  is_free       BOOLEAN DEFAULT FALSE, -- 2 port pertama gratis
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### Roadmap IP Public

Saat ini platform bisa langsung launch dengan **paket NAT** menggunakan IP lokal/private yang tersedia. Untuk membuka paket IP Public:

1. **Opsi cepat**: request IP block (`/29` = 6 IP usable) dari provider baremetal (Hetzner, OVH, Vultr) — biasanya gratis atau murah, sudah ter-route ke server.
2. **Opsi lokal**: sewa IP transit dari ISP/DC Indonesia (Biznet, CBN) untuk latency lebih baik ke user lokal.
3. **Opsi skala besar (Phase 3+)**: daftar ASN sendiri ke APNIC, minta alokasi IP block.

---

## 17. VM Console (Web-based)

Setiap user bisa akses console VM mereka langsung dari browser tanpa perlu SSH client atau software tambahan. Superadmin bisa akses console VM siapapun.

### Teknologi

- **noVNC** — client VNC berbasis web (JavaScript), sudah built-in di Proxmox
- **Proxmox VNC ticket** — Proxmox generate tiket sementara (expire 60 detik) yang dipakai untuk autentikasi koneksi VNC
- **Backend sebagai proxy** — user tidak pernah tahu alamat Proxmox; semua request divalidasi dan diproxy lewat backend Langit Node

### Flow autentikasi console

```
[1] User klik tombol "Console" di halaman detail VM
         │
         ▼
[2] Frontend: POST /api/vms/{vm_id}/console
         │
         ▼
[3] Backend validasi:
    - Apakah JWT valid?
    - Apakah vm_id milik user ini? (atau apakah role = admin/superadmin?)
         │
         ▼
[4] Backend hit Proxmox API:
    POST /nodes/{node}/qemu/{vmid}/vncproxy
    → Proxmox return: { ticket, port, upid }
         │
         ▼
[5] Backend return ke frontend:
    { wsUrl: "wss://proxmox-internal:5900", ticket: "...", expires_in: 60 }
         │
         ▼
[6] Frontend inisialisasi noVNC:
    RFB.connect(wsUrl, { credentials: { password: ticket } })
         │
         ▼
[7] User dapat console langsung di browser (full keyboard + mouse support)
```

### Implementasi di frontend

```tsx
// components/vm/vm-console.tsx
import { useEffect, useRef } from 'react'

export function VmConsole({ vmId }: { vmId: string }) {
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function startConsole() {
      // Minta ticket dari backend
      const res = await fetch(`/api/vms/${vmId}/console`, { method: 'POST' })
      const { wsUrl, ticket } = await res.json()

      // Dynamic import noVNC (lazy load)
      const { default: RFB } = await import('@novnc/novnc/lib/rfb')

      const rfb = new RFB(canvasRef.current!, wsUrl, {
        credentials: { password: ticket },
      })

      rfb.scaleViewport = true
      rfb.resizeSession = true
    }

    startConsole()
  }, [vmId])

  return (
    <div
      ref={canvasRef}
      style={{ width: '100%', height: '600px', background: '#000' }}
    />
  )
}
```

### Implementasi di backend (NestJS)

```typescript
// vms/vms.controller.ts
@Post(':id/console')
@UseGuards(JwtGuard)
async getConsole(@Param('id') vmId: string, @CurrentUser() user: User) {
  // Validasi kepemilikan VM
  const vm = await this.vmsService.findOneOrFail(vmId, user.id)

  // Minta VNC ticket dari Proxmox
  const ticket = await this.proxmoxService.createVncTicket(
    vm.proxmoxNode,
    vm.proxmoxVmid
  )

  // Catat di audit log
  await this.auditService.log({
    actorType: 'user',
    actorId: user.id,
    action: 'vm.console_access',
    resourceType: 'vm',
    resourceId: vmId,
  })

  return ticket
}

// admin endpoint — bisa akses console VM siapapun
@Post('admin/vms/:id/console')
@UseGuards(AdminJwtGuard)
@Roles('admin', 'superadmin')
async adminGetConsole(@Param('id') vmId: string, @CurrentAdmin() admin: AdminUser) {
  const vm = await this.vmsService.findById(vmId) // tanpa filter user_id
  const ticket = await this.proxmoxService.createVncTicket(vm.proxmoxNode, vm.proxmoxVmid)

  await this.auditService.log({
    actorType: 'admin',
    actorId: admin.id,
    action: 'vm.console_access',
    resourceType: 'vm',
    resourceId: vmId,
    metadata: { reason: 'admin_tshoot' },
  })

  return ticket
}
```

### Fitur console yang tersedia

| Fitur | User | Admin/Superadmin |
|---|---|---|
| Akses console VM sendiri | ✓ | ✓ |
| Akses console VM user lain | ✗ | ✓ |
| Full keyboard input | ✓ | ✓ |
| Copy-paste via clipboard API | ✓ | ✓ |
| Scale viewport (responsif) | ✓ | ✓ |
| Screenshot console | ✓ | ✓ |
| Ctrl+Alt+Del (reboot dari dalam) | ✓ | ✓ |
| Session dicatat di audit log | otomatis | otomatis |

### Keamanan console

- Ticket VNC expire dalam **60 detik** setelah diissue — jika tidak dipakai, tidak bisa digunakan
- Koneksi WebSocket di-proxy via backend, bukan langsung ke Proxmox
- Setiap akses console tercatat di audit log lengkap dengan timestamp dan IP user
- Admin yang akses console VM user akan muncul di audit log dengan `actor_type = 'admin'` — accountability penuh


---

## 18. VM ID, Penamaan & Akses SSH

### Konvensi VM ID

Setiap VM di Langit Node punya dua ID:

**1. Proxmox VMID** — angka murni yang dipakai Proxmox secara internal (100, 101, 102, dst). Tidak pernah ditampilkan ke user.

**2. Langit Node VM ID** — format human-readable yang ditampilkan di dashboard:

```
Format : ln-{tipe}-{nomor 4 digit}
Contoh : ln-pub-0001   → VM IP Public pertama
         ln-nat-0042   → VM NAT ke-42
         ln-pub-0120   → VM IP Public ke-120
```

| Segmen | Nilai | Keterangan |
|---|---|---|
| `ln` | tetap | Prefix Langit Node |
| `nat` / `pub` | dinamis | Tipe paket VM |
| `0001`–`9999` | auto-increment | Nomor urut per tipe, 4 digit dengan leading zero |

Implementasi di database:
```sql
ALTER TABLE vms ADD COLUMN display_id VARCHAR GENERATED ALWAYS AS (
  'ln-' || ip_type || '-' || LPAD(sequence_number::TEXT, 4, '0')
) STORED;
```

### Hostname VM

Hostname di dalam VM di-set otomatis saat provisioning menggunakan display ID:

```bash
# Dijalankan oleh provisioning job saat setup VM
hostnamectl set-hostname ln-pub-0001
echo "127.0.1.1 ln-pub-0001" >> /etc/hosts
```

User melihat hostname ini saat login SSH:
```
root@ln-pub-0001:~#
```

---

### Akses SSH — dua skenario

#### Paket NAT

VM NAT tidak punya IP public sendiri. Akses SSH dilakukan via port forwarding dari IP publik Langit Node:

```
User → ssh root@103.x.x.x -p 22042
           ↓
     Mikrotik dst-nat → Proxmox (10.10.10.250)
           ↓
     VM ln-nat-0042 :22 (IP private: 10.20.0.42)
```

**Alokasi port SSH untuk NAT:**
- Range: `22002–22254` — align ke last octet IP VM (VM `10.20.0.X` → port `220XX`)
- Kapasitas: 253 VM NAT per subnet `/24` (bottleneck sebenarnya ada di IP pool, bukan port)
- Setiap VM dapat satu port unik yang tersimpan di `nat_port_forwards`
- Port dialokasikan otomatis saat provisioning, tidak bisa dipilih user
- Port lain (selain SSH) bisa ditambah via add-on port forward

```sql
-- Contoh data nat_port_forwards untuk VM NAT
INSERT INTO nat_port_forwards (vm_id, external_port, internal_port, protocol, is_free)
VALUES ('uuid-vm', 22042, 22, 'tcp', true);  -- SSH gratis
```

Port forward dikelola otomatis oleh backend via **Mikrotik RouterOS API** (`MikrotikService.addSshForward`), bukan iptables di Proxmox. Flow-nya:

```
Backend → Mikrotik RouterOS API (port 8728)
        → tambah dst-nat rule: dport 22042 → 10.20.0.42:22
```

Contoh rule yang dibuat di Mikrotik:
```routeros
/ip firewall nat add \
    chain=dstnat protocol=tcp dst-port=22042 \
    action=dst-nat to-addresses=10.20.0.42 to-ports=22 \
    comment="ln-nat-0042-ssh"
```

#### Paket IP Public

VM IP Public punya IP dedicated — akses SSH langsung tanpa NAT:

```
User → ssh root@103.x.x.5 -p 22
           ↓
     Langsung ke VM ln-pub-0001 (IP: 103.x.x.5)
```

IP di-assign ke interface VM saat provisioning via Proxmox API. Port 22 terbuka default, semua port lain bebas digunakan tanpa konfigurasi tambahan.

---

### Credential yang ditampilkan di dashboard

**Form create VM** — user input sebelum deploy:

```
┌─────────────────────────────────────────────────────────┐
│  Buat VM Baru                                           │
├─────────────────────────────────────────────────────────┤
│  Hostname     : [my-webserver        ]                  │
│                 (opsional, default: ln-nat-0001)        │
│  OS Template  : [Ubuntu 22.04 LTS  ▼ ]                 │
│  Paket        : [NAT Lite           ▼ ]                 │
│  Password Root: [••••••••••••••     ]                   │
│                 Min 8 karakter, huruf + angka           │
│                 [Generate otomatis]                     │
└─────────────────────────────────────────────────────────┘
```

**Dashboard setelah VM running** — password tidak ditampilkan lagi karena user yang set sendiri:

```
┌─────────────────────────────────────────────────────────┐
│  my-webserver (ln-nat-0001) — siap digunakan            │
├─────────────────────────────────────────────────────────┤
│  IP Address  : 103.x.x.x                                │
│  Port SSH    : 22042                                     │
│  Username    : root                                      │
├─────────────────────────────────────────────────────────┤
│  Perintah SSH siap pakai:                               │
│  ssh root@103.x.x.x -p 22042                           │
│                                                         │
│  [Salin perintah]  [Buka Console]  [Reset Password]    │
└─────────────────────────────────────────────────────────┘
```

**Aturan password:**
- User **input sendiri** saat form create VM — bukan auto-generate
- Minimal 8 karakter, harus mengandung huruf dan angka
- Ada tombol "Generate otomatis" sebagai shortcut jika user tidak mau mikir password
- Dashboard **tidak menampilkan ulang** password setelah VM running — user sudah tahu karena isi sendiri
- User bisa **Reset Password** kapan saja dari dashboard — buka form input password baru, di-set via QEMU agent

Password di-set ke VM via Proxmox guest agent:
```typescript
// proxmox/proxmox.service.ts
async setRootPassword(node: string, vmid: number, password: string) {
  await this.client.post(
    `/nodes/${node}/qemu/${vmid}/agent/set-user-password`,
    { username: 'root', password }
  )
}
```

---

### Flow lengkap: VM selesai dibuat → user bisa SSH

```
[1] Provisioning job selesai
    Proxmox confirm VM status = running
         │
         ▼
[2] Backend set password (dari input user saat form create VM)
    dan set hostname via QEMU guest agent
         │
         ▼
[3] Untuk NAT: alokasi port SSH (range 22002–22254, align ke last octet IP)
    Setup port forward di Mikrotik via RouterOS API
    Simpan ke nat_port_forwards
         │
         ▼
[4] Update VM record di database
    status = 'running', ip_address terisi, hostname terisi
    credentialEnc tidak perlu disimpan (user sudah tahu passwordnya)
         │
         ▼
[5] Notifikasi ke user (email + in-app)
    "VM my-webserver (ln-nat-0001) Anda sudah siap!"
         │
         ▼
[6] User buka halaman detail VM
    Dashboard tampilkan IP, port SSH, dan perintah SSH siap salin
    Password TIDAK ditampilkan — user ingat karena input sendiri
         │
         ▼
[7] User salin perintah, jalankan di terminal
    ssh root@103.x.x.5          (IP Public)
    ssh root@103.x.x.x -p 22042  (NAT)
         │
         ▼
[8] SSH session aktif
    root@my-webserver:~#
```

---

## 19. Skenario Testing — VM ID, SSH & Akses

### Unit test

| Test case | Yang divalidasi |
|---|---|
| Generate VM display ID | Format `ln-nat-0001`, leading zero benar, tipe sesuai paket |
| Auto-increment ID | VM ke-2 dapat `0002`, tidak ada duplikat concurrency |
| Generate password | 16 karakter, mengandung campuran karakter, tidak ada karakter ambigu (0/O, l/1) |
| Alokasi port NAT | Port dari range 22002–22254 (align ke last octet), tidak boleh duplikat dengan VM lain yang aktif |
| Port NAT habis | Jika range penuh, provisioning ditolak dengan pesan yang jelas |

### Integration test

| Test case | Skenario | Expected result |
|---|---|---|
| Provisioning NAT lengkap | Buat VM NAT → cek port forwarding terbuat di DB + Mikrotik dst-nat rule aktif | Port SSH bisa di-reach dari luar |
| Provisioning IP Public | Buat VM → IP di-assign → SSH port 22 terbuka | `ssh root@IP` berhasil |
| Password set via agent | Mock Proxmox agent → verifikasi password dikirim ke VM | Password yang di-set sama dengan yang digenerate |
| Credential expire | Credential disimpan sementara → setelah 10 menit → tidak bisa diambil lagi | 404 / expired |
| Reset password | User request reset → password baru digenerate → di-set ke VM → ditampilkan sekali | Password lama tidak lagi valid |
| Delete VM NAT | Hapus VM → port forwarding dihapus dari DB + Mikrotik dst-nat rule di-remove via API | Port tidak lagi forward ke mana-mana |

### E2E test (Playwright)

| Test case | Skenario |
|---|---|
| Full flow NAT | Register → topup → buat VM NAT → credential muncul → salin perintah SSH → verify format `ssh root@IP -p PORT` |
| Full flow IP Public | Register → topup → buat VM IP Public → credential muncul → verify format `ssh root@IP` |
| Password 1x tampil | Buka halaman detail VM → credential tampil → refresh halaman → password tidak tampil lagi |
| Tombol salin | Klik "Salin perintah" → clipboard berisi perintah SSH yang benar |
| Reset password | Klik "Reset password" → konfirmasi dialog → password baru muncul → format valid |
| Console noVNC | Klik "Buka Console" → noVNC terbuka di browser → keyboard input berfungsi |

### Security test

| Test case | Expected result |
|---|---|
| User A akses credential VM user B | `403 Forbidden` — tidak bisa lihat password VM orang lain |
| Credential setelah expire | `410 Gone` — tidak bisa diambil ulang meski punya JWT valid |
| Port NAT collision | Dua provisioning serentak tidak boleh dapat port yang sama (row-level lock) |
| Port scan VM NAT | Dari luar, hanya port yang dialokasikan yang terbuka — port lain timeout |
| Brute force SSH | Setelah 5 gagal, VM bisa diproteksi (opsional: fail2ban di dalam VM template) |
| Admin akses credential user | Admin tidak bisa lihat password user — hanya bisa reset via panel |

### Infrastructure test

| Test case | Cara | Expected result |
|---|---|---|
| iptables NAT rule persistent | Restart server Proxmox → cek rule masih ada | Rule survive reboot (disimpan via iptables-save) |
| VM IP bertahan reboot | Reboot VM → IP address sama | IP tidak berubah setelah restart |
| Port forward setelah VM suspend | Suspend VM NAT → coba SSH → timeout | Port tidak forward saat VM suspended |
| Port forward setelah VM resume | Resume VM NAT → coba SSH → berhasil | Port forward aktif kembali |


---

## 20. Konfigurasi Jaringan — Mikrotik & Proxmox

### Topologi jaringan

```
Internet
    │
Mikrotik (10.10.10.1) — gateway, NAT masquerade, dst-nat rules
    │
    ├── 10.10.10.0/24 (jaringan fisik)
    │       └── Proxmox (10.10.10.250)
    │               ├── vmbr0 — bridge ke fisik (10.10.10.250)
    │               └── vmbr1 — bridge internal VM NAT (10.20.0.1)
    │                       └── 10.20.0.0/24 (subnet VM NAT)
    │                               ├── VM NAT #1 → 10.20.0.2
    │                               ├── VM NAT #2 → 10.20.0.3
    │                               └── ...hingga 10.20.0.254
```

### Alokasi IP range

| Segmen | Range | Keterangan |
|---|---|---|
| Jaringan fisik | `10.10.10.0/24` | Existing, tidak diubah |
| Mikrotik gateway | `10.10.10.1` | Existing |
| Proxmox host | `10.10.10.250` | Existing |
| VM NAT subnet | `10.20.0.0/24` | Baru, internal Proxmox saja |
| Gateway VM NAT | `10.20.0.1` | IP `vmbr1` di Proxmox |
| VM NAT IP pool | `10.20.0.2` – `10.20.0.254` | Maksimal 253 VM NAT |
| Port SSH NAT | `22002` – `22254` | Align ke last octet IP VM |

Konvensi port: VM dengan IP `10.20.0.X` mendapat port SSH `220XX`. Contoh: `10.20.0.42` → port `22042`. Memudahkan debugging — dari port langsung ketahuan IP VM-nya.

---

### Konfigurasi Proxmox

Edit `/etc/network/interfaces` di node Proxmox:

```bash
auto lo
iface lo inet loopback

auto ens18
iface ens18 inet manual

# vmbr0 — bridge ke jaringan fisik (existing, tidak diubah)
auto vmbr0
iface vmbr0 inet static
    address 10.10.10.250/24
    gateway 10.10.10.1
    bridge-ports ens18
    bridge-stp off
    bridge-fd 0

# vmbr1 — bridge internal untuk VM NAT (BARU)
# Catatan: gunakan underscore (bridge_ports, bridge_stp, bridge_fd) bukan dash
auto vmbr1
iface vmbr1 inet static
    address 10.20.0.1/24
    bridge_ports none
    bridge_stp off
    bridge_fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s '10.20.0.0/24' -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '10.20.0.0/24' -o vmbr0 -j MASQUERADE
```

Apply konfigurasi:
```bash
ifreload -a
# atau
systemctl restart networking
```

Pastikan IP forwarding persistent saat reboot:
```bash
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
```

Simpan iptables rule supaya survive reboot:
```bash
apt install iptables-persistent -y
netfilter-persistent save
```

Verifikasi bridge sudah aktif:
```bash
brctl show
# Harus muncul vmbr0 dan vmbr1
ip addr show vmbr1
# Harus tampil: inet 10.20.0.1/24
```

---

### Konfigurasi Mikrotik

Tiga hal yang perlu dikonfigurasi di Mikrotik:

**1. Static route ke subnet VM NAT**
```routeros
/ip route add \
    dst-address=10.20.0.0/24 \
    gateway=10.10.10.250 \
    comment="Route ke VM NAT Proxmox"
```

**2. Masquerade untuk outbound VM NAT**
```routeros
/ip firewall nat add \
    chain=srcnat \
    src-address=10.20.0.0/24 \
    action=masquerade \
    comment="VM NAT outbound internet"
```

**3. Dst-nat untuk port forwarding SSH (dibuat otomatis oleh backend)**
```routeros
# Contoh manual — di production dibuat via RouterOS API oleh backend
/ip firewall nat add \
    chain=dstnat \
    protocol=tcp \
    dst-port=22002 \
    action=dst-nat \
    to-addresses=10.20.0.2 \
    to-ports=22 \
    comment="ln-nat-0001 SSH"
```

Aktifkan RouterOS API di Mikrotik agar backend bisa tambah/hapus rule otomatis:
```routeros
/ip service enable api
/ip service set api port=8728
```

Buat user API khusus (jangan pakai admin):
```routeros
/user group add name=api-langitnode policy=read,write,api
/user add name=langitnode-api group=api-langitnode password=STRONG_PASSWORD
```

---

### IP assignment untuk VM NAT

VM NAT butuh IP yang **fixed/predictable** karena IP dipakai untuk setup port forward di Mikrotik. Solusi terbaik: **dnsmasq dengan DHCP reservation per MAC address** — VM selalu dapat IP yang sama setiap boot.

Setup dnsmasq di host Proxmox:

```bash
apt install dnsmasq -y

cat > /etc/dnsmasq.d/vmbr1.conf << 'EOF'
interface=vmbr1
bind-interfaces
dhcp-range=10.20.0.2,10.20.0.254,24h
dhcp-option=option:router,10.20.0.1
dhcp-option=option:dns-server,1.1.1.1,8.8.8.8
EOF

systemctl reload dnsmasq   # reload (bukan restart) agar lease VM yang running tidak putus
systemctl enable dnsmasq
```

Setiap kali VM baru dibuat, backend otomatis tambah DHCP reservation lewat `DnsmasqService`:

```bash
# Contoh entry yang ditambahkan backend ke vmbr1.conf
# Format: dhcp-host=MAC,IP,hostname
dhcp-host=52:54:00:ab:cd:ef,10.20.0.2,ln-nat-0001
```

Flow IP assignment saat provisioning VM NAT:
```
Buat VM di Proxmox
→ Proxmox assign MAC address otomatis
→ Backend baca MAC dari Proxmox API
→ Backend alokasikan IP dari pool (10.20.0.2–10.20.0.254) secara atomic
→ Backend tulis DHCP reservation ke dnsmasq (MAC → IP)
→ Backend reload dnsmasq (bukan restart)
→ VM boot → dapat IP fixed sesuai reservation
→ Backend setup port forward di Mikrotik pakai IP tersebut
```

---

### Struktur file TypeScript di project

Semua service berikut tinggal di `apps/api/src/` dalam monorepo:

```
apps/api/src/
├── mikrotik/
│   ├── mikrotik.module.ts
│   └── mikrotik.service.ts      ← manage dst-nat rules di Mikrotik
├── dnsmasq/
│   ├── dnsmasq.module.ts
│   └── dnsmasq.service.ts       ← manage DHCP reservation di dnsmasq
├── proxmox/
│   ├── proxmox.module.ts
│   └── proxmox.service.ts       ← wrapper Proxmox API
└── vms/
    ├── vms.module.ts
    ├── vms.service.ts            ← orchestrate semua service di bawah
    ├── vms.controller.ts
    └── vm-jobs/
        └── provision.job.ts     ← BullMQ async job
```

---

### Integrasi backend — MikrotikService

File: `apps/api/src/mikrotik/mikrotik.service.ts`

```bash
npm install node-routeros
```

```typescript
import { Injectable } from '@nestjs/common'
import { RouterOSAPI } from 'node-routeros'

@Injectable()
export class MikrotikService {
  private connect() {
    return new RouterOSAPI({
      host: process.env.MIKROTIK_HOST,
      user: process.env.MIKROTIK_USER,
      password: process.env.MIKROTIK_PASS,
      port: 8728,
    })
  }

  async addSshForward(vmIp: string, externalPort: number, vmDisplayId: string) {
    const api = this.connect()
    await api.connect()
    try {
      await api.write('/ip/firewall/nat/add', [
        '=chain=dstnat',
        '=protocol=tcp',
        `=dst-port=${externalPort}`,
        '=action=dst-nat',
        `=to-addresses=${vmIp}`,
        '=to-ports=22',
        `=comment=${vmDisplayId} SSH`,
      ])
    } finally {
      await api.close()
    }
  }

  async removeSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/remove', [`=.id=${rule['.id']}`])
      }
    } finally {
      await api.close()
    }
  }

  async disableSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/set', [
          `=.id=${rule['.id']}`,
          '=disabled=yes',
        ])
      }
    } finally {
      await api.close()
    }
  }

  async enableSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/set', [
          `=.id=${rule['.id']}`,
          '=disabled=no',
        ])
      }
    } finally {
      await api.close()
    }
  }
}
```

---

### DnsmasqService

File: `apps/api/src/dnsmasq/dnsmasq.service.ts`

Implementasi lengkap ada di Sprint 3 (File 11). Lihat section tersebut untuk code terbaru — sudah termasuk concurrent write protection dan `systemctl reload` (bukan restart).

> Catatan operasional: backend butuh sudoers entry spesifik di Proxmox host — jangan jalankan sebagai root. Tambahkan ke `/etc/sudoers.d/langitnode`:
> ```
> langitnode ALL=(ALL) NOPASSWD: /bin/systemctl reload dnsmasq
> ```

---

### Provision job — orchestrasi lengkap

> **Catatan**: Implementasi lengkap dan final ada di **Sprint 3 — File 19** (`provision.job.ts`). Bagian ini hanya menjelaskan urutan langkah orchestrasi secara naratif.

Urutan orchestrasi saat job `'provision'` dijalankan BullMQ:

```
1. Update VM status → 'provisioning'
2. Alokasi last octet IP NAT secara atomic ($transaction + UNIQUE constraint)
   → ip = 10.20.0.X, sshPort = 220XX
3. Buat VM di Proxmox via API (createVm)
   → VM NAT: bridge=vmbr1, VM Public: bridge=vmbr0
4. [NAT only] Baca MAC dari Proxmox config
   → Tulis DHCP reservation ke dnsmasq (addReservation)
   → Tambah dst-nat rule ke Mikrotik via RouterOS API (addSshForward)
   → Simpan ke nat_port_forwards
5. Start VM (startVm)
6. Poll QEMU guest agent sampai ready, max 120s (waitForAgent)
7. Set password dari input user ke VM (setRootPassword via QEMU agent)
8. Set hostname dari input user ke VM (setHostname via QEMU agent exec)
9. Update DB: status='running', ipAddress, sshPort
   (credential tidak disimpan — user sudah tahu passwordnya sendiri)

Jika error di langkah manapun:
→ Refund saldo user (increment balance)
→ Update VM status → 'failed'
→ Re-throw error (BullMQ akan retry sesuai config)
```

---

### Setting VM NAT di Proxmox

Saat provisioning VM NAT, backend set konfigurasi jaringan VM via Proxmox API:

```typescript
// Konfigurasi network VM NAT saat create
await proxmox.post(`/nodes/${node}/qemu`, {
  vmid: proxmoxVmid,
  name: displayId,           // ln-nat-0001
  cores: vcpu,
  memory: ramMb,
  net0: `virtio,bridge=vmbr1`,  // ← pakai vmbr1, bukan vmbr0
  ipconfig0: `ip=10.20.0.${lastOctet}/24,gw=10.20.0.1`,
  nameserver: '1.1.1.1 8.8.8.8',
  // ... storage, OS template dll
})
```

VM NAT mendapat IP `10.20.0.X` dimana `X` = last octet yang dialokasikan dari pool. Gateway-nya adalah `10.20.0.1` (IP `vmbr1` Proxmox).

---

### Checklist setup jaringan sebelum launch

- [ ] `vmbr1` aktif di Proxmox, IP `10.20.0.1/24` terkonfirmasi
- [ ] IP forwarding aktif: `cat /proc/sys/net/ipv4/ip_forward` → harus `1`
- [ ] iptables MASQUERADE rule aktif: `iptables -t nat -L POSTROUTING -n`
- [ ] iptables rule persistent: `iptables-persistent` terinstall, `netfilter-persistent save` sudah dijalankan
- [ ] Static route di Mikrotik: `10.20.0.0/24` via `10.10.10.250` aktif
- [ ] Test ping dari Proxmox ke VM: buat VM test, `ping 10.20.0.2` dari host Proxmox
- [ ] Test internet dari dalam VM: SSH ke VM test, `ping 8.8.8.8` dari dalam VM
- [ ] Test port forward SSH: dari PC luar, `ssh root@[IP-Mikrotik] -p 22002`
- [ ] Mikrotik RouterOS API aktif: `telnet 10.10.10.1 8728` harus connect
- [ ] Backend bisa connect ke Mikrotik API: test `MikrotikService.addSshForward()` di staging


---

## 21. Panduan Pembuatan File Backend (Step by Step)

Semua file backend ada di `apps/api/`. Buat dari atas ke bawah sesuai urutan — jangan skip sprint karena tiap sprint bergantung pada sprint sebelumnya.

---

### Sprint 0 — Init project (command, tidak ada file manual)

Jalankan dari root folder monorepo:

```bash
# Install Turborepo dan buat struktur monorepo
npm install -g turbo
npx create-turbo@latest langitnode --package-manager npm
cd langitnode

# Masuk ke folder api
cd apps/api

# Install NestJS CLI dan init project
npm install -g @nestjs/cli
nest new . --skip-git --package-manager npm

# Install semua dependency yang dibutuhkan
npm install @nestjs/config @nestjs/bull bull
npm install @prisma/client prisma
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install node-routeros
npm install class-validator class-transformer
npm install --save-dev @types/bcrypt @types/passport-jwt

# Init Prisma
npx prisma init
```

Setelah ini struktur folder otomatis terbentuk. Lanjut ke Sprint 1.

---

### Sprint 1 — Pondasi

#### File 1: `apps/api/.env`

Buat file ini di root folder `apps/api/`:

```env
# Database
DATABASE_URL="postgresql://langitnode:PASSWORD@localhost:5432/langitnode"

# JWT
JWT_SECRET="ganti-dengan-random-string-panjang-minimal-32-char"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Redis (untuk BullMQ queue)
REDIS_HOST="localhost"
REDIS_PORT="6379"

# Proxmox
PROXMOX_HOST="10.10.10.250"
PROXMOX_PORT="8006"
PROXMOX_TOKEN_ID="langitnode@pve!langitnode-token"
PROXMOX_TOKEN_SECRET="isi-dengan-token-secret-dari-proxmox"
PROXMOX_NODE="pve"
PROXMOX_VERIFY_SSL="false"    # set true di production dengan cert valid

# Mikrotik
MIKROTIK_HOST="10.10.10.1"
MIKROTIK_USER="langitnode-api"
MIKROTIK_PASS="password-user-api-mikrotik"

# VM NAT
NAT_BRIDGE="vmbr1"
NAT_SUBNET="10.20.0.0/24"
NAT_GATEWAY="10.20.0.1"
NAT_IP_START="10.20.0.2"
NAT_IP_END="10.20.0.254"
NAT_SSH_PORT_START="22002"

# VM Public
PUBLIC_BRIDGE="vmbr0"

# App
PORT=3000
NODE_ENV="development"
```

---

#### File 2: `apps/api/prisma/schema.prisma`

Ini sudah dibuat otomatis oleh `npx prisma init`. Ganti isinya dengan:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id               String    @id @default(uuid())
  email            String    @unique
  passwordHash     String
  fullName         String?
  phone            String?
  status           String    @default("active")
  balance          Decimal   @default(0) @db.Decimal(15, 2)
  emailVerifiedAt  DateTime?
  createdAt        DateTime  @default(now())

  vms          Vm[]
  transactions Transaction[]
  tickets      Ticket[]
}

// Sequence counter terpisah per ip_type — dipakai untuk generate displayId secara atomic
model VmCounter {
  ipType    String @id   // 'nat' | 'public'
  lastSeq   Int    @default(0)
}

model Package {
  id            String   @id @default(uuid())
  name          String
  ipType        String   @default("nat")
  vcpu          Int
  ramMb         Int
  diskGb        Int
  bandwidthGb   Int
  priceMonthly  Decimal  @db.Decimal(12, 2)
  priceHourly   Decimal  @db.Decimal(12, 4)
  isActive      Boolean  @default(true)

  vms Vm[]
}

model Vm {
  id               String    @id @default(uuid())
  displayId        String    @unique
  seqNum           Int                         // nomor urut per ipType, hasil dari VmCounter
  userId           String
  packageId        String
  proxmoxVmid      Int?
  proxmoxNode      String?
  hostname         String                      // label di dashboard + hostname di dalam Linux VM
  ipType           String
  status           String    @default("pending")
  ipAddress        String?
  sshPort          Int?
  osTemplate       String?
  expiresAt        DateTime?
  createdAt        DateTime  @default(now())

  user    User    @relation(fields: [userId], references: [id])
  package Package @relation(fields: [packageId], references: [id])
  billingUsages   BillingUsage[]
  natPortForwards NatPortForward[]
  addons          VmAddon[]
}

model Transaction {
  id         String   @id @default(uuid())
  userId     String
  type       String
  amount     Decimal  @db.Decimal(15, 2)
  status     String   @default("pending")
  paymentRef String?
  gateway    String?
  notes      String?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model BillingUsage {
  id            String   @id @default(uuid())
  vmId          String
  userId        String
  amountCharged Decimal  @db.Decimal(12, 4)
  periodStart   DateTime
  periodEnd     DateTime

  vm Vm @relation(fields: [vmId], references: [id])
}

model NatPortForward {
  id           String   @id @default(uuid())
  vmId         String
  externalPort Int      @unique
  internalPort Int      @default(22)
  protocol     String   @default("tcp")
  isFree       Boolean  @default(false)
  createdAt    DateTime @default(now())

  vm Vm @relation(fields: [vmId], references: [id])
}

model VmAddon {
  id        String   @id @default(uuid())
  vmId      String
  addonType String
  quantity  Int      @default(1)
  unitPrice Decimal  @db.Decimal(12, 4)
  metadata  Json?
  createdAt DateTime @default(now())

  vm Vm @relation(fields: [vmId], references: [id])
}

model AuditLog {
  id           String   @id @default(uuid())
  actorType    String                          // 'user' | 'admin' | 'system'
  actorId      String                          // bisa user.id ATAU admin_user.id — tidak ada FK ke satu tabel
  action       String
  resourceType String?
  resourceId   String?
  metadata     Json?
  ipAddress    String?
  createdAt    DateTime @default(now())
  // Sengaja tidak ada relasi Prisma ke User/AdminUser karena actorId polimorfik
}

model AdminUser {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  fullName     String?
  role         String    @default("admin")
  status       String    @default("active")
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
}

model ServerCost {
  id          String   @id @default(uuid())
  label       String
  amount      Decimal  @db.Decimal(12, 2)
  currency    String   @default("IDR")
  periodMonth DateTime
  notes       String?
  createdAt   DateTime @default(now())
}

model Ticket {
  id         String   @id @default(uuid())
  userId     String
  vmId       String?
  subject    String
  status     String   @default("open")
  priority   String   @default("normal")
  assignedTo String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user     User            @relation(fields: [userId], references: [id])
  messages TicketMessage[]
}

model TicketMessage {
  id         String   @id @default(uuid())
  ticketId   String
  senderType String
  senderId   String
  message    String
  createdAt  DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id])
}
```

Setelah file ini siap, jalankan:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

#### File 3: `apps/api/src/main.ts`

File ini sudah ada dari `nest new`. Ganti isinya:

```typescript
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api/v1')
  app.enableCors()

  await app.listen(process.env.PORT ?? 3000)
  console.log(`Langit Node API running on port ${process.env.PORT ?? 3000}`)
}
bootstrap()
```

---

#### File 4: `apps/api/src/app.module.ts`

File ini sudah ada. Ganti isinya:

```typescript
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { ProxmoxModule } from './proxmox/proxmox.module'
import { MikrotikModule } from './mikrotik/mikrotik.module'
import { DnsmasqModule } from './dnsmasq/dnsmasq.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { VmsModule } from './vms/vms.module'
import { BillingModule } from './billing/billing.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ProxmoxModule,
    MikrotikModule,
    DnsmasqModule,
    AuthModule,
    UsersModule,
    VmsModule,
    BillingModule,
  ],
})
export class AppModule {}
```

---

#### File 5 & 6: `apps/api/src/prisma/prisma.module.ts` dan `prisma.service.ts`

Buat folder baru: `src/prisma/`

`src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect()
  }
}
```

`src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Test Sprint 1:
```bash
npm run start:dev
# Harus jalan tanpa error di http://localhost:3000
```

---

### Sprint 2 — Core services

#### File 7 & 8: `apps/api/src/proxmox/`

Buat folder `src/proxmox/`, lalu buat dua file:

`src/proxmox/proxmox.service.ts`:
```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import * as https from 'https'

@Injectable()
export class ProxmoxService {
  private client: AxiosInstance

  constructor(private config: ConfigService) {
    // PROXMOX_VERIFY_SSL=true di production (gunakan cert valid atau self-signed yang di-pin)
    const rejectUnauthorized = config.get('PROXMOX_VERIFY_SSL') !== 'false'
    this.client = axios.create({
      baseURL: `https://${config.get('PROXMOX_HOST')}:${config.get('PROXMOX_PORT')}/api2/json`,
      headers: {
        Authorization: `PVEAPIToken=${config.get('PROXMOX_TOKEN_ID')}=${config.get('PROXMOX_TOKEN_SECRET')}`,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized }),
    })
  }

  async getNodes() {
    const { data } = await this.client.get('/nodes')
    return data.data
  }

  async getNodeStatus(node: string) {
    const { data } = await this.client.get(`/nodes/${node}/status`)
    return data.data
  }

  async createVm(params: {
    node: string
    vmid: number
    name: string
    cores: number
    memoryMb: number
    diskGb: number
    bridge: string
    osTemplate: string
  }) {
    const { data } = await this.client.post(`/nodes/${params.node}/qemu`, {
      vmid: params.vmid,
      name: params.name,
      cores: params.cores,
      memory: params.memoryMb,
      net0: `virtio,bridge=${params.bridge}`,
      ide2: `${params.osTemplate},media=cdrom`,
      ostype: 'l26',
      scsi0: `local-lvm:${params.diskGb}`,
      scsihw: 'virtio-scsi-pci',
      boot: 'order=scsi0',
      agent: 'enabled=1',
    })
    return data
  }

  async startVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/start`)
    return data
  }

  async stopVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/stop`)
    return data
  }

  async rebootVm(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/reboot`)
    return data
  }

  async deleteVm(node: string, vmid: number) {
    const { data } = await this.client.delete(`/nodes/${node}/qemu/${vmid}`)
    return data
  }

  async getVmStatus(node: string, vmid: number) {
    const { data } = await this.client.get(`/nodes/${node}/qemu/${vmid}/status/current`)
    return data.data
  }

  async setRootPassword(node: string, vmid: number, password: string) {
    const { data } = await this.client.post(
      `/nodes/${node}/qemu/${vmid}/agent/set-user-password`,
      { username: 'root', password }
    )
    return data
  }

  async setHostname(node: string, vmid: number, hostname: string) {
    // Jalankan hostnamectl via exec di dalam VM
    await this.client.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
      command: ['hostnamectl', 'set-hostname', hostname],
    })
  }

  async getVmConfig(node: string, vmid: number) {
    const { data } = await this.client.get(`/nodes/${node}/qemu/${vmid}/config`)
    return data.data
  }

  async createVncTicket(node: string, vmid: number) {
    const { data } = await this.client.post(`/nodes/${node}/qemu/${vmid}/vncproxy`)
    return data.data
  }

  async getNextVmid() {
    const { data } = await this.client.get('/cluster/nextid')
    return parseInt(data.data)
  }

  // Poll QEMU guest agent sampai ready, max timeoutMs. Lebih andal dari sleep tetap.
  async waitForAgent(node: string, vmid: number, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await this.client.get(`/nodes/${node}/qemu/${vmid}/agent/info`)
        return  // agent sudah bisa diakses
      } catch {
        await new Promise(r => setTimeout(r, 5_000))
      }
    }
    throw new Error(`QEMU agent VM ${vmid} tidak ready dalam ${timeoutMs / 1000}s`)
  }
}
```

`src/proxmox/proxmox.module.ts`:
```typescript
import { Module } from '@nestjs/common'
import { ProxmoxService } from './proxmox.service'

@Module({
  providers: [ProxmoxService],
  exports: [ProxmoxService],
})
export class ProxmoxModule {}
```

---

#### File 9 & 10: `apps/api/src/mikrotik/`

Buat folder `src/mikrotik/`:

`src/mikrotik/mikrotik.service.ts`:
```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RouterOSAPI } from 'node-routeros'

@Injectable()
export class MikrotikService {
  constructor(private config: ConfigService) {}

  private connect() {
    return new RouterOSAPI({
      host: this.config.get('MIKROTIK_HOST'),
      user: this.config.get('MIKROTIK_USER'),
      password: this.config.get('MIKROTIK_PASS'),
      port: 8728,
    })
  }

  async addSshForward(vmIp: string, externalPort: number, vmDisplayId: string) {
    const api = this.connect()
    await api.connect()
    try {
      await api.write('/ip/firewall/nat/add', [
        '=chain=dstnat',
        '=protocol=tcp',
        `=dst-port=${externalPort}`,
        '=action=dst-nat',
        `=to-addresses=${vmIp}`,
        '=to-ports=22',
        `=comment=${vmDisplayId}-ssh`,
      ])
    } finally {
      await api.close()
    }
  }

  async removeSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/remove', [`=.id=${rule['.id']}`])
      }
    } finally {
      await api.close()
    }
  }

  async disableSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/set', [
          `=.id=${rule['.id']}`,
          '=disabled=yes',
        ])
      }
    } finally {
      await api.close()
    }
  }

  async enableSshForward(externalPort: number) {
    const api = this.connect()
    await api.connect()
    try {
      const rules = await api.write('/ip/firewall/nat/print', [
        `?dst-port=${externalPort}`,
        '?chain=dstnat',
      ])
      for (const rule of rules) {
        await api.write('/ip/firewall/nat/set', [
          `=.id=${rule['.id']}`,
          '=disabled=no',
        ])
      }
    } finally {
      await api.close()
    }
  }
}
```

`src/mikrotik/mikrotik.module.ts`:
```typescript
import { Module } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'

@Module({
  providers: [MikrotikService],
  exports: [MikrotikService],
})
export class MikrotikModule {}
```

---

#### File 11 & 12: `apps/api/src/dnsmasq/`

Buat folder `src/dnsmasq/`:

`src/dnsmasq/dnsmasq.service.ts`:
```typescript
import { Injectable } from '@nestjs/common'
import { execSync } from 'child_process'
import * as fs from 'fs'

const RESERVATION_FILE = '/etc/dnsmasq.d/vmbr1.conf'

// File lock sederhana untuk mencegah concurrent write (provisioning paralel)
let writeLock = false
async function acquireLock(): Promise<void> {
  while (writeLock) {
    await new Promise(r => setTimeout(r, 100))
  }
  writeLock = true
}

@Injectable()
export class DnsmasqService {

  async addReservation(mac: string, ip: string, hostname: string) {
    await acquireLock()
    try {
      const line = `dhcp-host=${mac},${ip},${hostname}\n`
      fs.appendFileSync(RESERVATION_FILE, line)
      // reload (bukan restart) — tidak putus DHCP lease VM yang sedang running
      execSync('systemctl reload dnsmasq')
    } finally {
      writeLock = false
    }
  }

  async removeReservation(ip: string) {
    await acquireLock()
    try {
      const content = fs.readFileSync(RESERVATION_FILE, 'utf8')
      const filtered = content
        .split('\n')
        .filter(line => !line.includes(`,${ip},`))
        .join('\n')
      fs.writeFileSync(RESERVATION_FILE, filtered)
      execSync('systemctl reload dnsmasq')
    } finally {
      writeLock = false
    }
  }
}

// Catatan operasional: backend perlu sudoers entry spesifik agar tidak perlu jalan sebagai root:
// Tambahkan ke /etc/sudoers.d/langitnode:
//   langitnode ALL=(ALL) NOPASSWD: /bin/systemctl reload dnsmasq
// Jalankan backend sebagai user 'langitnode', bukan root.
```

`src/dnsmasq/dnsmasq.module.ts`:
```typescript
import { Module } from '@nestjs/common'
import { DnsmasqService } from './dnsmasq.service'

@Module({
  providers: [DnsmasqService],
  exports: [DnsmasqService],
})
export class DnsmasqModule {}
```

Test Sprint 2:
```bash
npm run start:dev
# Tambahkan endpoint test sementara di app.module.ts untuk ping Proxmox:
# curl http://localhost:3000/api/v1/test/proxmox
```

---

### Sprint 3 — Fitur utama

#### File 13–15: `apps/api/src/auth/`

Buat folder `src/auth/`:

`src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(email: string, password: string, fullName: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } })
    if (exists) throw new ConflictException('Email sudah terdaftar')

    const hash = await bcrypt.hash(password, 12)
    const user = await this.prisma.user.create({
      data: { email, passwordHash: hash, fullName },
    })

    return { message: 'Registrasi berhasil, cek email untuk verifikasi' }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) throw new UnauthorizedException('Email atau password salah')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Email atau password salah')

    if (user.status !== 'active') throw new UnauthorizedException('Akun tidak aktif')

    const payload = { sub: user.id, email: user.email, role: 'user' }
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwt.sign(payload, { expiresIn: '7d' }),
      user: { id: user.id, email: user.email, fullName: user.fullName, balance: user.balance },
    }
  }
}
```

`src/auth/auth.controller.ts`:
```typescript
import { Controller, Post, Body } from '@nestjs/common'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() body: { email: string; password: string; fullName: string }) {
    return this.auth.register(body.email, body.password, body.fullName)
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password)
  }
}
```

`src/auth/jwt.strategy.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    })
  }

  validate(payload: { sub: string; email: string; role: string }) {
    if (payload.role !== 'user') throw new UnauthorizedException()
    return { sub: payload.sub, email: payload.email, role: payload.role }
  }
}
```

`src/auth/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
```

---

#### File 16–18: `apps/api/src/vms/`

Buat folder `src/vms/` dan subfolder `src/vms/vm-jobs/`:

`src/vms/vms.service.ts`:
```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { PrismaService } from '../prisma/prisma.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class VmsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @InjectQueue('vm-provision') private provisionQueue: Queue,
  ) {}

  async createVm(
    userId: string,
    packageId: string,
    osTemplate: string,
    hostname: string | undefined,
    rootPassword: string,
  ) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg || !pkg.isActive) throw new NotFoundException('Paket tidak ditemukan')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User tidak ditemukan')

    // Validasi password dari user
    if (!rootPassword || rootPassword.length < 8) {
      throw new BadRequestException('Password minimal 8 karakter')
    }
    if (!/[a-zA-Z]/.test(rootPassword) || !/[0-9]/.test(rootPassword)) {
      throw new BadRequestException('Password harus mengandung huruf dan angka')
    }

    // Cek saldo minimal 1 hari
    const minBalance = Number(pkg.priceHourly) * 24
    if (Number(user.balance) < minBalance) {
      throw new BadRequestException(`Saldo tidak cukup. Minimal Rp ${minBalance.toFixed(0)}`)
    }

    // Generate displayId secara atomic — hindari race condition count+1
    const { vm, displayId } = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.vmCounter.upsert({
        where:  { ipType: pkg.ipType },
        create: { ipType: pkg.ipType, lastSeq: 1 },
        update: { lastSeq: { increment: 1 } },
      })
      const prefix = pkg.ipType === 'public' ? 'pub' : 'nat'
      const displayId = `ln-${prefix}-${String(counter.lastSeq).padStart(4, '0')}`

      // Hostname: pakai input user, fallback ke displayId
      const resolvedHostname = hostname?.trim() || displayId

      await tx.user.update({
        where: { id: userId },
        data:  { balance: { decrement: minBalance } },
      })

      const vm = await tx.vm.create({
        data: {
          displayId,
          seqNum:   counter.lastSeq,
          userId,
          packageId,
          hostname: resolvedHostname,
          ipType:   pkg.ipType,
          status:   'pending',
          osTemplate,
        },
      })
      return { vm, displayId }
    })

    // Masukkan ke queue — kirim rootPassword agar job bisa set ke VM
    await this.provisionQueue.add('provision', {
      vmId: vm.id,
      userId,
      packageId,
      displayId,
      hostname: vm.hostname,
      osTemplate,
      ipType: pkg.ipType,
      rootPassword,   // password dari user, bukan generate
    })

    return { vmId: vm.id, displayId, status: 'pending', message: 'VM sedang diproses' }
  }

  async getVm(vmId: string, userId: string) {
    const vm = await this.prisma.vm.findFirst({
      where: { id: vmId, userId },
      include: { package: true },
    })
    if (!vm) throw new NotFoundException('VM tidak ditemukan')

    // credentialEnc tidak pernah dikirim ke frontend — user sudah tahu passwordnya sendiri
    return { ...vm, credentialEnc: undefined }
  }

  async listVms(userId: string) {
    return this.prisma.vm.findMany({
      where: { userId, status: { not: 'deleted' } },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
    })
  }
}
```

`src/vms/vms.controller.ts`:
```typescript
import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common'
import { VmsService } from './vms.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('vms')
@UseGuards(JwtAuthGuard)
export class VmsController {
  constructor(private vms: VmsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { packageId: string; osTemplate: string; hostname?: string; rootPassword: string },
  ) {
    return this.vms.createVm(req.user.sub, body.packageId, body.osTemplate, body.hostname, body.rootPassword)
  }

  @Get()
  list(@Req() req: any) {
    return this.vms.listVms(req.user.sub)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.vms.getVm(id, req.user.sub)
  }
}
```

`src/vms/vm-jobs/provision.job.ts`:
```typescript
import { Process, Processor } from '@nestjs/bull'
import { Job } from 'bull'
import { PrismaService } from '../../prisma/prisma.service'
import { ProxmoxService } from '../../proxmox/proxmox.service'
import { MikrotikService } from '../../mikrotik/mikrotik.service'
import { DnsmasqService } from '../../dnsmasq/dnsmasq.service'
import { ConfigService } from '@nestjs/config'

@Processor('vm-provision')
export class ProvisionJob {
  constructor(
    private prisma: PrismaService,
    private proxmox: ProxmoxService,
    private mikrotik: MikrotikService,
    private dnsmasq: DnsmasqService,
    private config: ConfigService,
  ) {}

  @Process('provision')
  async handle(job: Job) {
    const { vmId, userId, packageId, displayId, hostname, osTemplate, ipType, rootPassword } = job.data
    const node = this.config.get('PROXMOX_NODE')

    try {
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'provisioning' } })

      const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
      const vmid = await this.proxmox.getNextVmid()

      let ip: string
      let sshPort: number
      const bridge = ipType === 'nat'
        ? this.config.get('NAT_BRIDGE')
        : this.config.get('PUBLIC_BRIDGE')

      if (ipType === 'nat') {
        // Alokasi last octet menggunakan row-level lock untuk hindari race condition
        const lastOctet = await this.allocateNatIpAtomic()
        ip = `10.20.0.${lastOctet}`
        sshPort = 22000 + lastOctet   // 10.20.0.42 → port 22042
      }

      // Buat VM di Proxmox
      await this.proxmox.createVm({
        node,
        vmid,
        name: displayId,
        cores: pkg.vcpu,
        memoryMb: pkg.ramMb,
        diskGb: pkg.diskGb,
        bridge,
        osTemplate,
      })

      // Setup NAT jika perlu
      if (ipType === 'nat') {
        const vmConfig = await this.proxmox.getVmConfig(node, vmid)
        const mac = vmConfig.net0.split(',')[0].replace('virtio=', '')
        await this.dnsmasq.addReservation(mac, ip, displayId)
        await this.mikrotik.addSshForward(ip, sshPort, displayId)
        await this.prisma.natPortForward.create({
          data: { vmId, externalPort: sshPort, internalPort: 22, isFree: true },
        })
      }

      // Start VM
      await this.proxmox.startVm(node, vmid)

      // Poll QEMU agent sampai ready (max 2 menit)
      await this.proxmox.waitForAgent(node, vmid, 120_000)

      // Set password dari input user (bukan generate) dan set hostname
      await this.proxmox.setRootPassword(node, vmid, rootPassword)
      await this.proxmox.setHostname(node, vmid, hostname)

      await this.prisma.vm.update({
        where: { id: vmId },
        data: {
          status:     'running',
          proxmoxVmid: vmid,
          proxmoxNode: node,
          ipAddress:  ip,
          sshPort:    ipType === 'nat' ? sshPort : 22,
          // credentialEnc tidak disimpan — user sudah tahu passwordnya sendiri
        },
      })

    } catch (err) {
      // Rollback: kembalikan saldo
      const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
      const refund = Number(pkg.priceHourly) * 24
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: refund } },
      })
      await this.prisma.vm.update({ where: { id: vmId }, data: { status: 'failed' } })
      throw err
    }
  }

  // Alokasi last octet IP NAT — pakai raw query SELECT FOR UPDATE untuk true row-level lock.
  // UNIQUE constraint di externalPort (NatPortForward) sebagai safety net terakhir:
  // jika collision tetap terjadi, Prisma throw P2002 (unique violation) → job retry otomatis.
  private async allocateNatIpAtomic(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Baca port yang sudah terpakai dengan lock (cegah concurrent read-then-insert race)
      const usedRows = await tx.$queryRaw<{ external_port: number }[]>`
        SELECT external_port FROM nat_port_forwards FOR UPDATE
      `
      const usedOctets = new Set(usedRows.map(r => r.external_port - 22000))
      for (let i = 2; i <= 254; i++) {
        if (!usedOctets.has(i)) return i
      }
      throw new Error('NAT IP pool penuh — semua 253 slot sudah terpakai')
    })
  }
}
```

`src/vms/vms.module.ts`:
```typescript
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { VmsService } from './vms.service'
import { VmsController } from './vms.controller'
import { ProvisionJob } from './vm-jobs/provision.job'
import { ProxmoxModule } from '../proxmox/proxmox.module'
import { MikrotikModule } from '../mikrotik/mikrotik.module'
import { DnsmasqModule } from '../dnsmasq/dnsmasq.module'

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST'),
          port: +config.get('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'vm-provision' }),
    ProxmoxModule,
    MikrotikModule,
    DnsmasqModule,
  ],
  providers: [VmsService, ProvisionJob],
  controllers: [VmsController],
})
export class VmsModule {}
```

---

### Ringkasan: semua file yang dibuat

```
apps/api/
├── .env                                   ← File 1
├── prisma/
│   └── schema.prisma                      ← File 2
└── src/
    ├── main.ts                            ← File 3 (edit yang sudah ada)
    ├── app.module.ts                      ← File 4 (edit yang sudah ada)
    ├── prisma/
    │   ├── prisma.service.ts              ← File 5  (BUAT BARU)
    │   └── prisma.module.ts               ← File 6  (BUAT BARU)
    ├── proxmox/
    │   ├── proxmox.service.ts             ← File 7  (BUAT BARU)
    │   └── proxmox.module.ts              ← File 8  (BUAT BARU)
    ├── mikrotik/
    │   ├── mikrotik.service.ts            ← File 9  (BUAT BARU)
    │   └── mikrotik.module.ts             ← File 10 (BUAT BARU)
    ├── dnsmasq/
    │   ├── dnsmasq.service.ts             ← File 11 (BUAT BARU)
    │   └── dnsmasq.module.ts              ← File 12 (BUAT BARU)
    ├── auth/
    │   ├── auth.service.ts                ← File 13 (BUAT BARU)
    │   ├── auth.controller.ts             ← File 14 (BUAT BARU)
    │   ├── auth.module.ts                 ← File 15 (BUAT BARU)
    │   ├── jwt.strategy.ts                ← File 15a (BUAT BARU)
    │   └── jwt-auth.guard.ts              ← File 15b (BUAT BARU)
    └── vms/
        ├── vms.service.ts                 ← File 16 (BUAT BARU)  ← berisi validasi password + createVm logic
        ├── vms.controller.ts              ← File 17 (BUAT BARU)
        ├── vms.module.ts                  ← File 18 (BUAT BARU)
        └── vm-jobs/
            └── provision.job.ts           ← File 19 (BUAT BARU)
```


---

## 22. Konfigurasi Proxmox Sebelum Backend Dijalankan

### 1. Buat User, Role, dan API Token (jangan pakai root)

Buat dedicated user Proxmox dengan permission minimal yang dibutuhkan backend:

```bash
# Buat user di realm 'pve' (Proxmox VE internal auth)
pveum user add langitnode@pve --password STRONG_PASSWORD

# Buat role dengan privilege yang dibutuhkan (VM.Monitor tidak ada di Proxmox VE)
pveum role add LangitNodeRole \
  -privs "VM.Allocate,VM.Audit,VM.Config.CDROM,VM.Config.CPU,VM.Config.Disk,\
VM.Config.HWType,VM.Config.Memory,VM.Config.Network,VM.Config.Options,\
VM.Console,VM.Migrate,VM.PowerMgmt,VM.Snapshot,VM.Snapshot.Rollback,\
VM.Clone,VM.Backup,Datastore.AllocateSpace,Datastore.AllocateTemplate,\
Datastore.Audit,Sys.Audit"

# Assign role ke user untuk seluruh cluster
pveum acl modify / -user langitnode@pve -role LangitNodeRole

# Buat API token (secret ditampilkan SEKALI — simpan sekarang)
pveum user token add langitnode@pve langitnode-token --privsep=0
```

> **Jika token sudah pernah dibuat dan secret hilang**, hapus dulu lalu buat ulang:
> ```bash
> pveum user token remove langitnode@pve langitnode-token
> pveum user token add langitnode@pve langitnode-token --privsep=0
> ```

Verifikasi token terdaftar:
```bash
pveum user token list langitnode@pve
```

Simpan ke `.env` backend:
```env
PROXMOX_TOKEN_ID="langitnode@pve!langitnode-token"
PROXMOX_TOKEN_SECRET="token-secret-yang-muncul-saat-pembuatan"
```

Test koneksi API:
```bash
curl -k \
  -H "Authorization: PVEAPIToken=langitnode@pve!langitnode-token=TOKEN_SECRET" \
  https://10.10.10.250:8006/api2/json/nodes
# Expected: JSON dengan list node, bukan 401/403
```

---

### 2. Aktifkan QEMU Guest Agent di template VM

Diperlukan agar backend bisa set root password ke dalam VM via `setRootPassword()`:

```bash
# Di dalam VM setelah install OS (sebelum dijadikan template)
apt install qemu-guest-agent -y
systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent
```

Di Proxmox web UI: **VM → Options → QEMU Guest Agent → Enable**

Verifikasi agent aktif (dari host Proxmox):
```bash
qm guest cmd <vmid> ping
# Expected: {"ping":"pong"}
```

---

### 3. Buat Cloud-Init template (sangat disarankan)

Mempersingkat provisioning dari ~10 menit menjadi ~60 detik. Buat dua template — satu untuk NAT (`vmbr1`), satu untuk IP Public (`vmbr0`):

```bash
# Download Ubuntu 22.04 Cloud Image
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img \
  -O /var/lib/vz/template/iso/ubuntu-22.04-cloud.img

# === Template NAT (VMID 9000) ===
qm create 9000 --name ubuntu-2204-nat-template --memory 1024 --cores 1 \
  --net0 virtio,bridge=vmbr1
qm importdisk 9000 /var/lib/vz/template/iso/ubuntu-22.04-cloud.img local-lvm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --boot c --bootdisk scsi0
qm set 9000 --serial0 socket --vga serial0
qm set 9000 --agent enabled=1
qm set 9000 --ipconfig0 ip=dhcp   # VM NAT pakai DHCP dari dnsmasq

# Boot VM 9000, install guest agent, lalu poweroff:
# qm start 9000
# (masuk console, jalankan): apt install qemu-guest-agent -y && systemctl enable qemu-guest-agent && poweroff
qm template 9000

# === Template IP Public (VMID 9001) ===
qm create 9001 --name ubuntu-2204-pub-template --memory 1024 --cores 1 \
  --net0 virtio,bridge=vmbr0
qm importdisk 9001 /var/lib/vz/template/iso/ubuntu-22.04-cloud.img local-lvm
qm set 9001 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9001-disk-0
qm set 9001 --ide2 local-lvm:cloudinit
qm set 9001 --boot c --bootdisk scsi0
qm set 9001 --serial0 socket --vga serial0
qm set 9001 --agent enabled=1
# Boot, install guest agent, poweroff, lalu:
qm template 9001
```

---

### 4. Pastikan storage tersedia

```bash
pvesm status
# Cari storage Type lvmthin dengan content images
```

Di Proxmox web UI: **Datacenter → Storage → local-lvm → Edit → centang Disk image**

Jika storage belum support disk image, enable via CLI:
```bash
pvesm set local-lvm --content images,rootdir
```

---

### 5. Setup jaringan vmbr1 (untuk VM NAT)

Tambahkan ke `/etc/network/interfaces` di node Proxmox:

```
auto vmbr1
iface vmbr1 inet static
    address 10.20.0.1/24
    bridge_ports none
    bridge_stp off
    bridge_fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s '10.20.0.0/24' -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '10.20.0.0/24' -o vmbr0 -j MASQUERADE
```

Apply dan buat persistent:
```bash
ifreload -a
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf && sysctl -p
apt install iptables-persistent -y && netfilter-persistent save

# Verifikasi
ip addr show vmbr1           # harus tampil inet 10.20.0.1/24
cat /proc/sys/net/ipv4/ip_forward  # harus: 1
iptables -t nat -L POSTROUTING -n  # harus ada rule MASQUERADE
```

---

### 6. Setup dnsmasq untuk DHCP reservation VM NAT

```bash
apt install dnsmasq -y

cat > /etc/dnsmasq.d/vmbr1.conf << 'EOF'
interface=vmbr1
bind-interfaces
dhcp-range=10.20.0.2,10.20.0.254,24h
dhcp-option=option:router,10.20.0.1
dhcp-option=option:dns-server,1.1.1.1,8.8.8.8
EOF

systemctl enable dnsmasq
systemctl reload dnsmasq
systemctl status dnsmasq   # harus: active (running)
```

Setup sudoers agar backend bisa reload dnsmasq tanpa root:
```bash
# Ganti 'langitnode' dengan user yang menjalankan backend NestJS
cat > /etc/sudoers.d/langitnode << 'EOF'
langitnode ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload dnsmasq
EOF
chmod 440 /etc/sudoers.d/langitnode

# Cek path systemctl sesuai distro
which systemctl   # pastikan pathnya sama dengan yang di sudoers
```

---

### Checklist sebelum jalankan backend

- [x] User `langitnode@pve` dibuat dengan role `LangitNodeRole`
- [x] API token `langitnode@pve!langitnode-token` dibuat dan secret sudah disimpan ke `.env`
- [ ] Test curl ke `/api2/json/nodes` berhasil return JSON (bukan 401/403)
- [ ] Storage `local-lvm` tersedia dan support disk image
- [ ] Cloud-Init template VMID 9000 (NAT) dan 9001 (Public) sudah dibuat
- [ ] Guest agent terinstall dan aktif di dalam template
- [ ] `vmbr1` up dengan IP `10.20.0.1/24`
- [ ] IP forwarding aktif: `cat /proc/sys/net/ipv4/ip_forward` = `1`
- [ ] iptables MASQUERADE rule aktif dan persistent
- [ ] `dnsmasq` aktif: `systemctl status dnsmasq`
- [ ] sudoers entry untuk `systemctl reload dnsmasq` sudah dikonfigurasi
- [ ] Mikrotik: static route `10.20.0.0/24` via `10.10.10.250` aktif
- [ ] Mikrotik: RouterOS API aktif di port 8728
- [ ] Mikrotik: user `langitnode-api` sudah dibuat
