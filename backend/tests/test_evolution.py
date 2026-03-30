"""Tests for the evolution data endpoint."""

import numpy as np
from src.evolution import load_evolution_data

SIM_ID = "SXS:BBH:0304"


def test_evolution_data_structure():
    """Check all expected keys are present."""
    d = load_evolution_data(SIM_ID)
    for key in ['time', 'mass_A', 'mass_B', 'separation', 'energy_radiated_frac', 'adm_energy']:
        assert key in d, f"Missing key: {key}"
    assert len(d['time']) == len(d['energy_radiated_frac'])
    assert len(d['time']) == len(d['separation'])


def test_energy_radiated_is_positive_and_increasing():
    """Energy radiated should be non-negative and broadly increasing."""
    d = load_evolution_data(SIM_ID)
    e = np.array(d['energy_radiated_frac'])

    assert np.all(e >= 0), f"Negative energy values found: min={e.min()}"
    assert e[-1] > e[0], f"Energy should increase: first={e[0]}, last={e[-1]}"
    # Final value should be a few percent
    assert e[-1] > 0.01, f"Final E_rad={e[-1]:.6f}, expected > 1%"
    assert e[-1] < 0.1, f"Final E_rad={e[-1]:.6f}, expected < 10%"


def test_energy_has_visible_variation():
    """The energy array should NOT look like a flat line.

    Split into 10 chunks and check that later chunks have higher
    average energy than earlier ones.
    """
    d = load_evolution_data(SIM_ID)
    e = np.array(d['energy_radiated_frac'])

    n_chunks = 10
    chunk_size = len(e) // n_chunks
    means = [np.mean(e[i * chunk_size:(i + 1) * chunk_size]) for i in range(n_chunks)]

    print(f"Energy chunk means: {[f'{m:.6f}' for m in means]}")

    # Last chunk should have significantly more energy than first
    assert means[-1] > means[0] * 10, (
        f"Last chunk mean ({means[-1]:.6f}) should be >> first ({means[0]:.6f})"
    )


def test_separation_decreases():
    """Separation should decrease from inspiral to merger."""
    d = load_evolution_data(SIM_ID)
    s = np.array(d['separation'])

    assert s[0] > s[-1], f"Separation should decrease: first={s[0]:.2f}, last={s[-1]:.2f}"
    assert s[0] > 10, f"Initial separation={s[0]:.2f}, expected > 10 M"
    assert s[-1] < 5, f"Final separation={s[-1]:.2f}, expected < 5 M"


def test_json_serializable():
    """All values should be JSON-serializable (no NaN, no numpy types)."""
    import json
    d = load_evolution_data(SIM_ID)

    # This will raise if anything isn't serializable
    j = json.dumps(d)
    d2 = json.loads(j)

    e = d2['energy_radiated_frac']
    assert len(e) > 0
    assert all(isinstance(v, (int, float)) for v in e), "Non-numeric values in energy array"
    assert not any(v != v for v in e), "NaN values in energy array"  # NaN != NaN

    s = d2['separation']
    assert len(s) > 0
    assert not any(v != v for v in s), "NaN values in separation array"


def test_evolution_time_matches_trajectory_range():
    """Evolution time range should cover the same span as trajectories."""
    from src.orbits import load_trajectories

    d = load_evolution_data(SIM_ID)
    traj = load_trajectories(SIM_ID)

    e_tmin, e_tmax = d['time'][0], d['time'][-1]
    t_tmin, t_tmax = traj['time'][0], traj['time'][-1]

    # Should overlap substantially
    overlap = min(e_tmax, t_tmax) - max(e_tmin, t_tmin)
    total = max(e_tmax, t_tmax) - min(e_tmin, t_tmin)
    assert overlap / total > 0.9, (
        f"Evolution [{e_tmin:.0f}, {e_tmax:.0f}] and trajectory [{t_tmin:.0f}, {t_tmax:.0f}] "
        f"overlap only {overlap/total:.1%}"
    )
