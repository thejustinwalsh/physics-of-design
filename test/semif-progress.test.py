"""No model/runtime imports: native chunk observer preserves the backend contract."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location(
    "semif_progress", Path(__file__).resolve().parents[1] / "scripts/semif-progress.py")
progress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(progress)


class ProgressTest(unittest.TestCase):
    def backend(self, failure=None):
        calls = []

        def native(context, batch):
            calls.append((context, batch.n_tokens))
            return -1 if failure == len(calls) else 0

        class Engine:
            def __init__(self):
                self.lib = SimpleNamespace(llama_decode=native)

            def _decode(self, tokens, start, sequence, want_logits):
                for offset in range(0, len(tokens), 512):
                    batch = SimpleNamespace(n_tokens=len(tokens[offset:offset + 512]))
                    if self.lib.llama_decode("context", batch) != 0:
                        raise RuntimeError("synthetic native failure")
                return (start, sequence, want_logits, "unchanged-logits")

        engine = Engine()
        backend = SimpleNamespace(
            _Engine=Engine,
            load_model=lambda name: (engine, name),
            score=lambda model, tokenizer, row: model._decode(
                list(range(row["tokens"])), 0, 1, True))
        return backend, engine, native, calls

    def test_real_completed_chunks_and_output_unchanged(self):
        backend, engine, native, calls = self.backend()
        events = []
        progress.install_progress(backend, events.append)
        self.assertEqual(backend.load_model("tokenizer"), (engine, "tokenizer"))
        result = backend.score(engine, "tokenizer", {"id": "row", "tokens": 1300})
        self.assertEqual(result, (0, 1, True, "unchanged-logits"))
        self.assertEqual(calls, [("context", 512), ("context", 512), ("context", 276)])
        self.assertIs(engine.lib.llama_decode, native)
        self.assertEqual([e["processed"] for e in events if e["phase"] == "prefill"],
                         [0, 512, 1024, 1300])
        self.assertTrue(all(e["total"] == 1300 for e in events if e["phase"] == "prefill"))
        self.assertEqual([e["phase"] for e in events], [
            "model-loading", "model-ready", "row-start", "prefill", "prefill",
            "prefill", "prefill", "readout-complete"])
        # A decode outside a scored row must remain unobserved.
        engine._decode([1], 2, 3, False)
        self.assertEqual(len(events), 8)

    def test_failed_native_chunk_not_reported_completed_and_function_restored(self):
        backend, engine, native, _ = self.backend(failure=2)
        events = []
        progress.install_progress(backend, events.append)
        with self.assertRaisesRegex(RuntimeError, "synthetic native failure"):
            backend.score(engine, None, {"id": "row", "tokens": 1300})
        self.assertEqual([e["processed"] for e in events if e["phase"] == "prefill"], [0, 512])
        self.assertNotIn("readout-complete", [e["phase"] for e in events])
        self.assertIs(engine.lib.llama_decode, native)
        engine._decode([1], 0, 0, False)
        self.assertEqual(len(events), 3)


if __name__ == "__main__":
    unittest.main()
