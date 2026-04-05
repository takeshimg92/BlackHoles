"""Shared simulation cache to avoid redundant sxs.load() calls."""

import threading
import sxs

_cache = {}
_lock = threading.Lock()
_pending = {}  # key -> Event for in-progress loads


def get_simulation(sim_id: str, extrapolation_order: int = 2):
    """Load and cache an SXS simulation. Thread-safe.

    If multiple threads request the same simulation concurrently,
    only the first one downloads; the others block until it's ready.
    """
    key = (sim_id, extrapolation_order)

    while True:
        with _lock:
            if key in _cache:
                return _cache[key]

            if key in _pending:
                # Another thread is loading — grab its event and wait
                event = _pending[key]
            else:
                # We'll be the loader — create an event for others to wait on
                event = threading.Event()
                _pending[key] = event
                break  # exit lock and do the load

        # Wait outside the lock for the other thread to finish
        event.wait(timeout=300)
        # Loop back to check cache

    # We are the loader
    try:
        sim = sxs.load(sim_id, extrapolation_order=extrapolation_order)
        with _lock:
            _cache[key] = sim
        return sim
    finally:
        with _lock:
            _pending.pop(key, None)
        event.set()  # wake up any waiting threads
