#!/bin/sh
set -eu
pod_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$pod_root"
if [ -x artifacts/runtime/semif-env/bin/semif-score ]; then exit 0; fi
mkdir -p artifacts/runtime
python3 -m pip install --target artifacts/runtime/bootstrap uv==0.13.5
export UV_CACHE_DIR="$pod_root/artifacts/runtime/uv-cache" UV_PYTHON_INSTALL_DIR="$pod_root/artifacts/runtime/python"
artifacts/runtime/bootstrap/bin/uv venv --python 3.12.15 artifacts/runtime/semif-env
artifacts/runtime/bootstrap/bin/uv pip install --python artifacts/runtime/semif-env/bin/python 'semif-phase1[llamacpp] @ git+https://github.com/TheoLeeCJ/SemIf.git@23cf1f39fc9534fe81437200959b6dfc7106e45a'
artifacts/runtime/bootstrap/bin/uv pip freeze --python artifacts/runtime/semif-env/bin/python > artifacts/runtime/semif-installed.txt
