"""Evolution data: masses, spins, and radiated energy over time."""

import numpy as np

from .simcache import get_simulation


def load_evolution_data(sim_id: str, max_points: int = 1000) -> dict:
    """Load time-evolving physical quantities for the merger.

    Returns Christodoulou masses, spins, separation, and radiated
    energy computed from the GW strain energy flux.
    """
    sim = get_simulation(sim_id)
    horizons = sim.horizons
    metadata = sim.metadata

    hA = horizons.A
    hB = horizons.B

    t_A = np.array(hA.time)
    t_B = np.array(hB.time)

    mass_A = np.array(hA.christodoulou_mass).flatten()
    mass_B = np.array(hB.christodoulou_mass).flatten()

    # Common time range
    t_min = max(t_A[0], t_B[0])
    t_max = min(t_A[-1], t_B[-1])

    n_points = min(max_points, len(t_A), len(t_B))
    t = np.linspace(t_min, t_max, n_points)

    m_A = np.interp(t, t_A, mass_A)
    m_B = np.interp(t, t_B, mass_B)

    # Separation
    pos_A = np.array(hA.coord_center_inertial)
    pos_B = np.array(hB.coord_center_inertial)
    sep_raw = np.linalg.norm(pos_A - pos_B[:len(pos_A)], axis=1)
    t_sep = t_A[:len(sep_raw)]
    separation = np.interp(t, t_sep, sep_raw)

    # Spin magnitudes
    chi_A = np.array(hA.chi_inertial_mag).flatten()
    chi_B = np.array(hB.chi_inertial_mag).flatten()
    spin_A = np.interp(t, t_A, chi_A)
    spin_B = np.interp(t, t_B, chi_B)

    # Radiated energy from the GW strain:
    # dE/dt ∝ |dh/dt|²  →  E_rad(t) = ∫₀ᵗ |ḣ|² dt' / (16π)
    # We compute from the (2,2) mode strain
    h = sim.h
    h22 = h.data[:, h.index(2, 2)]
    t_h = np.array(h.t)
    hdot = np.gradient(h22, t_h)
    power = np.abs(hdot) ** 2  # ∝ radiated power
    # Cumulative integral
    e_cum = np.cumsum(power * np.gradient(t_h)) / (16 * np.pi)
    # Normalize so final value matches known remnant mass deficit
    adm_energy = metadata.get("initial_ADM_energy", 1.0)
    remnant_mass = metadata.get("remnant_mass", None)
    if remnant_mass is not None:
        true_e_rad = adm_energy - remnant_mass
        if e_cum[-1] > 0:
            e_cum *= true_e_rad / e_cum[-1]

    e_rad_interp = np.interp(t, t_h, e_cum)
    e_rad_frac = e_rad_interp / adm_energy

    result = {
        "time": t.tolist(),
        "mass_A": m_A.tolist(),
        "mass_B": m_B.tolist(),
        "spin_A": spin_A.tolist(),
        "spin_B": spin_B.tolist(),
        "separation": separation.tolist(),
        "energy_radiated_frac": e_rad_frac.tolist(),
        "adm_energy": float(adm_energy),
        "remnant_mass": float(remnant_mass) if remnant_mass else None,
    }

    # Remnant data if available
    try:
        hC = horizons.C
        t_C = np.array(hC.time)
        mass_C = np.array(hC.christodoulou_mass).flatten()
        chi_C = np.array(hC.chi_inertial_mag).flatten()

        stride = max(1, len(t_C) // (max_points // 4))
        result["remnant_evolution"] = {
            "time": t_C[::stride].tolist(),
            "mass": mass_C[::stride].tolist(),
            "spin": chi_C[::stride].tolist(),
        }
    except Exception:
        result["remnant_evolution"] = None

    return result
