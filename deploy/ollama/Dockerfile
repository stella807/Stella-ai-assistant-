# Safehubby's own AI model server. Pinned by digest so a new Ollama release never
# reaches production unchecked; change the pin only after testing the new release.
FROM ollama/ollama:0.40.16@sha256:910d0d8107b538fb0894e63163eb195de0cc7aefcbc666dc62d3b18f71124592

# Tuned for a CPU-only Railway service (Railway has no GPUs):
# - one model in memory and one answer at a time, so answers never fight for the CPUs;
# - a 4,096-token window, enough for a question plus the business facts it needs;
# - the model unloads after 5 idle minutes, so memory is paid for only while it is in use.
ENV OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_QUEUE=32 \
    OLLAMA_CONTEXT_LENGTH=4096 \
    OLLAMA_KEEP_ALIVE=5m \
    OLLAMA_NOHISTORY=1

COPY start.sh /start.sh
EXPOSE 11434
ENTRYPOINT ["/bin/sh", "/start.sh"]
