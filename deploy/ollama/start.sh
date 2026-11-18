#!/bin/sh
# Starts Ollama, then makes sure the model is on the volume. The volume at
# /root/.ollama keeps the model between deploys, so it downloads only once.
set -e

# Railway's private network can be IPv6-only, so listen on "::" wherever the
# kernel has IPv6, and on 0.0.0.0 where it has none.
if [ -e /proc/net/tcp6 ]; then OLLAMA_HOST="[::]:${PORT:-11434}"; else OLLAMA_HOST="0.0.0.0:${PORT:-11434}"; fi
export OLLAMA_HOST

ollama serve &
server=$!

# Wait for the server, then download the model if this volume does not have it yet.
i=0
until ollama list >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then echo "[ollama] server did not start" >&2; exit 1; fi
  sleep 1
done
if ollama list | awk 'NR > 1 { print $1 }' | grep -qx "$OLLAMA_MODEL"; then
  echo "[ollama] $OLLAMA_MODEL is already on the volume"
else
  echo "[ollama] downloading $OLLAMA_MODEL (first start only)"
  ollama pull "$OLLAMA_MODEL"
fi
# Load it now, so the first visitor's question does not wait for it.
ollama run "$OLLAMA_MODEL" "Reply with OK." >/dev/null 2>&1 || true
echo "[ollama] ready: $OLLAMA_MODEL"

wait "$server"
