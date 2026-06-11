#!/bin/bash
# Master build script for AeroPOS Custom Kiosk Linux OS
# Creates a minimal bootable Debian-based live ISO image

set -e

# Output ISO name
ISO_NAME="aeropos-kiosk.iso"
WORK_DIR="/tmp/iso-build"
CHROOT_DIR="${WORK_DIR}/chroot"
IMAGE_DIR="${WORK_DIR}/image"

echo "=== [1/7] Cleaning up previous workspaces ==="
rm -rf "$WORK_DIR"
mkdir -p "$CHROOT_DIR"
mkdir -p "$IMAGE_DIR/live"
mkdir -p "$IMAGE_DIR/boot/grub"

echo "=== [2/7] Bootstrapping minimal base Debian OS ==="
# Bootstrapping Debian Bookworm (Stable)
debootstrap --arch=amd64 --variant=minbase bookworm "$CHROOT_DIR" http://deb.debian.org/debian/

echo "=== [3/7] Setting up hostnames and repository configs ==="
echo "aeropos-os" > "$CHROOT_DIR/etc/hostname"
cat <<EOF > "$CHROOT_DIR/etc/apt/sources.list"
deb http://deb.debian.org/debian/ bookworm main contrib non-free non-free-firmware
deb http://deb.debian.org/debian/ bookworm-updates main contrib non-free non-free-firmware
deb http://security.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
EOF

echo "=== [4/7] Installing GUI, Node.js, and Networking packages in OS ==="
# Mount virtual filesystems inside chroot
mount -t proc proc "$CHROOT_DIR/proc"
mount -t sysfs sys "$CHROOT_DIR/sys"
mount --bind /dev "$CHROOT_DIR/dev"
mount --bind /dev/pts "$CHROOT_DIR/dev/pts"

# Run apt-get update and installs
chroot "$CHROOT_DIR" apt-get update
chroot "$CHROOT_DIR" apt-get install -y --no-install-recommends \
  linux-image-amd64 \
  live-boot \
  systemd-sysv \
  network-manager \
  xserver-xorg \
  xinit \
  openbox \
  chromium \
  nodejs \
  npm \
  dbus \
  netcat-openbsd \
  alsa-utils \
  ca-certificates

echo "=== [5/7] Deploying AeroPOS software inside custom OS ==="
# Create kiosk user with passwordless auto-login
chroot "$CHROOT_DIR" useradd -m -s /bin/bash kiosk
chroot "$CHROOT_DIR" passwd -d kiosk
chroot "$CHROOT_DIR" usermod -aG netdev kiosk

# Configure systemd autologin on tty1
mkdir -p "$CHROOT_DIR/etc/systemd/system/getty@tty1.service.d"
cat <<EOF > "$CHROOT_DIR/etc/systemd/system/getty@tty1.service.d/override.conf"
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin kiosk --noclear %I \$TERM
EOF

# Copy cashier POS project files into /opt/aeropos
mkdir -p "$CHROOT_DIR/opt/aeropos"
cp -r /app/* "$CHROOT_DIR/opt/aeropos/" || true
# Clean dev files
rm -rf "$CHROOT_DIR/opt/aeropos/os-builder"

# Install production dependencies inside OS
chroot "$CHROOT_DIR" bash -c "cd /opt/aeropos && npm install --production"

# Install systemd service for node backend
cp /kiosk-setup/aeropos.service "$CHROOT_DIR/etc/systemd/system/"
chroot "$CHROOT_DIR" systemctl enable aeropos.service
chroot "$CHROOT_DIR" systemctl enable NetworkManager.service

# Setup automatic GUI launch upon console login
cat <<EOF > "$CHROOT_DIR/home/kiosk/.bash_profile"
if [ -z "\$DISPLAY" ] && [ "\$(tty)" = "/dev/tty1" ]; then
  exec startx
fi
EOF
chroot "$CHROOT_DIR" chown kiosk:kiosk /home/kiosk/.bash_profile

# Copy Xinit kiosk script
cp /kiosk-setup/xinitrc "$CHROOT_DIR/home/kiosk/.xinitrc"
chroot "$CHROOT_DIR" chmod +x /home/kiosk/.xinitrc
chroot "$CHROOT_DIR" chown kiosk:kiosk /home/kiosk/.xinitrc

# Clean package manager files to save space
chroot "$CHROOT_DIR" apt-get clean
rm -rf "$CHROOT_DIR/var/lib/apt/lists/*"

# Unmount filesystems
umount "$CHROOT_DIR/proc"
umount "$CHROOT_DIR/sys"
umount "$CHROOT_DIR/dev/pts"
umount "$CHROOT_DIR/dev"

echo "=== [6/7] Compiling OS Root Filesystem (SquashFS) ==="
# Compile kernel and initramfs to images
cp "$CHROOT_DIR"/boot/vmlinuz-* "$IMAGE_DIR/live/vmlinuz"
cp "$CHROOT_DIR"/boot/initrd.img-* "$IMAGE_DIR/live/initrd"

# Squash the chroot filesystem
mksquashfs "$CHROOT_DIR" "$IMAGE_DIR/live/filesystem.squashfs" -e boot

echo "=== [7/7] Assembling Bootable OS ISO Image ==="
# Configure GRUB bootloader parameters
cat <<EOF > "$IMAGE_DIR/boot/grub/grub.cfg"
search --set=root --file /live/vmlinuz
set default="0"
set timeout=5

menuentry "AeroPOS Kiosk Operating System" {
    linux /live/vmlinuz boot=live quiet splash
    initrd /live/initrd
}
EOF

# Create bootable hybrid ISO
grub-mkrescue -o "/output/${ISO_NAME}" "$IMAGE_DIR"

echo "=================================================="
echo "SUCCESS! Custom OS ISO created at: /output/${ISO_NAME}"
echo "=================================================="
