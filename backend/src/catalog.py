"""SXS catalog browser and metadata extraction."""

import sxs
import numpy as np
import pandas as pd

_catalog_df = None


def get_catalog_df() -> pd.DataFrame:
    """Load and cache the SXS BBH catalog dataframe."""
    global _catalog_df
    if _catalog_df is None:
        df = sxs.load("dataframe", tag="3.0.0")
        _catalog_df = df.BBH
    return _catalog_df


def list_simulations(
    max_results: int = 50,
    min_orbits: float = 5.0,
    max_eccentricity: float | None = None,
    mass_ratio_range: tuple[float, float] | None = None,
) -> list[dict]:
    """Return a filtered list of simulations with key metadata."""
    df = get_catalog_df()

    # Exclude deprecated simulations
    mask = ~df["deprecated"].fillna(False).astype(bool)
    mask &= df["number_of_orbits_from_reference_time"] >= min_orbits

    if max_eccentricity is not None:
        mask &= df["reference_eccentricity"] <= max_eccentricity

    if mass_ratio_range is not None:
        lo, hi = mass_ratio_range
        mask &= (df["reference_mass_ratio"] >= lo) & (df["reference_mass_ratio"] <= hi)

    filtered = df[mask].head(max_results)

    results = []
    for sim_id, row in filtered.iterrows():
        results.append(_row_to_summary(sim_id, row))

    return results


def get_simulation_metadata(sim_id: str) -> dict:
    """Get detailed metadata for a single simulation."""
    df = get_catalog_df()
    if sim_id not in df.index:
        raise ValueError(f"Simulation {sim_id} not found in catalog")

    row = df.loc[sim_id]
    summary = _row_to_summary(sim_id, row)

    # Add extra fields for the detail view
    extra_fields = [
        "initial_ADM_energy",
        "initial_ADM_angular_momentum",
        "remnant_mass",
        "remnant_dimensionless_spin",
        "remnant_velocity",
        "initial_separation",
        "initial_orbital_frequency",
        "common_horizon_time",
    ]
    for field in extra_fields:
        val = row.get(field)
        if val is not None:
            summary[field] = _to_serializable(val)

    return summary


def _row_to_summary(sim_id: str, row: pd.Series) -> dict:
    return {
        "sim_id": str(sim_id),
        "mass_ratio": _to_serializable(row.get("reference_mass_ratio")),
        "mass1": _to_serializable(row.get("reference_mass1")),
        "mass2": _to_serializable(row.get("reference_mass2")),
        "chi_eff": _to_serializable(row.get("reference_chi_eff")),
        "spin1": _to_serializable(row.get("reference_dimensionless_spin1")),
        "spin2": _to_serializable(row.get("reference_dimensionless_spin2")),
        "eccentricity": _to_serializable(row.get("reference_eccentricity")),
        "num_orbits": _to_serializable(row.get("number_of_orbits_from_reference_time")),
    }


def _to_serializable(val):
    """Convert numpy types to JSON-serializable Python types."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val
