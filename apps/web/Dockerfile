FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/build-config/package.json packages/build-config/package.json
COPY services/builder/package.json services/builder/package.json
RUN npm ci

FROM dependencies AS build
COPY packages/build-config packages/build-config
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/web/public \
    && npm run build --workspace @mingd/web

FROM node:22-bookworm-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/sxmxc/mingd"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
