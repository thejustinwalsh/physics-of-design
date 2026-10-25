#!/bin/sh
set -eu
pod_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export HF_HOME="${HF_HOME:-$pod_root/artifacts/runtime/hf}"
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
exec "$pod_root/artifacts/runtime/semif-env/bin/python" "$pod_root/scripts/semif-progress.py" "$@"
