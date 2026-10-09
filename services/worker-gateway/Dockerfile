FROM node:24-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/sxmxc/mingd"
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/build-config/package.json packages/build-config/package.json
COPY packages/worker-protocol/package.json packages/worker-protocol/package.json
COPY services/builder/package.json services/builder/package.json
COPY services/worker-gateway/package.json services/worker-gateway/package.json
RUN npm ci --workspace @mingd/worker-gateway --include-workspace-root
COPY packages/build-config packages/build-config
COPY packages/worker-protocol packages/worker-protocol
COPY services/worker-gateway services/worker-gateway
ENV NODE_ENV=production \
    WORKER_GATEWAY_HOST=0.0.0.0 \
    WORKER_GATEWAY_PORT=3001
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "services/worker-gateway/src/index.ts"]
