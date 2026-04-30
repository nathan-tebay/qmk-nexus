FROM debian:bookworm-slim AS qmk-source

ARG QMK_FIRMWARE_REF=master

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Keep QMK core and required platform submodules, but prune the upstream
# keyboard catalog and VCS metadata before the final image copy. QMK-native
# builds restore selected keyboard files through /build/upstream_overlay.
RUN git clone --depth 1 --branch "${QMK_FIRMWARE_REF}" \
        https://github.com/qmk/qmk_firmware.git /qmk_firmware && \
    cd /qmk_firmware && \
    git submodule update --init --depth 1 lib/lufa lib/vusb lib/chibios lib/chibios-contrib lib/pico-sdk lib/printf && \
    rm -rf \
        .build \
        .git \
        .github \
        docs \
        keyboards/* \
        layouts/community \
        tests \
        users \
        util/docker \
        util/vagrant && \
    find . -name .git -prune -exec rm -rf {} + && \
    find . -type d \( -name __pycache__ -o -name .pytest_cache \) -prune -exec rm -rf {} +


FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    dfu-util \
    gcc-avr \
    avr-libc \
    binutils-avr \
    gcc-arm-none-eabi \
    binutils-arm-none-eabi \
    libnewlib-arm-none-eabi \
    make \
    python3 \
    python3-pip \
    socat \
    && rm -rf \
        /var/lib/apt/lists/* \
        /usr/share/doc/* \
        /usr/share/info/* \
        /usr/share/man/* \
        /usr/share/lintian \
        /var/cache/debconf/*

COPY --from=qmk-source /qmk_firmware /qmk_firmware

ENV QMK_HOME=/qmk_firmware
ENV PATH=/qmk_firmware/bin:$PATH
RUN python3 -m pip install --no-cache-dir --break-system-packages qmk -r /qmk_firmware/requirements.txt

WORKDIR /build
COPY build.sh /usr/local/bin/build.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY fargate_build.py /usr/local/bin/fargate_build.py
COPY api.sh /api.sh
RUN python3 -m pip install --no-cache-dir --break-system-packages boto3 && \
    chmod +x /usr/local/bin/build.sh /usr/local/bin/entrypoint.sh /usr/local/bin/fargate_build.py /api.sh

EXPOSE 8099
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
