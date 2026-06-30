#!/bin/bash
# Jalankan di host Proxmox VE sebagai root
# Usage: bash setup-proxmox.sh

set -e

echo "=== Langit Node — Proxmox Setup ==="

# ── 1. Install tools ──────────────────────────────────────────────
echo "[1/6] Install dependencies..."
apt-get update -qq
apt-get install -y dnsmasq sudo curl wget libguestfs-tools

# ── 2. Buat user sistem untuk API ────────────────────────────────
echo "[2/6] Buat user langitnode..."
if ! id "langitnode" &>/dev/null; then
  useradd -r -s /bin/false langitnode
fi

# Allow reload dnsmasq tanpa password
cat > /etc/sudoers.d/langitnode-dnsmasq <<'EOF'
langitnode ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload dnsmasq
EOF
chmod 440 /etc/sudoers.d/langitnode-dnsmasq

# ── 3. Konfigurasi dnsmasq ────────────────────────────────────────
echo "[3/6] Konfigurasi dnsmasq..."
mkdir -p /etc/dnsmasq.d

cat > /etc/dnsmasq.conf <<'EOF'
# Langit Node — DHCP untuk VM NAT
interface=vmbr1
bind-interfaces
dhcp-range=10.20.0.2,10.20.0.254,12h
dhcp-option=option:router,10.20.0.1
dhcp-option=option:dns-server,1.1.1.1,8.8.8.8
conf-dir=/etc/dnsmasq.d/,*.conf
log-dhcp
EOF

systemctl enable dnsmasq
systemctl restart dnsmasq

# ── 4. Konfigurasi jaringan NAT (vmbr1) ──────────────────────────
echo "[4/6] Setup bridge vmbr1 untuk NAT..."

if ! grep -q "vmbr1" /etc/network/interfaces; then
  cat >> /etc/network/interfaces <<'EOF'

auto vmbr1
iface vmbr1 inet static
    address 10.20.0.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s '10.20.0.0/24' -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '10.20.0.0/24' -o vmbr0 -j MASQUERADE
EOF
  echo "vmbr1 ditambahkan ke /etc/network/interfaces"
  echo "PERLU REBOOT atau jalankan: ifup vmbr1"
else
  echo "vmbr1 sudah ada, skip."
fi

# Aktifkan IP forward sekarang (sebelum reboot)
echo 1 > /proc/sys/net/ipv4/ip_forward
sysctl -w net.ipv4.ip_forward=1

# Persist IP forward
if ! grep -q "net.ipv4.ip_forward" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# ── 5. Buat Proxmox API Token ─────────────────────────────────────
echo "[5/6] Buat Proxmox API Token..."
pveum user add langitnode@pve --comment "Langit Node API" 2>/dev/null || true
pveum aclmod / -user langitnode@pve -role Administrator
TOKEN_SECRET=$(pveum user token add langitnode@pve langitnode-token --privsep 0 --output-format json | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null || echo "GAGAL — jalankan manual di UI Proxmox")

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  SALIN KE apps/api/.env                                 ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  PROXMOX_TOKEN_ID=langitnode@pve!langitnode-token        ║"
echo "║  PROXMOX_TOKEN_SECRET=$TOKEN_SECRET"
echo "╚══════════════════════════════════════════════════════════╝"

# ── 6. Download template cloud-init Ubuntu 22.04 ─────────────────
echo "[6/6] Download & buat template Ubuntu 22.04 cloud-init..."

TEMPLATE_ID=9000
IMG_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"
IMG_FILE="/var/lib/vz/template/iso/jammy-server-cloudimg-amd64.img"

if [ ! -f "$IMG_FILE" ]; then
  echo "Downloading Ubuntu 22.04 cloud image..."
  wget -q --show-progress -O "$IMG_FILE" "$IMG_URL"
else
  echo "Image sudah ada, skip download."
fi

# Install qemu-guest-agent ke dalam image
echo "Inject qemu-guest-agent ke image..."
virt-customize -a "$IMG_FILE" \
  --install qemu-guest-agent \
  --run-command "systemctl enable qemu-guest-agent" \
  --truncate /etc/machine-id \
  --run-command "cloud-init clean" \
  2>/dev/null && echo "qemu-guest-agent berhasil diinjeksi." || echo "WARN: virt-customize gagal, pastikan libguestfs-tools terinstall."

# Hapus VM lama kalau ada
if qm status $TEMPLATE_ID &>/dev/null; then
  qm destroy $TEMPLATE_ID --purge
fi

# Buat VM template
qm create $TEMPLATE_ID \
  --name ubuntu-22.04-cloudinit \
  --memory 1024 \
  --cores 1 \
  --net0 virtio,bridge=vmbr0 \
  --ostype l26 \
  --agent enabled=1

# Import disk
qm importdisk $TEMPLATE_ID "$IMG_FILE" local-lvm

# Konfigurasi disk & boot
qm set $TEMPLATE_ID \
  --scsihw virtio-scsi-pci \
  --scsi0 local-lvm:vm-${TEMPLATE_ID}-disk-0,discard=on \
  --ide2 local-lvm:cloudinit \
  --boot c \
  --bootdisk scsi0 \
  --serial0 socket \
  --vga serial0 \
  --ipconfig0 ip=dhcp \
  --ciuser root

# Jadikan template
qm template $TEMPLATE_ID

echo ""
echo "=== Setup selesai! ==="
echo ""
echo "Checklist:"
echo "  ✓ dnsmasq dikonfigurasi (subnet 10.20.0.0/24)"
echo "  ✓ IP forward diaktifkan"
echo "  ✓ Bridge vmbr1 ditambahkan (perlu ifup vmbr1 atau reboot)"
echo "  ✓ Proxmox API token dibuat"
echo "  ✓ Template Ubuntu 22.04 cloud-init (VMID $TEMPLATE_ID)"
echo ""
echo "Langkah selanjutnya:"
echo "  1. Salin PROXMOX_TOKEN_SECRET di atas ke apps/api/.env"
echo "  2. Jalankan: ifup vmbr1  (atau reboot)"
echo "  3. Setup Mikrotik API (lihat README)"
echo "  4. Jalankan: pnpm dev"
