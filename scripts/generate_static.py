#!/usr/bin/env python3
"""Generate static JSON data for selected SXS simulations.

Usage:
    cd backend
    uv run python ../scripts/generate_static.py

Outputs to frontend/public/preloaded/<SIM_ID>/
"""

import json
import os
import sys
import time

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from src.catalog import list_simulations, get_simulation_metadata
from src.waveforms import load_waveform
from src.orbits import load_trajectories
from src.evolution import load_evolution_data

# Selected 51 simulations with good diversity
SELECTED_SIMS = [
    "SXS:BBH:0177", "SXS:BBH:0178", "SXS:BBH:0204", "SXS:BBH:0304",
    "SXS:BBH:0501", "SXS:BBH:0528", "SXS:BBH:0811", "SXS:BBH:1124",
    "SXS:BBH:1132", "SXS:BBH:1215", "SXS:BBH:1410", "SXS:BBH:1412",
    "SXS:BBH:1413", "SXS:BBH:1414", "SXS:BBH:1415", "SXS:BBH:1416",
    "SXS:BBH:1417", "SXS:BBH:1727", "SXS:BBH:1968", "SXS:BBH:2244",
    "SXS:BBH:2526", "SXS:BBH:2527", "SXS:BBH:2617", "SXS:BBH:2619",
    "SXS:BBH:2620", "SXS:BBH:2621", "SXS:BBH:2626", "SXS:BBH:2628",
    "SXS:BBH:2629", "SXS:BBH:2631", "SXS:BBH:2633", "SXS:BBH:2635",
    "SXS:BBH:2710", "SXS:BBH:2881", "SXS:BBH:2931", "SXS:BBH:3336",
    "SXS:BBH:3407", "SXS:BBH:3626", "SXS:BBH:3933", "SXS:BBH:3934",
    "SXS:BBH:3935", "SXS:BBH:3976", "SXS:BBH:4020", "SXS:BBH:4035",
    "SXS:BBH:4047", "SXS:BBH:4048", "SXS:BBH:4054", "SXS:BBH:4072",
    "SXS:BBH:4261", "SXS:BBH:4264", "SXS:BBH:4265",
]

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'preloaded')


def compact(obj):
    """Round floats to 6 decimal places for smaller JSON."""
    if isinstance(obj, list):
        return [round(v, 6) if isinstance(v, float) else compact(v) for v in obj]
    if isinstance(obj, dict):
        return {k: compact(v) for k, v in obj.items()}
    if isinstance(obj, float):
        return round(obj, 6)
    return obj


def save_json(data, path):
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return os.path.getsize(path)


def generate_one(sim_id):
    """Generate all data files for one simulation."""
    dir_name = sim_id.replace(':', '_')
    out = os.path.join(OUT_DIR, dir_name)
    os.makedirs(out, exist_ok=True)

    total = 0
    for key, loader in [
        ('metadata', lambda: get_simulation_metadata(sim_id)),
        ('trajectories', lambda: load_trajectories(sim_id)),
        ('waveform', lambda: load_waveform(sim_id)),
        ('evolution', lambda: load_evolution_data(sim_id)),
    ]:
        data = compact(loader())
        size = save_json(data, os.path.join(out, f'{key}.json'))
        total += size

    return total


def generate_catalog():
    """Generate the static catalog JSON."""
    sims = list_simulations(max_results=10000, min_orbits=0)
    # Filter to only selected simulations
    selected = [s for s in sims if s['sim_id'] in SELECTED_SIMS]
    # Sort by sim_id
    selected.sort(key=lambda s: s['sim_id'])

    path = os.path.join(OUT_DIR, 'catalog.json')
    size = save_json(selected, path)
    return len(selected), size


def main():
    print(f"Generating static data for {len(SELECTED_SIMS)} simulations...")
    print(f"Output: {OUT_DIR}\n")

    # Generate catalog
    n_cat, cat_size = generate_catalog()
    print(f"Catalog: {n_cat} sims, {cat_size/1024:.1f} KB")

    # Generate per-simulation data
    total_size = cat_size
    failed = []

    for i, sim_id in enumerate(SELECTED_SIMS):
        t0 = time.time()
        try:
            size = generate_one(sim_id)
            elapsed = time.time() - t0
            total_size += size
            print(f"  [{i+1}/{len(SELECTED_SIMS)}] {sim_id}: {size/1024:.0f} KB ({elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - t0
            failed.append((sim_id, str(e)))
            print(f"  [{i+1}/{len(SELECTED_SIMS)}] {sim_id}: FAILED ({elapsed:.1f}s) - {e}")

    print(f"\nTotal: {total_size/1024/1024:.1f} MB raw")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for sid, err in failed:
            print(f"  {sid}: {err}")


if __name__ == '__main__':
    main()
