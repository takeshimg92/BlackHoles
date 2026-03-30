"""Shared simulation cache to avoid redundant sxs.load() calls."""

import threading
import sxs

_cache = {}
_lock = threading.Lock()


def get_simulation(sim_id: str, extrapolation_order: int = 2):
    """Load and cache an SXS simulation. Thread-safe."""
    key = (sim_id, extrapolation_order)
    with _lock:
        if key in _cache:
            return _cache[key]

    # Load outside the lock (may take seconds for download)
    sim = sxs.load(sim_id, extrapolation_order=extrapolation_order)

    with _lock:
        _cache[key] = sim
    return sim
