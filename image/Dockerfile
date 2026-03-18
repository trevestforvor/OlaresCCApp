# image/Dockerfile
FROM ubuntu:24.04 AS builder

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY app/frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY app/frontend ./frontend
# Override outDir for the build stage (vite.config.js outDir stays for local dev)
RUN cd frontend && npx vite build --outDir /build/public

COPY app/backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY app/backend ./backend

# ── Runtime stage ──────────────────────────────────────────────
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git jq less ripgrep tini \
    python3 make g++ \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash claude

USER claude
ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
RUN curl -fsSL https://claude.ai/install.sh | bash -s stable

USER root
COPY --from=builder /build/backend /app
COPY --from=builder /build/public /app/public

ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
ENV SETTINGS_PATH=/config/settings.json
ENV WORKSPACE_ROOT=/workspace
ENV PORT=3000

EXPOSE 3000
USER claude
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.js"]
