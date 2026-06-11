FROM debian:bookworm-slim

# Install system dependencies for building live Linux OS images
RUN apt-get update && apt-get install -y \
    debootstrap \
    squashfs-tools \
    xorriso \
    grub-common \
    grub-pc-bin \
    mtools \
    binutils \
    libisoburn1 \
    dosfstools \
    udev \
    && rm -rf /var/lib/apt/lists/*

# Create directory layouts
RUN mkdir -p /kiosk-setup /output /app

# Copy setup scripts into the docker image
COPY kiosk-setup/xinitrc /kiosk-setup/xinitrc
COPY kiosk-setup/aeropos.service /kiosk-setup/aeropos.service
COPY build-iso.sh /build-iso.sh

RUN chmod +x /build-iso.sh

# Run the build-iso.sh script as default entry point
ENTRYPOINT ["/build-iso.sh"]
