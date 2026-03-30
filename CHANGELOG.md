# Changelog

## 2026-03-29 — Phase 2: Lensing, Camera Controls, Doppler, Evolution Plots

### OrbitControls (Interactive Camera)

Added Three.js `OrbitControls` for full mouse interaction:
- **Left-drag**: orbit around the binary
- **Scroll**: zoom in/out (range 5–80 units)
- **Right-drag**: pan
- Smooth damping (factor 0.08) for cinematic feel
- **Reset View** button in controls bar returns to default position (0, 15, 25)

Files: `merger.js` (import + setup), `index.html` (reset button), `controls.js`
(`setupCameraReset`), `main.js` (wiring), `style.css` (button styling)

### Gravitational Lensing (Post-Process Shader)

New file `frontend/src/scene/lensing.js` — `LensingPass` class implementing
screen-space gravitational lensing distortion:

- Renders the full scene to a `WebGLRenderTarget`
- Draws a fullscreen quad with a custom `ShaderMaterial`
- Fragment shader computes UV displacement near each BH's screen position
  using Einstein ring formula: `deflection ∝ M / (r² + softening)`
- Smooth `smoothstep` falloff prevents artifacts far from BHs
- Aspect-ratio corrected so distortion is circular, not elliptical
- BH world positions are projected to NDC each frame via camera matrices
- Render target resizes with the window

The lensing adapts automatically as the camera orbits — distortion follows
the BHs from any viewing angle.

Files: `lensing.js` (new), `merger.js` (render pipeline change: scene → RT → lensing
quad → screen), `blackholes.js` (`getPosition()` getter)

### Doppler Audio Modulation

Added real-time Doppler effect to the chirp sonification:

- `BiquadFilterNode` (peaking) in the audio chain shifts center frequency
  based on radial velocity of the binary COM relative to the camera
- Doppler factor: `1 / (1 − v_r / c_eff)` with `c_eff = 2.0` (tuned so
  orbital velocities produce audible but not extreme shifts)
- Proximity gain: closer BHs are louder (`gain ∝ 30 / distance`)
- Velocity computed as finite difference of COM position between frames
- Clamped to [0.5×, 2.0×] to prevent extreme artifacts

The effect is subtle during slow inspiral and becomes dramatic near merger
as orbital velocities increase.

Files: `audio.js` (filter chain, `updateDoppler()` method), `merger.js`
(`getBHPositions()` getter), `main.js` (per-frame Doppler update)

### Energy/Mass Evolution Plots

**Backend** — new endpoint `GET /api/evolution/{sim_id}`:
- Extracts Christodoulou masses of bodies A and B over time
- Computes cumulative radiated energy fraction: `E_rad/M = 1 − (M_A + M_B) / M_ADM`
- Extracts dimensionless spin magnitudes for both bodies
- Includes remnant (common horizon) mass and spin if available

New file: `backend/src/evolution.py`

**Frontend** — new `EvolutionPlot` class (`frontend/src/waveform/evolution.js`):
- 120px canvas strip below the waveform strip
- Three color-coded traces:
  - M_A (blue) and M_B (cyan) — Christodoulou masses
  - E_rad/M (orange) — cumulative radiated energy percentage (right axis)
- Progress overlay synced to animation time
- Legend and right-axis percentage labels

Files: `evolution.py` (new), `server.py` (new endpoint), `evolution.js` (new),
`api.js` (`fetchEvolution`), `index.html` (evolution strip), `style.css`
(evolution strip styling), `main.js` (instantiation, data loading, animation sync)

### All Tests Pass

- `backend/tests/test_audio_sync.py` — 4/4 pass
- `npx vite build` — clean build, no errors

---

## 2026-03-29 — Iteration 4: Waveform Fidelity, Wave Physics, Visual Fixes

### Waveform Sampling Rewrite

**Problem observed**: The UI showed the waveform appearing to "decelerate" before merger
— the oscillation frequency seemed to plateau instead of increasing monotonically.
The raw SXS data (plotted to `assets/raw_waveform_BBH0304.png`) confirmed the real
signal is correct: monotonic chirp.

**Root cause**: 4,000 uniform time samples over ~10,000 M gave dt ≈ 2.5 M.  Near merger
(GW period ~17 M), this yields only ~7 points per cycle.  While A(t) and φ(t) were
correctly interpolated and `h_real = A·cos(φ)` had the right frequency, the visual
rendering appeared choppy/stalled due to insufficient density.

**Fix — frequency-adaptive sampling**: `load_waveform()` now builds a non-uniform time
grid that guarantees ~20 samples per GW cycle everywhere.  The algorithm:

1. Compute `desired_dt(t) = 1 / (20 · f_GW(t))` at each raw data point
2. Build a cumulative "sample count" function by integrating `dt_raw / desired_dt`
3. Invert to get a time grid with points concentrated where frequency is high

This gives sparse sampling during the slow inspiral (where it's visually adequate)
and dense sampling near merger (where it's needed).  The waveform data is still
~4,000 points total but they're distributed optimally.

**Frontend waveform plot** now maps x-position to **time** (not index), so the
displayed waveform exactly matches the physical signal regardless of sampling density.
Progress cursor searches by time rather than by index-fraction.

### Black Hole Halo Artifact Fixed

**Problem**: A dark halo appeared behind whichever BH was moving away from the camera.
It shifted between BHs as their relative motion changed.

**Cause**: Ring geometries (photon ring, glow, halo) used `lookAt(camera.position)`,
which tilts the disc toward the camera.  When a BH is off-center, the ring tilts at
an angle, revealing its opaque edge as a dark silhouette against the background.

**Fix**: Replaced `lookAt()` with `quaternion.copy(camera.quaternion)`.  This keeps
rings perfectly parallel to the camera plane (true billboard), eliminating the edge
artifact regardless of BH position.

### Wave Deformation Physics Overhaul

**Problem 1 — Waves peaked at origin**: The `1/max(r,1)` decay was centered at the
coordinate origin.  Since the BHs orbit at r ≈ 5–9 M from origin, the strongest wave
displacement was near r = 1 (the clamp), not near the actual source.

**Fix**: Waves now emanate from the binary **center of mass** (computed each frame
from body positions).  The 1/r decay is measured from the COM, not from the origin.

**Problem 2 — Phantom counter-rotating partners**: The angular pattern `cos(2φ − Φ)`
has 2-fold symmetry: two maxima and two minima per revolution.  As Φ advances, this
creates 4 bright/dark patches that rotate through the mesh.  Two correspond to the
actual BH positions; the other two are "phantoms" 180° away.

**Fix**: Separated the angular pattern from the radial traveling wave:
- Angular: `cos(2(φ − θ_binary))` where `θ_binary = atan2(dy, dx)` is the actual
  binary axis angle from horizon positions, not the GW phase
- Radial: `sin(2πf·r/c − Φ)` — outgoing traveling wave

This ensures the angular pattern tracks the real body positions frame-by-frame,
eliminating phantom lobes.

**Near/wave zone transition**: Waves are smoothly suppressed inside `r < 3·separation`
via a sharper `smoothstep()` transition, so the near zone shows only the gravity
wells and the wave zone shows only the GW ripples, matching the SXS/Caltech
visualization structure.

### Diagnostic Output

Generated `assets/raw_waveform_BBH0304.png` — 4-panel plot showing:
1. Full raw h+(t) (22,429 points) with resampled overlay
2. Zoom on last 500 M (merger region)
3. Amplitude envelope with peak marker
4. GW frequency evolution

This confirms the raw data is correct and serves as a reference for future
waveform rendering verification.

### Tests Updated

All 4 tests in `test_audio_sync.py` updated to compare peaks in **time-space**
(not index-space), since waveform data now uses non-uniform time sampling.
All pass.

### Files Changed

- `backend/src/waveforms.py` — Frequency-adaptive sampling in `load_waveform()`
- `backend/tests/test_audio_sync.py` — Time-based peak comparison
- `frontend/src/waveform/plot.js` — Time-mapped x-axis; time-based progress cursor
- `frontend/src/scene/mesh.js` — COM-centered waves; binary-axis angular pattern;
  sharper near/wave zone transition; `smoothstep()` utility
- `frontend/src/scene/blackholes.js` — `faceCamera()` via quaternion copy (was `lookAt`)
- `frontend/src/scene/merger.js` — Time-based waveform lookup (was index-fraction);
  calls `faceCamera()` instead of `lookAt()`

---

## 2026-03-29 — Iteration 3: Audio Sync, Mesh Curvature Colors, Playback Fixes

### Critical Bug Fix: Non-uniform Time Sampling

**Root cause discovered and fixed**: SXS simulations use adaptive time-stepping — the
raw data has far more samples near merger than during inspiral.  The previous
`load_waveform()` used stride-based downsampling (`data[::stride]`), which preserved
the non-uniform sampling.  This caused **index-fraction ≠ time-fraction**: e.g. the
amplitude peak at index 20687/22429 = fraction 0.9224 actually occurs at time
`t = 9931.9 M`, which is time-fraction 0.9828.

Because the trajectory data was already uniformly resampled (in `orbits.py`), the
animation and waveform were synced by index-fraction, meaning the waveform peak
appeared at the wrong animation time.  Audio (which correctly used time-based
resampling) peaked 6% later than the waveform plot showed.

**Fix**: `load_waveform()` now interpolates all arrays (`h_real`, `h_imag`,
`amplitude`, `frequency`) onto a uniform time grid using `np.interp()` +
`np.linspace()`, matching the trajectory data's uniform sampling.

### Audio Sonification Rewrite

**Previous approach**: Directly resampled `h_real(t)` into a 5-second audio buffer,
then adjusted `playbackRate` on the frontend to match the playback duration.

**Problem**: At 30s playback, `playbackRate = 5/30 = 1/6`, shifting all frequencies
down 6×.  A 100 Hz chirp became ~17 Hz — below human hearing.  The inspiral was
inaudible; only the high-frequency ringdown was audible, making it sound like the
peak happened after the visual merger.

**New approach** (`generate_audio_data()`): Extracts the amplitude envelope `A(t)`
and GW frequency `f_GW(t)` from the (2,2) mode, then re-synthesizes an audible chirp:

```
audio(t) = A(t) · sin(∫ 2π f_audio(t') dt')
```

where `f_audio` maps the GW frequency linearly into [40 Hz, 800 Hz].  The audio
buffer is generated at the exact target duration (5s, 30s, 60s, etc.), so
`playbackRate = 1.0` always.  The envelope is guaranteed to peak at the same
time-fraction as the waveform amplitude.

The frontend now re-fetches audio from the server whenever the playback speed changes.

### Tests Added

New test file `backend/tests/test_audio_sync.py` with 4 tests:

1. **`test_audio_envelope_peak_matches_waveform_peak_5s`** — Hilbert-envelope peak of
   the 5s audio must be within 2% of waveform amplitude peak.  Catches the
   non-uniform sampling bug (previously failed at 6% drift).
2. **`test_audio_envelope_peak_matches_waveform_peak_30s`** — Same check at 30s.
3. **`test_audio_peak_in_last_10_percent`** — Audio peak must be in the last 10% of
   the buffer (sanity: peak is near merger, not at the start).
4. **`test_audio_envelope_monotonically_rises`** — The RMS envelope of 10 equal chunks
   must have its maximum in the last 2 chunks.

All 4 tests pass.

### Mesh Curvature Visualization

Added vertex colors to the solid mesh surface, inspired by the SXS/Caltech
visualization (https://en.wikipedia.org/wiki/File:Warped_Space_and_Time_Around_Colliding_Black_Holes_...):

- **Deep gravity wells** (large negative displacement) → yellow/amber (hot curvature)
- **Flat regions** (near zero displacement) → dark green (weak field)
- **Wave crests** (positive displacement) → blue/cyan
- **Wave troughs** (moderate negative) → teal/cyan-green

The solid mesh now uses `vertexColors: true` with `opacity: 0.55`, providing a
heatmap-like overlay while still showing the wireframe grid beneath at `opacity: 0.25`.

Colors are computed per-vertex each frame from the displacement values (curvature proxy),
with two passes: first compute all displacements and track min/max, then map to the
color palette.

### Files Changed

- `backend/src/waveforms.py` — Uniform time resampling in `load_waveform()`;
  envelope-based chirp synthesis in `generate_audio_data()`
- `backend/src/server.py` — Increased audio duration limit to 300s
- `backend/tests/test_audio_sync.py` — New: 4 tests for audio-waveform alignment
- `frontend/src/scene/mesh.js` — Vertex color attribute, `curvatureColor()` palette,
  two-pass deformation with color mapping
- `frontend/src/waveform/audio.js` — Simplified to `playbackRate = 1.0` (server
  generates at correct duration)
- `frontend/src/main.js` — Re-fetches audio on speed change; passes duration to
  `fetchAudio()`
- `frontend/src/api.js` — No change (already accepted duration param)

---

## 2026-03-29 — Iteration 2: Physics, UX & Visual Fixes

### Bug Fixes
- **Waveform canvas overflow**: Fixed DPR scaling bug where canvas drew at `width * devicePixelRatio` CSS pixels instead of `width`. Now uses `canvas.width / dpr` for drawing coordinates.
- **Audio sync**: Replaced frame-based stepping with wall-clock timer (`performance.now`). Audio `playbackRate` is adjusted to match the chosen simulation duration (e.g. 5s buffer at rate 1/6 for 30s playback). Audio re-syncs if drift exceeds 150ms.

### New Features
- **Playback speed control**: Dropdown in controls bar (5s / 15s / 30s / 60s / 2min). Default is 30s. Audio pitch scales naturally with speed.
- **Waveform strip**: Moved from separate tab to a 150px-tall strip below the 3D merger view, always visible during the simulation.

### Physics Improvements
- **Mesh deformation now uses linearized GR**: Vertical displacement follows the TT-gauge h+ polarization:
  `h+(r, φ, t) = (A / r) · cos(2φ − Φ(t_ret))`
  where `t_ret = t − r/c` is retarded time, `A` is the SXS (2,2) mode amplitude, and `Φ` is the cumulative GW phase (integrated from instantaneous frequency). This produces physically correct spiral arm patterns propagating outward at c.
- **Adaptive polar mesh**: Replaced uniform Cartesian grid with polar grid (60 radial × 96 angular vertices). Radial spacing is quadratic (`r ∝ t²`), concentrating ~half the rings within the inner 25% of radius where the BHs orbit.
- **Softened gravity wells**: Newtonian 1/(r+1) potential for the "rubber sheet" depression around each BH.

### Visual Improvements
- **Black holes**: Added bright photon ring edge (0.7 opacity), increased inner glow (0.35), stronger outer halo (0.12). Now clearly visible against the star background.
- **Mesh lines**: Brightened wireframe color to `#3355aa` at 0.35 opacity.

---

## 2026-03-29 — Phase 1: Project Scaffold & Data Pipeline

### Research
- Investigated SXS catalog (arXiv:2505.13378v2) — 4,150 BBH simulations available via `sxs` Python package
- Confirmed SXS:BBH:0001 is **deprecated**; selected **SXS:BBH:0304** as initial simulation:
  - Equal mass (q ≈ 1.0), spins ±0.5 along z-axis (χ_eff ≈ 0)
  - Near-zero eccentricity (6.5e-5), 27.4 orbits, quasi-circular
  - Full trajectory + waveform data verified (22,429 waveform points, 19,864 horizon points)
- Surveyed other NR catalogs (RIT: ~1,881 sims, MAYA: ~181, BAM: ~80); SXS chosen as primary for v1

### Backend (Python / uv)
- Initialized `uv` project in `backend/` with Python 3.12
- Dependencies: `sxs`, `fastapi`, `uvicorn`, `numpy`, `scipy`
- Implemented 4 backend modules:
  - `catalog.py` — SXS catalog browser with filtering (mass ratio, eccentricity, min orbits)
  - `waveforms.py` — Strain h(t) loader with downsampling + audio chirp generator
  - `orbits.py` — Horizon trajectory extractor (positions, masses, separation, remnant)
  - `server.py` — FastAPI server with CORS, endpoints: `/api/catalog`, `/api/simulation/{id}`, `/api/waveform/{id}`, `/api/trajectories/{id}`, `/api/audio/{id}`
- All endpoints tested and returning correct data

### Frontend (Vite + Three.js)
- Initialized Vite vanilla JS project in `frontend/`
- Dependencies: `three`
- Dark, Interstellar-inspired CSS theme with monospace typography
- Tab-based layout: Merger | Waveform | Dashboard
- Implemented modules:
  - `api.js` — API client for all backend endpoints
  - `scene/stars.js` — Yale BSC star background (ported from StarSimulator, B-V color mapping)
  - `scene/blackholes.js` — BH rendering with dark core + event horizon glow + photon sphere halo
  - `scene/mesh.js` — Spacetime mesh grid with quadrupolar wave deformation + curvature wells
  - `scene/merger.js` — Main 3D scene orchestrator (camera, animation, data binding)
  - `waveform/plot.js` — 2D Canvas h(t) plotter (gray full waveform + white progress overlay)
  - `waveform/audio.js` — Chirp sonification via Web Audio API
  - `dashboard/catalog.js` — Catalog browser with grid layout and selection
  - `ui/controls.js` — Tab switching, time slider, play/pause, mesh/sound toggles, info bar
  - `main.js` — App entry point wiring all modules together
- Star catalog (`bsc_stars.json`) copied to `frontend/public/`
- Build verified (production build succeeds)

### Project Structure
```
GravitationalWaves/
├── CLAUDE.md
├── CHANGELOG.md
├── assets/
│   ├── binary_image.png
│   └── arXiv-2505.13378v2/
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   └── src/
│       ├── catalog.py
│       ├── waveforms.py
│       ├── orbits.py
│       └── server.py
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── public/bsc_stars.json
    └── src/
        ├── main.js
        ├── style.css
        ├── api.js
        ├── scene/{merger,stars,blackholes,mesh}.js
        ├── waveform/{plot,audio}.js
        ├── dashboard/catalog.js
        └── ui/controls.js
```

### How to Run
```bash
# Terminal 1: Backend
cd backend && uv run uvicorn src.server:app --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev
```
Then open http://localhost:5173
