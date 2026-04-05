"""Test that client-side audio synthesis matches backend output.

The client-side approach uses the already-loaded waveform data
(amplitude + frequency arrays from load_waveform) to synthesize
the chirp, instead of going back to the raw SXS data. This test
verifies both approaches produce the same result.
"""

import numpy as np
from scipy.signal import hilbert

from src.waveforms import load_waveform, generate_audio_data
from src.orbits import load_trajectories

SIM_ID = "SXS:BBH:0304"


def synthesize_from_waveform_data(
    waveform: dict,
    trajectories: dict,
    sample_rate: int = 44100,
    target_duration: float = 30.0,
    f_min_hz: float = 40.0,
    f_max_hz: float = 800.0,
) -> np.ndarray:
    """Simulate the client-side audio synthesis.

    Uses only the data available in the waveform and trajectory
    JSON responses — no access to raw SXS data.
    """
    wf_time = np.array(waveform["time"])
    wf_amp = np.array(waveform["amplitude"])
    wf_freq = np.array(waveform["frequency"])

    traj_t_min = trajectories["time"][0]
    traj_t_max = trajectories["time"][-1]
    traj_span = traj_t_max - traj_t_min

    # Map waveform time to trajectory fraction [0, 1]
    wf_frac = np.clip((wf_time - traj_t_min) / traj_span, 0, 1)

    # Audio time grid
    n_samples = int(target_duration * sample_rate)
    t_frac_audio = np.linspace(0, 1, n_samples)

    # Interpolate amplitude and GW frequency onto audio grid
    A_audio = np.interp(t_frac_audio, wf_frac, wf_amp)
    f_gw_audio = np.interp(t_frac_audio, wf_frac, wf_freq)

    # Map GW frequency to audible range
    f_gw_pos = f_gw_audio[f_gw_audio > 0]
    f_gw_min = np.min(f_gw_pos) if len(f_gw_pos) > 0 else 1e-6
    f_gw_max = np.max(f_gw_audio)

    if f_gw_max > f_gw_min:
        f_audio = f_min_hz + (f_max_hz - f_min_hz) * (
            (f_gw_audio - f_gw_min) / (f_gw_max - f_gw_min)
        )
    else:
        f_audio = np.full_like(f_gw_audio, f_min_hz)

    # Integrate frequency to get phase
    dt = target_duration / n_samples
    phase_audio = np.cumsum(2 * np.pi * f_audio * dt)

    # Synthesize
    chirp = A_audio * np.sin(phase_audio)

    # Normalize
    max_amp = np.max(np.abs(chirp))
    if max_amp > 0:
        chirp /= max_amp

    return chirp


def test_envelope_peaks_match():
    """The envelope peak of client-side audio should match the backend's."""
    wf = load_waveform(SIM_ID)
    traj = load_trajectories(SIM_ID)
    backend = generate_audio_data(SIM_ID, target_duration=30.0)

    client = synthesize_from_waveform_data(wf, traj, target_duration=30.0)
    backend_samples = np.array(backend["samples"])

    # Compare envelope peaks
    env_client = np.abs(hilbert(client))
    env_backend = np.abs(hilbert(backend_samples))

    peak_client = np.argmax(env_client) / (len(client) - 1)
    peak_backend = np.argmax(env_backend) / (len(backend_samples) - 1)

    drift = abs(peak_client - peak_backend)
    assert drift < 0.02, (
        f"Envelope peak drift: client={peak_client:.4f}, "
        f"backend={peak_backend:.4f}, drift={drift:.4f}"
    )


def test_rms_profile_matches():
    """The RMS envelope (10 chunks) should match between client and backend."""
    wf = load_waveform(SIM_ID)
    traj = load_trajectories(SIM_ID)
    backend = generate_audio_data(SIM_ID, target_duration=30.0)

    client = synthesize_from_waveform_data(wf, traj, target_duration=30.0)
    backend_samples = np.array(backend["samples"])

    n_chunks = 10

    def chunk_rms(arr):
        chunk_size = len(arr) // n_chunks
        return [np.sqrt(np.mean(arr[i*chunk_size:(i+1)*chunk_size]**2))
                for i in range(n_chunks)]

    rms_client = chunk_rms(client)
    rms_backend = chunk_rms(backend_samples)

    # Normalize so we compare shape, not absolute scale
    rms_client = np.array(rms_client) / max(rms_client)
    rms_backend = np.array(rms_backend) / max(rms_backend)

    max_diff = np.max(np.abs(rms_client - rms_backend))
    assert max_diff < 0.15, (
        f"RMS profile mismatch: max chunk difference = {max_diff:.4f}\n"
        f"Client:  {[f'{v:.3f}' for v in rms_client]}\n"
        f"Backend: {[f'{v:.3f}' for v in rms_backend]}"
    )


def test_frequency_content_matches():
    """The dominant frequency at the peak should match."""
    wf = load_waveform(SIM_ID)
    traj = load_trajectories(SIM_ID)
    backend = generate_audio_data(SIM_ID, target_duration=30.0)

    client = synthesize_from_waveform_data(wf, traj, target_duration=30.0)
    backend_samples = np.array(backend["samples"])

    sample_rate = 44100

    # Extract a short window around the peak for each
    def peak_freq(arr):
        env = np.abs(hilbert(arr))
        peak = np.argmax(env)
        window = 2048
        start = max(0, peak - window)
        end = min(len(arr), peak + window)
        segment = arr[start:end]
        fft = np.fft.rfft(segment * np.hanning(len(segment)))
        freqs = np.fft.rfftfreq(len(segment), 1 / sample_rate)
        return freqs[np.argmax(np.abs(fft[1:])) + 1]

    freq_client = peak_freq(client)
    freq_backend = peak_freq(backend_samples)

    ratio = freq_client / freq_backend
    assert 0.8 < ratio < 1.2, (
        f"Peak frequency mismatch: client={freq_client:.1f} Hz, "
        f"backend={freq_backend:.1f} Hz, ratio={ratio:.3f}"
    )


def test_multiple_simulations():
    """Client-side synthesis should work for different simulations."""
    for sim_id in ["SXS:BBH:0304", "SXS:BBH:0106"]:
        wf = load_waveform(sim_id)
        traj = load_trajectories(sim_id)

        client = synthesize_from_waveform_data(wf, traj, target_duration=30.0)

        # Basic sanity: not silent, peak near the end
        assert np.max(np.abs(client)) > 0.99, f"{sim_id}: audio not normalized"
        env = np.abs(hilbert(client))
        peak_frac = np.argmax(env) / (len(client) - 1)
        assert peak_frac > 0.8, f"{sim_id}: peak at {peak_frac:.3f}, expected > 0.8"
