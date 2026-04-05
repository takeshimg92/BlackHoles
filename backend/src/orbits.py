"""Orbital trajectory extraction from SXS horizon data."""

import numpy as np
from scipy.interpolate import CubicSpline

from .simcache import get_simulation


def load_trajectories(sim_id: str, max_points: int = 6000) -> dict:
    """Load the orbital trajectories of both compact objects.

    Uses actual SXS horizon coordinate data (inertial frame).
    Returns positions for body A and B, plus the common horizon
    if/when it forms.
    """
    sim = get_simulation(sim_id)
    horizons = sim.horizons

    hA = horizons.A
    hB = horizons.B

    t_A = np.array(hA.time)
    pos_A = np.array(hA.coord_center_inertial)

    t_B = np.array(hB.time)
    pos_B = np.array(hB.coord_center_inertial)

    # Use the common time range for A/B, but extend to include
    # the remnant ringdown if a common horizon exists
    t_min = max(t_A[0], t_B[0])
    t_max_AB = min(t_A[-1], t_B[-1])

    # Extend time grid to cover remnant ringdown (200 M after merger)
    t_max = t_max_AB
    try:
        hC = horizons.C
        t_C = np.array(hC.time)
        t_max = min(t_C[-1], t_max_AB + 200)
    except Exception:
        pass

    # Uniform time grid
    n_points = min(max_points, len(t_A), len(t_B))
    t_common = np.linspace(t_min, t_max, n_points)

    # Cubic spline interpolation onto common time grid.
    # Orbital trajectories are smooth curves (quasi-Keplerian spirals),
    # so cubic interpolation avoids the "pointy" artifacts of linear
    # interpolation, especially near merger where the orbit tightens.
    # For times beyond the A/B data range (post-merger), we clamp to
    # the last known position.
    t_clamp_A = np.clip(t_common, t_A[0], t_A[-1])
    t_clamp_B = np.clip(t_common, t_B[0], t_B[-1])

    cs_A = CubicSpline(t_A, pos_A, axis=0, extrapolate=False)
    cs_B = CubicSpline(t_B, pos_B, axis=0, extrapolate=False)

    pos_A_interp = cs_A(t_clamp_A)
    pos_B_interp = cs_B(t_clamp_B)

    # Compute separation
    separation = np.linalg.norm(pos_A_interp - pos_B_interp, axis=1)

    # Masses — these change slowly, linear interp is fine
    mass_A = np.array(hA.christodoulou_mass)
    mass_B = np.array(hB.christodoulou_mass)
    mass_A_interp = np.interp(t_common, t_A, mass_A.flatten())
    mass_B_interp = np.interp(t_common, t_B, mass_B.flatten())

    result = {
        "time": t_common.tolist(),
        "body_A": {
            "x": pos_A_interp[:, 0].tolist(),
            "y": pos_A_interp[:, 1].tolist(),
            "z": pos_A_interp[:, 2].tolist(),
            "mass": mass_A_interp.tolist(),
        },
        "body_B": {
            "x": pos_B_interp[:, 0].tolist(),
            "y": pos_B_interp[:, 1].tolist(),
            "z": pos_B_interp[:, 2].tolist(),
            "mass": mass_B_interp.tolist(),
        },
        "separation": separation.tolist(),
    }

    # Common horizon (remnant) data if available
    try:
        hC = horizons.C
        t_C = np.array(hC.time)
        pos_C = np.array(hC.coord_center_inertial)

        # Downsample remnant trajectory
        stride = max(1, len(t_C) // (max_points // 4))
        result["remnant"] = {
            "time": t_C[::stride].tolist(),
            "x": pos_C[::stride, 0].tolist(),
            "y": pos_C[::stride, 1].tolist(),
            "z": pos_C[::stride, 2].tolist(),
            "mass": np.array(hC.christodoulou_mass)[::stride].flatten().tolist(),
        }
        result["merger_time"] = float(t_C[0])
    except Exception:
        result["remnant"] = None
        result["merger_time"] = None

    return result
