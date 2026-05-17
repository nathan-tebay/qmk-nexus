FROM debian:bookworm-slim AS qmk-source

ARG QMK_FIRMWARE_REF=master

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Keep the full QMK keyboard catalog so qmk compile can resolve any upstream
# keyboard by path. Strip only VCS metadata, docs, and build artefacts.
# qmk_json builds rely on the keyboards/ tree being present; qmk_native builds
# additionally restore files via /build/upstream_overlay.
# To pin to a specific commit, pass --build-arg QMK_FIRMWARE_REF=<sha>.
# Rebuild the builder image + regenerate qmk_index.json at the same ref.
RUN git init /qmk_firmware && \
    cd /qmk_firmware && \
    git remote add origin https://github.com/qmk/qmk_firmware.git && \
    git fetch --depth 1 origin "${QMK_FIRMWARE_REF}" && \
    git checkout --detach FETCH_HEAD && \
    git rev-parse HEAD > /qmk_firmware/.qmk_commit && \
    git submodule update --init --depth 1 lib/lufa lib/vusb lib/chibios lib/chibios-contrib lib/pico-sdk lib/printf && \
    rm -rf \
        .build \
        .git \
        .github \
        docs \
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

ARG QMK_FIRMWARE_REF=master
ENV QMK_FIRMWARE_REF=${QMK_FIRMWARE_REF}
ENV QMK_HOME=/qmk_firmware
ENV PATH=/qmk_firmware/bin:$PATH
RUN python3 -m pip install --no-cache-dir --break-system-packages qmk -r /qmk_firmware/requirements.txt
RUN qmk --version

WORKDIR /build
COPY build.sh /usr/local/bin/build.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY fargate_build.py /usr/local/bin/fargate_build.py
COPY api.sh /api.sh
RUN python3 -m pip install --no-cache-dir --break-system-packages boto3 && \
    chmod +x /usr/local/bin/build.sh /usr/local/bin/entrypoint.sh /usr/local/bin/fargate_build.py /api.sh

EXPOSE 8099
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
