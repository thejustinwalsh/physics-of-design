"""Observe the installed direct readout without changing prompts, logits or scores."""
from __future__ import annotations

from contextvars import ContextVar
import json
import sys

PREFIX = "@design-selector-progress "


def emit(event):
    # A newline separates the event from native llama.cpp diagnostic fragments.
    print("\n" + PREFIX + json.dumps(event, separators=(",", ":")), file=sys.stderr, flush=True)


def install_progress(backend, observer=emit):
    """Instrument actual completed native chunks; callable with a fake backend in tests."""
    row_id = ContextVar("selector_row", default=None)
    original_load = backend.load_model
    original_score = backend.score
    original_decode = backend._Engine._decode

    def load(*args, **kwargs):
        observer({"phase": "model-loading"})
        result = original_load(*args, **kwargs)
        observer({"phase": "model-ready"})
        return result

    def score(model, tokenizer, row, *args, **kwargs):
        token = row_id.set(row["id"])
        try:
            observer({"phase": "row-start", "rowId": row["id"]})
            result = original_score(model, tokenizer, row, *args, **kwargs)
            observer({"phase": "readout-complete", "rowId": row["id"]})
            return result
        finally:
            row_id.reset(token)

    def decode(engine, tokens, start, sequence, want_logits):
        current = row_id.get()
        if current is None:
            return original_decode(engine, tokens, start, sequence, want_logits)
        native_decode = engine.lib.llama_decode
        processed = 0
        total = len(tokens)
        observer({"phase": "prefill", "rowId": current, "processed": 0, "total": total})

        def chunk(context, batch):
            nonlocal processed
            result = native_decode(context, batch)
            if result == 0:
                processed += int(batch.n_tokens)
                observer({"phase": "prefill", "rowId": current, "processed": processed, "total": total})
            return result

        engine.lib.llama_decode = chunk
        try:
            return original_decode(engine, tokens, start, sequence, want_logits)
        finally:
            engine.lib.llama_decode = native_decode

    backend.load_model = load
    backend.score = score
    backend._Engine._decode = decode


if __name__ == "__main__":
    from semif_phase1 import llamacpp_backend
    install_progress(llamacpp_backend)
    from semif_phase1.cli import main
    main()
