# Langit Node — Mikrotik RouterOS Setup Script
# Jalankan di WinBox Terminal atau SSH ke Mikrotik
# Sesuaikan IP dan password sebelum dijalankan

# ── Konfigurasi Brand & API ───────────────────────────────────────
:local brandName "nova"
:local apiUser "nova-api"
:local apiPass "GantiPasswordIni123!"
:local ipProxmox "10.10.10.250"

# ── 1. Aktifkan API service ───────────────────────────────────────
/ip service
set api disabled=no port=8728

# ── 2. Buat user terbatas untuk API ──────────────────────────────
/user
add name=$apiUser \
    password=$apiPass \
    group=write \
    comment=($brandName . " API user")

# ── 3. Buat address list untuk subnet NAT VM ──────────────────────
/ip firewall address-list
add list=($brandName . "-nat") address=10.20.0.0/24 comment=($brandName . " NAT subnet")

# ── 4. Masquerade untuk VM NAT keluar internet ───────────────────
# Ganti ether1 dengan interface WAN kamu
/ip firewall nat
add chain=srcnat \
    src-address=10.20.0.0/24 \
    out-interface=ether1 \
    action=masquerade \
    comment=($brandName . " — NAT VM ke internet")

# ── 5. Firewall: izinkan API dari IP server PVE ───────────────────
/ip firewall filter
add chain=input \
    protocol=tcp \
    dst-port=8728 \
    src-address=$ipProxmox \
    action=accept \
    comment=($brandName . " API — izinkan dari PVE") \
    place-before=0

# ── 6. Verifikasi ─────────────────────────────────────────────────
/ip service print
/user print
/ip firewall nat print where comment~($brandName)

# Output yang diharapkan:
#   api      8728  enabled
#   langitnode-api  (user dengan group write)
#   rule masquerade untuk 10.20.0.0/24
