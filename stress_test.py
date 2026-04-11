"""
High-performance matrix multiply benchmark: NumPy (1 thread) vs 12-core CPU vs CuPy GPU.
Target: Ryzen 9 5900X (12P) + RTX 3060 12GB.

Run:  python stress_test.py
"""

from __future__ import annotations

import os
import sys
import time

# Enforce single-threaded BLAS for the "standard" baseline (before NumPy loads BLAS).
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import numpy as np
from concurrent.futures import ProcessPoolExecutor

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
N = 10_000
DTYPE = np.float32
RNG_SEED = 42
CPU_WORKERS = 12  # physical cores on Ryzen 9 5900X


def _row_block_matmul(args: tuple[np.ndarray, np.ndarray]) -> np.ndarray:
    """Worker: (A_block, B) -> A_block @ B. Must be top-level for pickling."""
    a_block, b = args
    return np.matmul(a_block, b)


def benchmark_numpy_single(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, float]:
    t0 = time.perf_counter()
    c = np.matmul(a, b)
    elapsed = time.perf_counter() - t0
    return c, elapsed


def benchmark_numpy_multicore_ordered(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, float]:
    """Split A along rows into CPU_WORKERS chunks; each process computes chunk @ B."""
    row_blocks = np.array_split(a, CPU_WORKERS, axis=0)
    t0 = time.perf_counter()
    with ProcessPoolExecutor(max_workers=CPU_WORKERS) as pool:
        futures = [
            pool.submit(_row_block_matmul, (blk, b)) for blk in row_blocks
        ]
        parts = [f.result() for f in futures]
    c = np.vstack(parts)
    elapsed = time.perf_counter() - t0
    return c, elapsed


def benchmark_cupy(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray | None, float | None, str | None]:
    """
    CuPy on GPU with warm-up. Returns (result_on_cpu_numpy, seconds, error_message).
    """
    try:
        import cupy as cp  # type: ignore
    except ImportError as e:
        msg = (
            "CuPy is not installed. Install a wheel matching your CUDA version, e.g.:\n"
            "  pip install cupy-cuda12x\n"
            "or for CUDA 11.x:\n"
            "  pip install cupy-cuda11x\n"
            "See: https://docs.cupy.dev/en/stable/install.html"
        )
        return None, None, f"{e}\n{msg}"

    # Warm-up (compile kernels, allocate pools)
    w = 256
    aw = cp.asarray(np.random.default_rng(0).random((w, w), dtype=np.float32))
    bw = cp.asarray(np.random.default_rng(1).random((w, w), dtype=np.float32))
    for _ in range(3):
        _ = aw @ bw
    cp.cuda.Stream.null.synchronize()

    ga = cp.asarray(a)
    gb = cp.asarray(b)

    t0 = time.perf_counter()
    gc = ga @ gb
    cp.cuda.Stream.null.synchronize()
    elapsed = time.perf_counter() - t0

    c = cp.asnumpy(gc)
    return c, elapsed, None


def max_abs_diff(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.max(np.abs(a - b)))


def main() -> int:
    print(
        f"Matrix size: {N} x {N}, dtype={DTYPE.__name__}\n"
        f"CPU workers (parallel): {CPU_WORKERS}\n",
        file=sys.stderr,
    )

    rng = np.random.default_rng(RNG_SEED)
    a = rng.random((N, N), dtype=DTYPE)
    b = rng.random((N, N), dtype=DTYPE)

    results: list[tuple[str, float | None, str]] = []

    # 1) Standard NumPy (BLAS limited to 1 thread via env)
    c_ref, t_numpy = benchmark_numpy_single(a, b)
    results.append(("NumPy (1 thread / baseline)", t_numpy, ""))

    # 2) Multi-core: row blocks
    try:
        c_par, t_par = benchmark_numpy_multicore_ordered(a, b)
        err = max_abs_diff(c_ref, c_par)
        note = f" (max |diff| vs baseline: {err:.2e})"
        if err > 1e-2 * N:
            note += " [WARNING: large diff]"
        results.append((f"NumPy + ProcessPoolExecutor ({CPU_WORKERS} cores)", t_par, note))
    except Exception as e:
        results.append(("NumPy + ProcessPoolExecutor (failed)", None, str(e)))

    # 3) GPU
    c_gpu, t_gpu, cupy_err = benchmark_cupy(a, b)
    if t_gpu is not None and c_gpu is not None:
        err = max_abs_diff(c_ref, c_gpu)
        note = f" (max |diff| vs baseline: {err:.2e})"
        results.append((f"CuPy (CUDA GPU)", t_gpu, note))
    else:
        results.append(("CuPy (CUDA GPU)", None, cupy_err or "unknown error"))

    # Table
    baseline = t_numpy
    print("\n" + "=" * 88)
    print(f"{'Method':<48} {'Time (s)':>14} {'Speedup vs NumPy':>18}")
    print("=" * 88)
    for name, t, extra in results:
        if t is None:
            print(f"{name:<48} {'N/A':>14} {'N/A':>18}")
            if extra:
                for line in extra.split("\n"):
                    print(f"  {line}")
        else:
            speedup = baseline / t if t > 0 else float("inf")
            print(f"{name:<48} {t:>14.4f} {speedup:>17.2f}x")
            if extra.strip():
                print(f"  {extra.strip()}")
    print("=" * 88)

    return 0


if __name__ == "__main__":
    # Windows multiprocessing needs this guard
    raise SystemExit(main())
