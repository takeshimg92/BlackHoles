# Gravitational Wave Merger Visualizer

An interactive 3D visualization of binary black hole mergers and their gravitational wave emission, built with Three.js and powered by numerical relativity data from the [SXS catalog](https://data.black-holes.org).

## Quick Start

### Prerequisites

- **Python 3.12+** with [`uv`](https://docs.astral.sh/uv/)
- **Node.js 18+** with `npm`

### Running

Open two terminals:

```bash
# Terminal 1: Backend
cd backend
uv run uvicorn src.server:app --port 8000
```

```bash
# Terminal 2: Frontend
cd frontend
npm install   # first time only
npm run dev
```

Then open **http://localhost:5173**

### Important

After making changes to backend Python files, you must **restart the uvicorn server** for them to take effect. The frontend (Vite) hot-reloads automatically.

## Project Structure

```
GravitationalWaves/
├── backend/                  # Python (uv + FastAPI)
│   ├── pyproject.toml
│   ├── src/
│   │   ├── server.py         # FastAPI endpoints
│   │   ├── catalog.py        # SXS catalog browser
│   │   ├── waveforms.py      # Waveform loading + audio synthesis
│   │   ├── orbits.py         # Trajectory extraction
│   │   └── evolution.py      # Mass/energy evolution data
│   └── tests/
│       ├── test_audio_sync.py
│       └── test_evolution.py
├── frontend/                 # Vite + Three.js
│   ├── index.html
│   ├── public/bsc_stars.json # Yale Bright Star Catalog
│   └── src/
│       ├── main.js           # App entry point
│       ├── api.js            # Backend API client
│       ├── style.css         # Dark theme
│       ├── scene/
│       │   ├── merger.js     # 3D scene orchestrator
│       │   ├── blackholes.js # BH rendering (sprites)
│       │   ├── mesh.js       # Spacetime mesh deformation
│       │   ├── stars.js      # Star background
│       │   └── lensing.js    # Post-process lensing shader
│       ├── waveform/
│       │   ├── plot.js       # h(t) waveform strip
│       │   ├── evolution.js  # Mass/energy evolution strip
│       │   └── audio.js      # Chirp sonification + Doppler
│       ├── dashboard/
│       │   └── catalog.js    # Simulation browser
│       └── ui/
│           └── controls.js   # UI controls
├── assets/
│   ├── binary_image.png
│   ├── raw_waveform_BBH0304.png
│   └── arXiv-2505.13378v2/   # SXS catalog paper source
├── CLAUDE.md                 # Project requirements
└── CHANGELOG.md              # Detailed development log
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/catalog` | List simulations (filterable by mass ratio, eccentricity, orbits) |
| `GET /api/simulation/{id}` | Metadata for a single simulation |
| `GET /api/waveform/{id}` | Strain h(t) with frequency-adaptive sampling |
| `GET /api/trajectories/{id}` | Horizon positions + masses over time |
| `GET /api/audio/{id}` | Chirp audio buffer at specified duration |
| `GET /api/evolution/{id}` | Masses, separation, radiated energy over time |

## Running Tests

```bash
cd backend
uv run pytest tests/ -v
```

## Controls

| Control | Action |
|---------|--------|
| Left-drag | Orbit camera |
| Scroll | Zoom |
| Play button | Start/pause animation (resets from beginning if finished) |
| Time slider | Scrub through simulation |
| Mesh | Toggle spacetime grid |
| Trails | Toggle orbital path traces |
| Sound | Toggle chirp sonification |
| Lensing | Adjust gravitational lensing strength |
| Speed | Set playback duration (5s to 2min) |
| Reset View | Return camera to default position |

## Data

Simulations are from the SXS catalog (4,150+ BBH configurations). Data is downloaded and cached automatically via the `sxs` Python package on first use. The default simulation is **SXS:BBH:0304** (equal mass, quasi-circular, 27 orbits).
