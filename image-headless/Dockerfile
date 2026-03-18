# image-headless/Dockerfile
# Minimal headless variant: Claude Code served directly via ttyd web terminal.
# No web UI, no settings panel, no file tree — just Claude.
# Claude manages its own login and API keys interactively on first launch.

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git jq less ripgrep tini \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install ttyd (static binary — no build deps needed)
RUN TTYD_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "aarch64" || echo "x86_64") \
  && curl -fsSL \
    "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.${TTYD_ARCH}" \
    -o /usr/local/bin/ttyd \
  && chmod +x /usr/local/bin/ttyd

RUN useradd -m -u 1001 -s /bin/bash claude

USER claude
ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
RUN curl -fsSL https://claude.ai/install.sh | bash -s stable

USER root
ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}

EXPOSE 3000
USER claude
WORKDIR /home/claude

ENTRYPOINT ["/usr/bin/tini", "--"]
# ttyd wraps Claude Code in a full web terminal.
# -W  enables keyboard input (writable mode)
# Claude handles auth/API-key setup interactively on first launch.
CMD ["ttyd", "--port", "3000", "-W", "claude"]
