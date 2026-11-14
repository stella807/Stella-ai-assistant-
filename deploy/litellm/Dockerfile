# LiteLLM gateway for Safehubby. Pinned by digest: on 2026-03-24 two LiteLLM
# releases (1.82.7, 1.82.8) were published with a credential stealer, so this
# never follows "latest". Change the pin only after checking the new release.
FROM ghcr.io/berriai/litellm:v1.109.1@sha256:11175975a3093e05e92faee2fe2fe3412a3ae2fcaa849eb0fe25d5f0d8bcb2e9
COPY config.yaml /app/config.yaml
EXPOSE 4000
CMD ["--config", "/app/config.yaml", "--port", "4000"]
