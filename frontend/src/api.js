/**
 * API client for the Gravitational Waves app.
 *
 * Static-first: all data is loaded from pre-generated JSON files
 * in /preloaded/. No backend server required.
 *
 * SessionStorage caching avoids re-parsing large JSON on navigation.
 */

const CACHE_PREFIX = 'gw_cache_';

function simToPath(simId) {
  return simId.replace(/:/g, '_');
}

async function cachedFetch(cacheKey, fetchFn) {
  try {
    const cached = sessionStorage.getItem(CACHE_PREFIX + cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* storage full or unavailable */ }

  const data = await fetchFn();

  try {
    sessionStorage.setItem(CACHE_PREFIX + cacheKey, JSON.stringify(data));
  } catch { /* quota exceeded */ }

  return data;
}

async function fetchStatic(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error(`Expected JSON at ${path}, got ${ct}`);
  return res.json();
}

export async function fetchCatalog() {
  return fetchStatic('/preloaded/catalog.json');
}

export async function fetchSimulation(simId) {
  return cachedFetch(`sim_${simId}`, () =>
    fetchStatic(`/preloaded/${simToPath(simId)}/metadata.json`)
  );
}

export async function fetchWaveform(simId) {
  return cachedFetch(`wf_${simId}`, () =>
    fetchStatic(`/preloaded/${simToPath(simId)}/waveform.json`)
  );
}

export async function fetchTrajectories(simId) {
  return cachedFetch(`traj_${simId}`, () =>
    fetchStatic(`/preloaded/${simToPath(simId)}/trajectories.json`)
  );
}

export async function fetchEvolution(simId) {
  return cachedFetch(`evo_${simId}`, () =>
    fetchStatic(`/preloaded/${simToPath(simId)}/evolution.json`)
  );
}
