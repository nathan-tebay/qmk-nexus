FROM debian:bookworm-slim

# AVR toolchain (atmega32u4, atmega32u2, at90usb1286)
# ARM toolchain (stm32*, rp2040)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc-avr \
    avr-libc \
    binutils-avr \
    gcc-arm-none-eabi \
    libnewlib-arm-none-eabi \
    binutils-arm-none-eabi \
    make \
    git \
    python3 \
    python3-pip \
    wget \
    unzip \
    pkg-config \
    libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# RP2040: elf2uf2 converts ARM ELF to UF2 for drag-and-drop flashing.
# Build from pico-sdk source (ARM toolchain already present).
RUN git clone --depth 1 --branch 1.5.1 \
        https://github.com/raspberrypi/pico-sdk.git /tmp/pico-sdk && \
    cd /tmp/pico-sdk/tools/elf2uf2 && \
    mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release 2>/dev/null || true && \
    make -j$(nproc) 2>/dev/null || true && \
    [ -f elf2uf2 ] && cp elf2uf2 /usr/local/bin/ || true && \
    rm -rf /tmp/pico-sdk

WORKDIR /build
COPY build.sh /usr/local/bin/build.sh
RUN chmod +x /usr/local/bin/build.sh

ENTRYPOINT ["/usr/local/bin/build.sh"]
