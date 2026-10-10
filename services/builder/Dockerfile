# Debian Bookworm provides Python 3.11, GCC 12, and a glibc 2.36 baseline.
# Keep BUILD_RECIPE_VERSION in sync with toolchain changes.
FROM node:24-bookworm AS desktop
ARG MINGD_IMAGE_SOURCE=https://github.com/sxmxc/mingd
LABEL org.opencontainers.image.source=$MINGD_IMAGE_SOURCE

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils zip unzip git \
    python3 python3-venv time \
    build-essential pkg-config ccache mingw-w64 \
    libx11-dev libxcursor-dev libxinerama-dev libxi-dev libxrandr-dev \
    libwayland-dev libxkbcommon-dev wayland-protocols \
    libgl1-mesa-dev libglu1-mesa-dev libasound2-dev libpulse-dev libudev-dev \
    && python3 -m venv /opt/scons \
    && /opt/scons/bin/pip install --no-cache-dir 'scons>=4.4,<5' \
    && if [ -x /usr/bin/x86_64-w64-mingw32-gcc-posix ]; then update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix; fi \
    && if [ -x /usr/bin/x86_64-w64-mingw32-g++-posix ]; then update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix; fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/build-config/package.json packages/build-config/package.json
COPY packages/worker-protocol/package.json packages/worker-protocol/package.json
COPY services/builder/package.json services/builder/package.json
COPY services/worker-gateway/package.json services/worker-gateway/package.json
RUN npm ci --workspace @mingd/builder --include-workspace-root
COPY packages/build-config packages/build-config
COPY packages/worker-protocol packages/worker-protocol
COPY services/builder services/builder
COPY scripts/write-image-release.mjs scripts/write-image-release.mjs
ARG MINGD_IMAGE_TAG
RUN node scripts/write-image-release.mjs services/builder/image-release.json

ENV GODOT_CACHE_DIR=/cache/godot \
    GODOT_WORK_DIR=/work/jobs \
    CCACHE_DIR=/cache/ccache \
    PATH=/opt/scons/bin:$PATH

CMD ["node", "--import", "tsx", "services/builder/src/entrypoint.ts"]

# Isolated Web toolchain; recipe 10 accounts for the Emscripten 6 update.
FROM emscripten/emsdk:6.0.11@sha256:cdefec943f04fd4b2b2fe23b0a1a346be9fc560ef5784a83faa27dd351381372 AS web-sdk
FROM desktop AS web
COPY --from=web-sdk /emsdk /emsdk
ENV EMSDK=/emsdk \
    EM_CONFIG=/emsdk/.emscripten \
    PATH=/emsdk:/emsdk/upstream/emscripten:/opt/scons/bin:$PATH \
    BUILDER_TARGET=web \
    BUILDER_QUEUE_NAME=godot-web-builds

# Isolated Android toolchain, verified for Godot 4.6.3 and 4.7.2.
FROM desktop AS android
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*
ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_USER_HOME=/cache/gradle \
    BUILDER_TARGET=android \
    BUILDER_QUEUE_NAME=godot-android-builds
RUN curl -fL --retry 3 https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip -o /tmp/android-tools.zip \
    && echo '4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583  /tmp/android-tools.zip' | sha256sum -c - \
    && mkdir -p /opt/android-sdk/cmdline-tools \
    && unzip -q /tmp/android-tools.zip -d /tmp/android-tools \
    && mv /tmp/android-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest \
    && rm -rf /tmp/android-tools /tmp/android-tools.zip \
    && yes | /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null \
    && /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.1.0' 'ndk;29.0.14206865'

# Optional Linux macOS cross-worker. No Apple SDK is downloaded by this image.
# Archive layout: target/bin, target/SDK/MacOSX27.0.sdk, plus OSXCross runtime files.
FROM desktop AS macos
RUN apt-get update && apt-get install -y --no-install-recommends libxml2 libssl3 libedit2 libz3-4 libzstd1 libtinfo6 zlib1g liblzma5 \
    && rm -rf /var/lib/apt/lists/*
ARG MACOS_TOOLCHAIN_SHA256
COPY toolchains/macos-toolchain.tar.xz /tmp/macos-toolchain.tar.xz
RUN test -n "$MACOS_TOOLCHAIN_SHA256" \
    && echo "$MACOS_TOOLCHAIN_SHA256  /tmp/macos-toolchain.tar.xz" | sha256sum -c - \
    && mkdir -p /opt/osxcross \
    && tar -xJf /tmp/macos-toolchain.tar.xz -C /opt/osxcross \
    && echo "$MACOS_TOOLCHAIN_SHA256" > /opt/osxcross/toolchain.sha256 \
    && test -f /opt/osxcross/target/SDK/MacOSX27.0.sdk/SDKSettings.json \
    && test -x /opt/osxcross/compiler/bin/clang \
    && rm /tmp/macos-toolchain.tar.xz
ENV OSXCROSS_ROOT=/opt/osxcross \
    PATH=/opt/osxcross/compiler/bin:/opt/osxcross/target/bin:/opt/scons/bin:$PATH \
    LD_LIBRARY_PATH=/opt/osxcross/compiler/lib:/opt/osxcross/target/lib \
    BUILDER_TARGET=macos \
    BUILDER_QUEUE_NAME=godot-macos-builds
