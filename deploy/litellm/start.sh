#!/bin/sh
# Railway health-checks the port in PORT, and its private network can be
# IPv6-only, so listen on "::" (IPv6 and IPv4) wherever the kernel has IPv6.
# Where it has none, "::" fails without an error, so use 0.0.0.0 there.
if [ -e /proc/net/tcp6 ]; then host="::"; else host="0.0.0.0"; fi
exec docker/prod_entrypoint.sh --config /app/config.yaml --host "$host" --port "${PORT:-4000}"
