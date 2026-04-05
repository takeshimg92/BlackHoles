"""
Monotonicity verification for the gravitational lensing deflection profile.

The fundamental requirement is that the effective source radius
  r_source(r_screen) = r_screen - deflection(r_screen)
must be MONOTONICALLY INCREASING. If it ever decreases, two screen radii
map to the same source radius, creating visible ring artifacts.
"""

import numpy as np
import pytest
from pathlib import Path


def glsl_smoothstep(edge0, edge1, x):
    """Exact GLSL smoothstep: Hermite interpolation, clamped."""
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def deflection_buggy(r, strength, rEH):
    """Current (buggy) deflection formula."""
    rLens = rEH * 5.0
    d = strength * rEH**2 / (r**2 + rEH**2)
    d *= glsl_smoothstep(rLens, rEH * 1.5, r)
    return d


def deflection_fixed(r, strength, rEH):
    """Fixed deflection with soft saturation: d_eff = d*r/(d+r).
    This naturally limits deflection < r (so r_source > 0) with
    smooth, monotonic behavior — no hard clamps, no plateaus."""
    rLens = rEH * 5.0
    d = strength * rEH**2 / (r**2 + rEH * 0.5)
    d *= glsl_smoothstep(rLens, rLens * 0.3, r)
    # Soft saturation: d_eff approaches r asymptotically but never reaches it
    d = d * r / (d + r + 1e-10)
    return d


def source_radius(r, deflection_fn, strength, rEH):
    return r - deflection_fn(r, strength, rEH)


# --- Parametrized tests ---

STRENGTHS = list(np.arange(0.0, 1.51, 0.05))
MASSES = [0.3, 0.5, 0.8, 1.0]


@pytest.mark.parametrize("strength", STRENGTHS)
@pytest.mark.parametrize("mass", MASSES)
def test_fixed_deflection_monotonic(strength, mass):
    """r_source(r) must be monotonically increasing for the fixed formula."""
    rEH = mass * 0.06
    rLens = rEH * 5.0
    inner = rEH * 0.8
    r = np.linspace(inner, rLens, 10000)
    rs = source_radius(r, deflection_fixed, strength, rEH)
    diffs = np.diff(rs)
    assert np.all(diffs >= -1e-15), (
        f"Non-monotonic at strength={strength:.2f}, mass={mass}: "
        f"min diff={diffs.min():.2e} at r={r[np.argmin(diffs)]:.6f}"
    )


@pytest.mark.parametrize("strength", [0.5, 1.0, 1.5])
@pytest.mark.parametrize("mass", MASSES)
def test_fixed_source_radius_stays_positive(strength, mass):
    """r_source must stay non-negative — negative means UV sampling garbage."""
    rEH = mass * 0.06
    rLens = rEH * 5.0
    inner = rEH * 0.8
    r = np.linspace(inner, rLens, 10000)
    rs = source_radius(r, deflection_fixed, strength, rEH)
    assert np.all(rs >= -0.01), (
        f"r_source goes too negative at strength={strength:.1f}, mass={mass}: "
        f"min={rs.min():.4f} at r={r[np.argmin(rs)]:.6f}"
    )


def test_generate_diagnostic_plots():
    """Generate diagnostic PNGs comparing buggy vs fixed profiles."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    out_dir = Path(__file__).parent / "lensing_diagnostics"
    out_dir.mkdir(exist_ok=True)

    mass = 0.5
    rEH = mass * 0.06
    rLens = rEH * 5.0
    r = np.linspace(rEH * 0.8, rLens, 2000)

    test_strengths = [0.3, 0.5, 0.8, 1.0, 1.2, 1.5]

    # Plot 1: Buggy source radius
    fig, ax = plt.subplots(figsize=(10, 6))
    for s in test_strengths:
        rs = source_radius(r, deflection_buggy, s, rEH)
        ax.plot(r, rs, label=f'S={s}')
    ax.plot(r, r, 'k--', alpha=0.3, label='r=r (no lensing)')
    ax.set_xlabel('Screen radius r')
    ax.set_ylabel('Source radius r_source')
    ax.set_title('BUGGY: r_source(r) — non-monotonic regions cause rings')
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.savefig(out_dir / 'buggy_source_radius.png', dpi=150)
    plt.close()

    # Plot 2: Fixed source radius
    fig, ax = plt.subplots(figsize=(10, 6))
    for s in test_strengths:
        rs = source_radius(r, deflection_fixed, s, rEH)
        ax.plot(r, rs, label=f'S={s}')
    ax.plot(r, r, 'k--', alpha=0.3, label='r=r (no lensing)')
    ax.set_xlabel('Screen radius r')
    ax.set_ylabel('Source radius r_source')
    ax.set_title('FIXED: r_source(r) — monotonically increasing')
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.savefig(out_dir / 'fixed_source_radius.png', dpi=150)
    plt.close()

    # Plot 3: Deflection profiles
    fig, ax = plt.subplots(figsize=(10, 6))
    for s in test_strengths:
        ax.plot(r, deflection_fixed(r, s, rEH), label=f'S={s}')
    ax.set_xlabel('Screen radius r')
    ax.set_ylabel('Deflection')
    ax.set_title('Fixed deflection profile')
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.savefig(out_dir / 'deflection_profile.png', dpi=150)
    plt.close()

    # Plot 4: Derivative check
    fig, ax = plt.subplots(figsize=(10, 6))
    for s in test_strengths:
        rs = source_radius(r, deflection_fixed, s, rEH)
        dr = np.gradient(rs, r)
        ax.plot(r, dr, label=f'S={s}')
    ax.axhline(0, color='r', linestyle='--', alpha=0.5, label='zero (violation)')
    ax.set_xlabel('Screen radius r')
    ax.set_ylabel("d(r_source)/dr")
    ax.set_title("FIXED: derivative must be > 0 everywhere")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.savefig(out_dir / 'derivative_check.png', dpi=150)
    plt.close()

    print(f"\nDiagnostic plots saved to {out_dir}")
