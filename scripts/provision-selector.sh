#!/bin/sh
set -eu
pod_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$pod_root"
sh scripts/provision-selector-runtime.sh
curl -fL --retry 3 -o artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf
printf '%s\n' '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4  artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf' | shasum -a 256 -c -
HF_HOME="$pod_root/artifacts/runtime/hf" artifacts/runtime/semif-env/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download('Qwen/Qwen3.5-4B', revision='851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a', allow_patterns=['*.json','*.jinja','LICENSE','README.md','merges.txt','vocab.json'])
PY
artifacts/runtime/bootstrap/bin/uv pip freeze --python artifacts/runtime/semif-env/bin/python > artifacts/runtime/semif-installed.txt
printf '%s\n' 'Selector provisioned. Use DESIGN_SEMIF_BIN=./scripts/semif-local.sh and gguf=artifacts/runtime/Qwen3.5-4B-Q4_K_M.gguf. Selection runs offline.'
