"""
High-performance compute harness for Ryzen 9 (12P) + RTX 3060 (12GB).
- CPU-bound: ProcessPoolExecutor with up to 12 worker processes.
- GPU: CuPy (preferred for NumPy-like API) or PyTorch CUDA fallback.
- Vectorization: NumPy/CuPy on arrays; avoid Python-level loops on large data.

Note on complexity: Parallelism improves *wall time* (often ~T/n_workers for
embarrassingly parallel work). Asymptotic complexity is still O(n) unless you
change the algorithm (e.g. FFT O(n log n)). "O(n/12)" is informal speedup, not
a formal complexity class.
"""

from __future__ import annotations

import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import lru_cache

# --- Optional GPU backends (install: cupy-cuda12x or torch with CUDA) ----------
_USE_GPU = os.environ.get("FORCE_CPU_ONLY", "").lower() not in ("1", "true", "yes")

xp = None  # CuPy module when available; else None (use NumPy on CPU for array ops)
GPU_NAME = "cpu"

if _USE_GPU:
    try:
        import cupy as xp  # type: ignore

        xp.cuda.Device(0).use()
        GPU_NAME = "cupy (CUDA)"
    except Exception:
        xp = None

if xp is None:
    try:
        import torch

        if torch.cuda.is_available():
            GPU_NAME = f"pytorch ({torch.cuda.get_device_name(0)})"
        else:
            GPU_NAME = "numpy (torch cuda unavailable)"
    except ImportError:
        GPU_NAME = "numpy"

import numpy as np

# Prefer CuPy ndarray API when xp is cupy; else NumPy for CPU array ops.
def get_xp():
    """Return cupy if available, else numpy."""
    return xp if xp is not None else np


def _worker_chunk_sum_squares(args: tuple[int, np.ndarray]) -> float:
    """Top-level function for pickling in ProcessPoolExecutor."""
    _chunk_id, vec = args
    # Vectorized on worker; vec is a numpy view/copy from parent
    return float(np.dot(vec, vec))


def parallel_sum_of_squares(
    data: np.ndarray, *, max_workers: int | None = None
) -> float:
    """
    Split 1-D float data across processes; each worker does vectorized sum(x**2).
    Embarrassingly parallel -> near-linear speedup up to core count.
    """
    if data.ndim != 1:
        data = data.ravel()
    n = data.size
    if n == 0:
        return 0.0

    workers = max_workers or min(12, max(1, os.cpu_count() or 12))
    if n < workers * 4096:
        # Overhead not worth it for tiny inputs
        return float(np.dot(data, data))

    chunks = np.array_split(data, workers)
    indexed = list(enumerate(chunks))
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_worker_chunk_sum_squares, (i, c)) for i, c in indexed]
        return sum(f.result() for f in as_completed(futures))


def gpu_matrix_pipeline(
    a: np.ndarray,
    b: np.ndarray,
) -> np.ndarray:
    """
    Heavy matmul + elementwise ops on GPU when CuPy or PyTorch CUDA is available.
    Falls back to NumPy on CPU.
    """
    xp_mod = get_xp()
    if xp_mod is not np and hasattr(xp_mod, "asarray"):
        # CuPy path
        ga = xp_mod.asarray(a)
        gb = xp_mod.asarray(b)
        out = xp_mod.matmul(ga, gb)
        out = xp_mod.tanh(out * 0.5) + xp_mod.exp(-out**2 / (out.shape[0] + 1))
        return xp_mod.asnumpy(out)

    try:
        import torch

        if torch.cuda.is_available():
            device = torch.device("cuda")
            ta = torch.from_numpy(a).float().to(device)
            tb = torch.from_numpy(b).float().to(device)
            out = torch.matmul(ta, tb)
            out = torch.tanh(out * 0.5) + torch.exp(-out**2 / (out.shape[0] + 1))
            return out.detach().cpu().numpy()
    except ImportError:
        pass

    # CPU NumPy vectorized
    out = np.matmul(a, b)
    return np.tanh(out * 0.5) + np.exp(-(out**2) / (out.shape[0] + 1))


@lru_cache(maxsize=32)
def kernel_radius(n: int) -> float:
    """Tiny example of lru_cache for repeated scalar lookups."""
    return math.sqrt(float(n)) * 0.01


def vectorized_monte_carlo_pi(n_samples: int, rng: np.random.Generator) -> float:
    """Vectorized: no Python for-loop over samples."""
    xy = rng.random((n_samples, 2), dtype=np.float64)
    inside = np.sum((xy * xy).sum(axis=1) <= 1.0)
    return 4.0 * inside / n_samples


def bench_report(
    label: str,
    before_ns: float | None,
    after_ns: float | None,
) -> None:
    if before_ns and after_ns and before_ns > 0:
        speedup = before_ns / after_ns
        print(f"[bench] {label}: ~{speedup:.2f}x faster (rough; not calibrated)")
    else:
        print(f"[bench] {label}: timing not available")


def main() -> int:
    print(f"Backend: {GPU_NAME}", file=sys.stderr)

    rng = np.random.default_rng(42)
    n = 2_000_000
    data = rng.standard_normal(n, dtype=np.float64)

    import time

    t0 = time.perf_counter_ns()
    s_seq = float(np.dot(data, data))
    t1 = time.perf_counter_ns()

    t2 = time.perf_counter_ns()
    s_par = parallel_sum_of_squares(data, max_workers=12)
    t3 = time.perf_counter_ns()

    assert math.isclose(s_seq, s_par, rel_tol=1e-9)
    bench_report("sum_of_squares parallel vs sequential", t1 - t0, t3 - t2)

    # GPU-friendly block: medium matrices to amortize transfer
    dim = 4096
    a = rng.standard_normal((dim, dim), dtype=np.float32)
    b = rng.standard_normal((dim, dim), dtype=np.float32)
    t4 = time.perf_counter_ns()
    _ = gpu_matrix_pipeline(a, b)
    t5 = time.perf_counter_ns()
    print(f"[bench] gpu_matrix_pipeline {dim}x{dim}: {(t5 - t4) / 1e6:.2f} ms", file=sys.stderr)

    pi_est = vectorized_monte_carlo_pi(5_000_000, rng)
    print(f"Monte Carlo pi ~ {pi_est:.6f}", file=sys.stderr)

    print("OK", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
