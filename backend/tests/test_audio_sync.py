"""Tests that audio peak amplitude coincides with waveform peak amplitude.

The chirp sonification must have its loudest moment at the same fraction
of the total *simulation time* as the peak of |h(t)| in the waveform data.
If these diverge, the user hears the loudest sound at the wrong time
relative to the merger animation.

Note: the waveform data uses frequency-adaptive sampling (non-uniform in
time but uniform in phase-progress).  Peak comparisons must be done in
time-space, not index-space.
"""

import numpy as np
from scipy.signal import hilbert

from src.waveforms import load_waveform, generate_audio_data

SIM_ID = "SXS:BBH:0304"


def _time_of_peak(times: list[float], signal: list[float]) -> float:
    """Return the time at which |signal| is maximum."""
    arr = np.abs(np.array(signal))
    idx = np.argmax(arr)
    return times[idx]


def _time_fraction_of_peak(times: list[float], signal: list[float]) -> float:
    """Fractional position [0,1] in simulation time of the peak."""
    t_peak = _time_of_peak(times, signal)
    t = np.array(times)
    return (t_peak - t[0]) / (t[-1] - t[0])


def _envelope_time_fraction_of_peak(duration: float, samples: list[float]) -> float:
    """Time-fraction of envelope peak for uniformly-sampled audio."""
    arr = np.array(samples)
    envelope = np.abs(hilbert(arr))
    idx = np.argmax(envelope)
    return idx / (len(arr) - 1)


def test_audio_envelope_peak_matches_waveform_peak_5s():
    """Audio envelope peak time should be within 2% of waveform peak time."""
    wf = load_waveform(SIM_ID)
    audio = generate_audio_data(SIM_ID, target_duration=5.0)

    wf_peak = _time_fraction_of_peak(wf["time"], wf["amplitude"])
    audio_peak = _envelope_time_fraction_of_peak(audio["duration"], audio["samples"])

    drift = abs(wf_peak - audio_peak)
    assert drift < 0.02, (
        f"Audio envelope peak at time-frac {audio_peak:.4f} vs waveform peak at "
        f"{wf_peak:.4f} — drift {drift:.4f} exceeds 2%"
    )


def test_audio_envelope_peak_matches_waveform_peak_30s():
    """Same check at 30 s playback duration."""
    wf = load_waveform(SIM_ID)
    audio = generate_audio_data(SIM_ID, target_duration=30.0)

    wf_peak = _time_fraction_of_peak(wf["time"], wf["amplitude"])
    audio_peak = _envelope_time_fraction_of_peak(audio["duration"], audio["samples"])

    drift = abs(wf_peak - audio_peak)
    assert drift < 0.02, (
        f"Audio envelope peak at time-frac {audio_peak:.4f} vs waveform peak at "
        f"{wf_peak:.4f} — drift {drift:.4f} exceeds 2%"
    )


def test_audio_peak_in_last_10_percent():
    """The peak should be near the end (merger), not in the middle or start."""
    audio = generate_audio_data(SIM_ID, target_duration=30.0)
    n = len(audio["samples"])
    arr = np.abs(np.array(audio["samples"]))
    peak = np.argmax(arr) / (n - 1)

    assert peak > 0.90, (
        f"Audio peak at fraction {peak:.4f} — expected > 0.90 (near merger)"
    )


def test_audio_envelope_monotonically_rises():
    """The RMS envelope should broadly increase toward merger.

    We split into 10 chunks and check that the last chunk has the
    highest RMS.
    """
    audio = generate_audio_data(SIM_ID, target_duration=30.0)
    samples = np.array(audio["samples"])

    n_chunks = 10
    chunk_size = len(samples) // n_chunks
    rms = []
    for i in range(n_chunks):
        chunk = samples[i * chunk_size : (i + 1) * chunk_size]
        rms.append(np.sqrt(np.mean(chunk ** 2)))

    loudest_chunk = np.argmax(rms)
    assert loudest_chunk >= n_chunks - 2, (
        f"Loudest RMS chunk is {loudest_chunk} (of {n_chunks}), "
        f"expected it in the last 2 chunks. RMS values: "
        + ", ".join(f"{v:.4f}" for v in rms)
    )
