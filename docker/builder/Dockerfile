FROM debian:bookworm-slim AS elf2uf2-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    gcc \
    g++ \
    make \
    git \
    && rm -rf /var/lib/apt/lists/*

# RP2040: elf2uf2 converts ARM ELF to UF2 for drag-and-drop flashing.
RUN git clone --depth 1 --branch 1.5.1 \
        https://github.com/raspberrypi/pico-sdk.git /tmp/pico-sdk && \
    cd /tmp/pico-sdk/tools/elf2uf2 && \
    mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc) && \
    cp elf2uf2 /usr/local/bin/elf2uf2 && \
    rm -rf /tmp/pico-sdk


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
    python3 \
    python3-pip \
    python3-venv \
    git \
    socat \
    && rm -rf /var/lib/apt/lists/*

COPY --from=elf2uf2-builder /usr/local/bin/elf2uf2 /usr/local/bin/elf2uf2

# ── QMK firmware (shallow clone + LUFA for AVR USB) ──────────────────────────
# Provides the C headers and make infrastructure; LUFA is required for the
# USB HID stack on AVR.  ChibiOS submodule is initialised for ARM targets.
RUN git clone --depth 1 https://github.com/qmk/qmk_firmware.git /qmk_firmware && \
    cd /qmk_firmware && \
    git submodule update --init --depth 1 \
        lib/lufa \
        lib/chibios \
        lib/chibios-contrib

ENV QMK_HOME=/qmk_firmware

WORKDIR /build
COPY build.sh /usr/local/bin/build.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY api.sh /api.sh
RUN chmod +x /usr/local/bin/build.sh /usr/local/bin/entrypoint.sh /api.sh

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
