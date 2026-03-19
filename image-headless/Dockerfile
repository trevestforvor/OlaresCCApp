# image-headless/Dockerfile
# Build context: project root (.)
# Multi-stage: Stage 1 compiles node-pty native addon; Stage 2 is the lean runtime.

# ── Stage 1: compile node-pty native addon ────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
# Copy package files from image-headless/ (build context is project root)
COPY image-headless/package*.json ./
# python3 make g++ compile node-pty's C++ addon.
# These build tools are NOT carried into the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git dumb-init \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 -s /bin/bash claude

# Install Claude Code via official installer (as claude user, installs to ~/.claude/bin/)
USER claude
RUN curl -fsSL https://claude.ai/install.sh | bash
USER root

# Put claude on PATH for all users
ENV PATH="/home/claude/.claude/bin:${PATH}"

# Copy compiled node_modules and server source from their locations under project root
WORKDIR /app
COPY --from=builder /app/node_modules /app/node_modules
COPY image-headless/server.js image-headless/index.html /app/

USER claude
WORKDIR /home/claude
EXPOSE 3000

# dumb-init as PID 1: correctly reaps zombie processes from Claude Code's subprocesses
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/server.js"]
