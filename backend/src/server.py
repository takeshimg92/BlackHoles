"""FastAPI server exposing SXS simulation data to the frontend."""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .catalog import list_simulations, get_simulation_metadata
from .waveforms import load_waveform, generate_audio_data
from .orbits import load_trajectories
from .evolution import load_evolution_data

app = FastAPI(title="Gravitational Waves API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/catalog")
def catalog(
    max_results: int = Query(50, ge=1, le=200),
    min_orbits: float = Query(5.0, ge=0),
    max_eccentricity: float | None = Query(None, ge=0),
    q_min: float | None = Query(None, ge=0),
    q_max: float | None = Query(None, ge=0),
):
    mass_ratio_range = None
    if q_min is not None and q_max is not None:
        mass_ratio_range = (q_min, q_max)
    return list_simulations(
        max_results=max_results,
        min_orbits=min_orbits,
        max_eccentricity=max_eccentricity,
        mass_ratio_range=mass_ratio_range,
    )


@app.get("/api/simulation/{sim_id:path}")
def simulation(sim_id: str):
    try:
        return get_simulation_metadata(sim_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/waveform/{sim_id:path}")
def waveform(
    sim_id: str,
    l: int = Query(2, ge=2, le=8),
    m: int = Query(2, ge=-8, le=8),
    max_points: int = Query(4000, ge=100, le=20000),
):
    try:
        return load_waveform(sim_id, mode=(l, m), max_points=max_points)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/trajectories/{sim_id:path}")
def trajectories(
    sim_id: str,
    max_points: int = Query(6000, ge=100, le=20000),
):
    try:
        return load_trajectories(sim_id, max_points=max_points)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio/{sim_id:path}")
def audio(
    sim_id: str,
    l: int = Query(2, ge=2, le=8),
    m: int = Query(2, ge=-8, le=8),
    duration: float = Query(30.0, ge=1.0, le=300.0),
):
    try:
        return generate_audio_data(sim_id, mode=(l, m), target_duration=duration)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evolution/{sim_id:path}")
def evolution(sim_id: str):
    try:
        return load_evolution_data(sim_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
