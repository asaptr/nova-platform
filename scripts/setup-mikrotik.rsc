# Langit Node — Mikrotik RouterOS Setup Script
# Jalankan di WinBox Terminal atau SSH ke Mikrotik
# Sesuaikan IP dan password sebelum dijalankan

# ── 1. Aktifkan API service ───────────────────────────────────────
/ip service
set api disabled=no port=8728

# ── 2. Buat user terbatas untuk API ──────────────────────────────
/user
add name=langitnode-api \
    password=GantiPasswordIni123! \
    group=write \
    comment="Langit Node API user"

# ── 3. Buat address list untuk subnet NAT VM ──────────────────────
/ip firewall address-list
add list=langitnode-nat address=10.20.0.0/24 comment="Langit Node NAT subnet"

# ── 4. Masquerade untuk VM NAT keluar internet ───────────────────
# Ganti ether1 dengan interface WAN kamu
/ip firewall nat
add chain=srcnat \
    src-address=10.20.0.0/24 \
    out-interface=ether1 \
    action=masquerade \
    comment="Langit Node — NAT VM ke internet"

# ── 5. Firewall: izinkan API dari IP server PVE ───────────────────
# Ganti 10.10.10.250 dengan IP server Proxmox kamu
/ip firewall filter
add chain=input \
    protocol=tcp \
    dst-port=8728 \
    src-address=10.10.10.250 \
    action=accept \
    comment="Langit Node API — izinkan dari PVE" \
    place-before=0

# ── 6. Verifikasi ─────────────────────────────────────────────────
/ip service print
/user print
/ip firewall nat print where comment~"Langit Node"

# Output yang diharapkan:
#   api      8728  enabled
#   langitnode-api  (user dengan group write)
#   rule masquerade untuk 10.20.0.0/24
