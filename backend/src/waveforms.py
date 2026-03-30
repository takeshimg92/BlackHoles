"""Waveform loading and processing from SXS simulations."""

import numpy as np

from .simcache import get_simulation


def load_waveform(sim_id: str, mode: tuple[int, int] = (2, 2), max_points: int = 4000) -> dict:
    """Load the strain waveform h(t) for a given simulation and mode.

    Returns time, real part, imaginary part, and amplitude, resampled
    onto a uniform time grid for correct synchronization with the
    trajectory data (which is also uniformly sampled in time).

    Note: SXS simulations use adaptive time-stepping — the raw data
    has far more samples near merger than during inspiral.  A naive
    stride-based downsample would make index-fraction ≠ time-fraction,
    causing the waveform peak to appear at the wrong point in the
    animation.  Interpolating onto a uniform grid avoids this.
    """
    sim = get_simulation(sim_id)
    h = sim.h

    mode_idx = h.index(*mode)
    h_mode = h.data[:, mode_idx]

    t_raw = np.array(h.t)
    amplitude_raw = np.abs(h_mode)
    phase_raw = np.unwrap(np.angle(h_mode))
    frequency_raw = np.gradient(phase_raw, t_raw) / (2 * np.pi)

    # Frequency-adaptive resampling: place points proportional to the
    # local GW frequency, ensuring at least ~20 samples per cycle
    # everywhere.  This gives the early inspiral sparse sampling
    # (low frequency → slow animation is fine) and the merger dense
    # sampling (high frequency → accurate waveform shape).
    #
    # We interpolate amplitude(t) and phase(t) — both smooth,
    # slowly-varying — then reconstruct h_real and h_imag from them.
    freq_abs = np.abs(frequency_raw)
    freq_abs = np.maximum(freq_abs, 1e-8)  # avoid division by zero

    # Desired dt(t) = 1 / (samples_per_cycle * f(t))
    samples_per_cycle = 20
    desired_dt = 1.0 / (samples_per_cycle * freq_abs)

    # Build non-uniform time grid by integrating 1/desired_dt
    # (cumulative "number of samples" function)
    cum_samples = np.cumsum(np.gradient(t_raw) / desired_dt)
    cum_samples -= cum_samples[0]
    total_desired = cum_samples[-1]

    n_points = min(max_points, int(total_desired))
    n_points = max(n_points, 1000)

    # Invert: for each uniformly-spaced sample index, find the
    # corresponding time
    sample_indices = np.linspace(0, total_desired, n_points)
    t = np.interp(sample_indices, cum_samples, t_raw)

    amplitude = np.interp(t, t_raw, amplitude_raw)
    phase = np.interp(t, t_raw, phase_raw)
    frequency = np.interp(t, t_raw, frequency_raw)

    # Reconstruct h from interpolated envelope and phase
    h_real = (amplitude * np.cos(phase)).tolist()
    h_imag = (amplitude * np.sin(phase)).tolist()

    return {
        "time": t.tolist(),
        "h_real": h_real,
        "h_imag": h_imag,
        "amplitude": amplitude.tolist(),
        "frequency": frequency.tolist(),
        "mode": list(mode),
    }


def generate_audio_data(
    sim_id: str,
    mode: tuple[int, int] = (2, 2),
    sample_rate: int = 44100,
    target_duration: float = 5.0,
    f_min_hz: float = 40.0,
    f_max_hz: float = 800.0,
) -> dict:
    """Generate audio-rate chirp from the waveform envelope and phase.

    Instead of directly resampling h_real(t) (which couples duration to
    pitch), we extract the amplitude envelope A(t) and GW frequency
    f_GW(t) from the (ℓ,m) mode, then re-synthesize an audible chirp:

        audio(t) = A(t) · sin(Φ_audio(t))

    where the audio frequency is the GW frequency mapped linearly into
    [f_min_hz, f_max_hz].  This keeps the chirp audible at any playback
    duration and guarantees the amplitude peak matches the waveform peak.
    """
    sim = get_simulation(sim_id)
    h = sim.h

    mode_idx = h.index(*mode)
    h_mode = h.data[:, mode_idx]

    t = np.array(h.t)
    amplitude = np.abs(h_mode)
    phase = np.unwrap(np.angle(h_mode))
    freq_gw = np.gradient(phase, t) / (2 * np.pi)  # GW frequency in 1/M

    # Map simulation time to audio time [0, target_duration]
    t_frac = (t - t[0]) / (t[-1] - t[0])
    n_samples = int(target_duration * sample_rate)
    t_audio = np.linspace(0, target_duration, n_samples)
    t_frac_audio = t_audio / target_duration

    # Interpolate envelope and GW frequency onto audio time grid
    A_audio = np.interp(t_frac_audio, t_frac, amplitude)
    f_gw_audio = np.interp(t_frac_audio, t_frac, freq_gw)

    # Map GW frequency to audible range [f_min, f_max]
    f_gw_min = np.min(f_gw_audio[f_gw_audio > 0]) if np.any(f_gw_audio > 0) else 1e-6
    f_gw_max = np.max(f_gw_audio)
    if f_gw_max > f_gw_min:
        f_audio = f_min_hz + (f_max_hz - f_min_hz) * (
            (f_gw_audio - f_gw_min) / (f_gw_max - f_gw_min)
        )
    else:
        f_audio = np.full_like(f_gw_audio, f_min_hz)

    # Integrate audio frequency to get audio phase
    dt = target_duration / n_samples
    phase_audio = np.cumsum(2 * np.pi * f_audio * dt)

    # Synthesize chirp: envelope × oscillation
    chirp = A_audio * np.sin(phase_audio)

    # Normalize to [-1, 1]
    max_amp = np.max(np.abs(chirp))
    if max_amp > 0:
        chirp /= max_amp

    return {
        "samples": chirp.tolist(),
        "sample_rate": sample_rate,
        "duration": target_duration,
    }
