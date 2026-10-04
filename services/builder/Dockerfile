# Debian Bookworm provides Python 3.11, GCC 12, and a glibc 2.36 baseline.
# Keep BUILD_RECIPE_VERSION in sync with toolchain changes.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils zip unzip git \
    python3 python3-venv \
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
COPY package.json ./
COPY packages/build-config/package.json packages/build-config/package.json
COPY services/builder/package.json services/builder/package.json
RUN npm install --workspaces --include-workspace-root
COPY packages/build-config packages/build-config
COPY services/builder services/builder

ENV GODOT_CACHE_DIR=/cache/godot \
    GODOT_WORK_DIR=/work/jobs \
    CCACHE_DIR=/cache/ccache \
    PATH=/opt/scons/bin:$PATH

CMD ["npm", "run", "start", "--workspace", "@gdslimmer/builder"]
