/**
 * API client for the Gravitational Waves backend.
 *
 * Two caching layers:
 * 1. Pre-bundled JSON in /preloaded/ for the default simulation (instant)
 * 2. sessionStorage cache for any simulation loaded during the session
 */

const API_BASE = 'http://localhost:8000';
const PRELOADED_SIM = 'SXS:BBH:0304';
const CACHE_PREFIX = 'gw_cache_';

function simToPath(simId) {
  return simId.replace(/:/g, '_');
}

async function cachedFetch(cacheKey, fetchFn) {
  // Check sessionStorage first
  try {
    const cached = sessionStorage.getItem(CACHE_PREFIX + cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* storage full or unavailable */ }

  const data = await fetchFn();

  // Cache in sessionStorage (best-effort; audio may be too large)
  try {
    sessionStorage.setItem(CACHE_PREFIX + cacheKey, JSON.stringify(data));
  } catch { /* quota exceeded — skip caching */ }

  return data;
}

async function fetchPreloaded(simId, endpoint) {
  const path = `/preloaded/${simToPath(simId)}/${endpoint}.json`;
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    // Guard against Vite SPA fallback returning index.html as 200
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchFromAPI(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

export async function fetchCatalog(params = {}) {
  const query = new URLSearchParams();
  if (params.maxResults) query.set('max_results', params.maxResults);
  if (params.minOrbits) query.set('min_orbits', params.minOrbits);
  return fetchFromAPI(`${API_BASE}/api/catalog?${query}`);
}

export async function fetchSimulation(simId) {
  return cachedFetch(`sim_${simId}`, async () => {
    // Try preloaded first
    const pre = await fetchPreloaded(simId, 'metadata');
    if (pre) return pre;
    return fetchFromAPI(`${API_BASE}/api/simulation/${simId}`);
  });
}

export async function fetchWaveform(simId, l = 2, m = 2) {
  return cachedFetch(`wf_${simId}_${l}_${m}`, async () => {
    const pre = await fetchPreloaded(simId, 'waveform');
    if (pre) return pre;
    return fetchFromAPI(`${API_BASE}/api/waveform/${simId}?l=${l}&m=${m}`);
  });
}

export async function fetchTrajectories(simId) {
  return cachedFetch(`traj_${simId}`, async () => {
    const pre = await fetchPreloaded(simId, 'trajectories');
    if (pre) return pre;
    return fetchFromAPI(`${API_BASE}/api/trajectories/${simId}`);
  });
}

export async function fetchEvolution(simId) {
  return cachedFetch(`evo_${simId}`, async () => {
    const pre = await fetchPreloaded(simId, 'evolution');
    if (pre) return pre;
    return fetchFromAPI(`${API_BASE}/api/evolution/${simId}`);
  });
}

export async function fetchAudio(simId, l = 2, m = 2, duration = 5.0) {
  // Audio is duration-dependent so cache key includes duration
  return cachedFetch(`audio_${simId}_${l}_${m}_${duration}`, async () => {
    const pre = await fetchPreloaded(simId, 'audio');
    if (pre) return pre;
    return fetchFromAPI(`${API_BASE}/api/audio/${simId}?l=${l}&m=${m}&duration=${duration}`);
  });
}
