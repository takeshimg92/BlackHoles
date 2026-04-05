import './style.css';
import { fetchCatalog, fetchSimulation, fetchWaveform, fetchTrajectories, fetchEvolution } from './api.js';
import { setupTabs, setupTimeSlider, setupPlayButton, setupMeshToggle, setupSoundToggle, setupTrailToggle, setupCarousel, setupMeshBrightness, setupMeshResolution, setupMeshColor, setupSpinAxisToggle, setupLensingSlider, setupSpeedControl, setupCameraReset, updateInfoBar } from './ui/controls.js';
import { MergerScene } from './scene/merger.js';
import { WaveformPlot } from './waveform/plot.js';
import { ChirpAudio } from './waveform/audio.js';
import { EvolutionPlot } from './waveform/evolution.js';
import { CatalogBrowser } from './dashboard/catalog.js';

const DEFAULT_SIM = 'SXS:BBH:0304';

// State
let mergerScene = null;
let waveformPlot = null;
let evolutionPlot = null;
let chirpAudio = null;
let catalogBrowser = null;
let animationId = null;
let playing = false;
let currentPlaybackDuration = 30;

function showLoading(simId) {
  const overlay = document.getElementById('loading-overlay');
  overlay.querySelector('.loading-text').textContent = `Loading ${simId}...`;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function updateLoadingStep(step) {
  const overlay = document.getElementById('loading-overlay');
  overlay.querySelector('.loading-text').textContent = step;
}

async function loadSimulation(simId) {
  showLoading(simId);

  try {
    // Load sequentially so (a) the cache serves subsequent sxs.load()
    // calls instantly instead of 5 parallel downloads, and (b) the
    // user sees progress at each step.
    updateLoadingStep(`Loading metadata...`);
    const metadata = await fetchSimulation(simId);

    updateLoadingStep(`Downloading trajectories...`);
    const trajectories = await fetchTrajectories(simId);

    updateLoadingStep(`Processing waveform...`);
    const waveform = await fetchWaveform(simId);

    updateLoadingStep(`Computing evolution...`);
    const evolution = await fetchEvolution(simId);

    updateLoadingStep(`Initializing...`);

    // Update UI
    updateInfoBar(metadata);

    // Update merger scene
    mergerScene.setTrajectoryData(trajectories);
    mergerScene.setWaveformData(waveform);

    // Update waveform plot
    waveformPlot.setData(waveform);

    // Synthesize audio client-side (no backend needed)
    chirpAudio.synthesize(waveform, trajectories, currentPlaybackDuration);

    // Update evolution plot
    evolutionPlot.setData(evolution);

    // Stop any ongoing playback and reset to beginning
    playing = false;
    playButton.setPlaying(false);
    chirpAudio.stop();
    mergerScene.setTimeFraction(0);
    waveformPlot.setFraction(0);
    evolutionPlot.setFraction(0);
    timeSlider.setValue(0, trajectories.time[0]);

    // Update catalog selection
    catalogBrowser.setSelected(simId);

    // Switch to merger tab
    document.querySelector('.tab[data-tab="merger"]').click();
    mergerScene._handleResize();
    waveformPlot._handleResize();
    evolutionPlot._handleResize();

    console.log(`Loaded simulation: ${simId}`);
  } catch (err) {
    console.error(`Failed to load simulation ${simId}:`, err);
    document.getElementById('sim-title').textContent = `Error loading ${simId}`;
    // Show error in loading overlay briefly before hiding
    const overlay = document.getElementById('loading-overlay');
    overlay.querySelector('.loading-text').textContent = `Error: ${err.message}`;
    overlay.querySelector('.loading-spinner').style.borderTopColor = '#ff4444';
    await new Promise(r => setTimeout(r, 2000));
    overlay.querySelector('.loading-spinner').style.borderTopColor = '';
  } finally {
    hideLoading();
  }
}

// Animation loop
function animate() {
  animationId = requestAnimationFrame(animate);

  if (playing && mergerScene.trajectoryData) {
    const stillGoing = mergerScene.step();
    const fraction = mergerScene.getTimeFraction();
    const time = mergerScene.getCurrentTime();
    timeSlider.setValue(fraction, time);
    waveformPlot.setFraction(fraction);
    waveformPlot.setCurrentTime(time);
    evolutionPlot.setFraction(fraction);
    evolutionPlot.setCurrentTime(time);
    chirpAudio.syncToFraction(fraction);

    if (!stillGoing) {
      playing = false;
      playButton.setPlaying(false);
      chirpAudio.stop();
    }
  }

  mergerScene.render();
  waveformPlot.render();
  evolutionPlot.render();
}

// Setup
let timeSlider;
let playButton;

async function init() {
  // Initialize 3D scene
  const mergerCanvas = document.getElementById('merger-canvas');
  mergerScene = new MergerScene(mergerCanvas);
  await mergerScene.init();

  // Initialize waveform plot
  const waveformCanvas = document.getElementById('waveform-canvas');
  waveformPlot = new WaveformPlot(waveformCanvas);

  // Initialize evolution plot
  const evolutionCanvas = document.getElementById('evolution-canvas');
  evolutionPlot = new EvolutionPlot(evolutionCanvas);

  // Initialize audio
  chirpAudio = new ChirpAudio();

  // Initialize catalog browser
  catalogBrowser = new CatalogBrowser(
    document.getElementById('catalog-list'),
    (simId) => loadSimulation(simId)
  );

  // Setup UI controls
  setupTabs((tab) => {
    if (tab === 'merger') {
      mergerScene._handleResize();
      waveformPlot._handleResize();
    }
  });

  let wasPlayingBeforeDrag = false;

  timeSlider = setupTimeSlider(
    // onTimeChange — called continuously while dragging
    (fraction) => {
      mergerScene.setTimeFraction(fraction);
      const time = mergerScene.getCurrentTime();
      waveformPlot.setFraction(fraction);
      waveformPlot.setCurrentTime(time);
      evolutionPlot.setFraction(fraction);
      evolutionPlot.setCurrentTime(time);
      timeSlider.setValue(fraction, time);
    },
    // onDragStart — pause playback so it doesn't fight the user
    () => {
      wasPlayingBeforeDrag = playing;
      playing = false;
      chirpAudio.stop();
    },
    // onDragEnd — resume if it was playing before
    (fraction) => {
      if (wasPlayingBeforeDrag) {
        playing = true;
        mergerScene.startPlaying();
        chirpAudio.play(fraction);
        playButton.setPlaying(true);
      }
    }
  );

  playButton = setupPlayButton((isPlaying) => {
    playing = isPlaying;
    if (isPlaying) {
      // If at the end, reset to beginning
      if (mergerScene.getTimeFraction() >= 0.999) {
        mergerScene.setTimeFraction(0);
        waveformPlot.setFraction(0);
        evolutionPlot.setFraction(0);
        timeSlider.setValue(0, mergerScene.trajectoryData.time[0]);
      }
      mergerScene.startPlaying();
      chirpAudio.play(mergerScene.getTimeFraction());
    } else {
      chirpAudio.stop();
    }
  });

  setupMeshToggle((visible) => {
    mergerScene.setMeshVisible(visible);
  });

  chirpAudio.setEnabled(true); // sound on by default
  setupSoundToggle((enabled) => {
    chirpAudio.setEnabled(enabled);
    if (enabled && playing) {
      chirpAudio.play(mergerScene.getTimeFraction());
    }
  });

  setupTrailToggle((visible) => {
    mergerScene.setTrailsVisible(visible);
  });

  setupCarousel((slide) => {
    // Trigger resize on the newly visible canvas
    if (slide === 'waveform') waveformPlot._handleResize();
    if (slide === 'evolution') evolutionPlot._handleResize();
  });

  setupMeshBrightness((value) => {
    mergerScene.setMeshBrightness(value);
  });

  setupMeshResolution((segs) => {
    mergerScene.setMeshResolution(segs);
  });

  setupMeshColor((hue) => {
    mergerScene.setMeshColorHue(hue);
  });

  setupSpinAxisToggle((visible) => {
    mergerScene.setSpinAxesVisible(visible);
  });

  setupLensingSlider((value) => {
    mergerScene.setLensingStrength(value);
  });

  setupCameraReset(() => {
    mergerScene.resetCamera();
  });

  setupSpeedControl((seconds) => {
    currentPlaybackDuration = seconds;
    mergerScene.playbackDuration = seconds;
    // Re-synthesize audio at the new duration (instant, no backend)
    if (mergerScene.waveformData && mergerScene.trajectoryData) {
      chirpAudio.synthesize(mergerScene.waveformData, mergerScene.trajectoryData, seconds);
    }
  });

  // Start animation loop
  animate();

  // Load default simulation first (preloaded data — no backend needed)
  await loadSimulation(DEFAULT_SIM);

  // Load catalog from static JSON
  fetchCatalog()
    .then(catalog => catalogBrowser.render(catalog))
    .catch(err => console.error('Failed to load catalog:', err));
}

init().catch(err => {
  console.error('Init failed:', err);
  document.getElementById('sim-title').textContent = `Init error: ${err.message}`;
});
