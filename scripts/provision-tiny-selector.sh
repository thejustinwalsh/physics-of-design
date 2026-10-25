#!/bin/sh
set -eu
pod_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$pod_root"
sh scripts/provision-selector-runtime.sh
pod_file=artifacts/runtime/Qwen3.5-0.8B-Q4_K_M.gguf
pod_hash=bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517
if ! printf '%s  %s\n' "$pod_hash" "$pod_file" | shasum -a 256 -c - 2>/dev/null; then
  curl -fL --retry 3 -o "$pod_file" https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf
  printf '%s  %s\n' "$pod_hash" "$pod_file" | shasum -a 256 -c -
fi
HF_HOME="$pod_root/artifacts/runtime/hf" artifacts/runtime/semif-env/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download('Qwen/Qwen3.5-0.8B', revision='2fc06364715b967f1860aea9cf38778875588b17', allow_patterns=['*.json','*.jinja','LICENSE','README.md','merges.txt','vocab.json'])
PY
printf '%s\n' 'Experimental tiny selector provisioned. profile=qwen3.5-0.8b, maxPromptTokens=4096. It is not a verifier or validated design judge.'
