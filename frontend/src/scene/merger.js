/**
 * Main 3D merger scene: black holes orbiting on a spacetime mesh
 * with star background.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStarField, updateStarField } from './stars.js';
import { createBlackHolePair, createRemnant } from './blackholes.js';
import { SpacetimeMesh } from './mesh.js';
import { LensingPass } from './lensing.js';

export class MergerScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.trajectoryData = null;
    this.waveformData = null;
    this.currentTimeIndex = 0;
    this.playing = false;
    // Real-time clock: simulation plays over this many seconds of wall time
    this.playbackDuration = 30.0;
    this._playStartWall = 0;
    this._playStartFraction = 0;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x050510, 1);

    // Scene
    this.scene = new THREE.Scene();

    // Camera — looking down at an angle onto the orbital plane
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(0, 15, 25);
    this.camera.lookAt(0, 0, 0);

    // Ambient light (subtle, for potential future materials)
    const ambient = new THREE.AmbientLight(0x334466, 0.5);
    this.scene.add(ambient);

    // Orbit controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 80;
    this.controls.maxPolarAngle = Math.PI * 0.85;

    this.blackHoles = null;
    this.remnantBH = null;
    this.spacetimeMesh = null;
    this.lensingPass = null;
    this.trailA = null;
    this.trailB = null;
    this._mergerFlashTime = -1;

    // Store current BH positions for external access (Doppler, lensing)
    this._bhPosA = new THREE.Vector3();
    this._bhPosB = new THREE.Vector3();

    this._onResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._handleResize();
  }

  async init() {
    // Star background
    await createStarField(this.scene);

    // Spacetime mesh
    this.spacetimeMesh = new SpacetimeMesh(this.scene);

    // Black holes (will be positioned once data loads)
    this.blackHoles = createBlackHolePair(this.scene, 0.5, 0.5);
    this.remnantBH = createRemnant(this.scene, 0.95);

    // Lensing post-process
    const rect = this.canvas.getBoundingClientRect();
    this.lensingPass = new LensingPass(this.renderer, rect.width, rect.height);
  }

  resetCamera() {
    this.camera.position.set(0, 15, 25);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  getBHPositions() {
    return { a: this._bhPosA, b: this._bhPosB };
  }

  setTrajectoryData(data) {
    this.trajectoryData = data;
    this.currentTimeIndex = 0;

    // Update BH masses from first frame
    if (data.body_A.mass && data.body_A.mass.length > 0) {
      this.blackHoles.bhA.mass = data.body_A.mass[0];
      this.blackHoles.bhB.mass = data.body_B.mass[0];
    }

    // Reset remnant visibility
    if (this.remnantBH) this.remnantBH.setVisible(false);
    this._mergerFlashTime = -1;

    // Create orbital trails
    this._initTrails(data);
  }

  _initTrails(data) {
    // Remove old trails
    if (this.trailA) { this.scene.remove(this.trailA); this.trailA.geometry.dispose(); }
    if (this.trailB) { this.scene.remove(this.trailB); this.trailB.geometry.dispose(); }

    const MESH_Y = -0.5; // mesh plane y-position
    const n = data.time.length;

    // Pre-build full trail positions (projected onto mesh plane)
    const posA = new Float32Array(n * 3);
    const posB = new Float32Array(n * 3);
    const colA = new Float32Array(n * 3);
    const colB = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      posA[i * 3]     = data.body_A.x[i];
      posA[i * 3 + 1] = MESH_Y + 0.05; // just above the mesh
      posA[i * 3 + 2] = data.body_A.y[i];

      posB[i * 3]     = data.body_B.x[i];
      posB[i * 3 + 1] = MESH_Y + 0.05;
      posB[i * 3 + 2] = data.body_B.y[i];

      // Start fully transparent — we'll reveal up to currentTimeIndex
      colA[i * 3] = 1; colA[i * 3 + 1] = 1; colA[i * 3 + 2] = 1;
      colB[i * 3] = 1; colB[i * 3 + 1] = 1; colB[i * 3 + 2] = 1;
    }

    const geomA = new THREE.BufferGeometry();
    geomA.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geomA.setAttribute('color', new THREE.BufferAttribute(colA, 3));

    const geomB = new THREE.BufferGeometry();
    geomB.setAttribute('position', new THREE.BufferAttribute(posB, 3));
    geomB.setAttribute('color', new THREE.BufferAttribute(colB, 3));

    const matA = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });
    const matB = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });

    this.trailA = new THREE.Line(geomA, matA);
    this.trailB = new THREE.Line(geomB, matB);

    // Initially hide (draw range = 0)
    geomA.setDrawRange(0, 0);
    geomB.setDrawRange(0, 0);

    this.scene.add(this.trailA);
    this.scene.add(this.trailB);
  }

  _updateTrails(idx) {
    if (!this.trailA || !this.trailB) return;

    const TRAIL_LENGTH = 300; // how many past points to show
    const start = Math.max(0, idx - TRAIL_LENGTH);
    const count = idx - start;

    // Update vertex colors: fade from transparent (old) to bright (current)
    const colA = this.trailA.geometry.attributes.color.array;
    const colB = this.trailB.geometry.attributes.color.array;

    for (let i = start; i < idx; i++) {
      const age = (i - start) / Math.max(count, 1); // 0 = oldest, 1 = newest
      const brightness = age * age; // quadratic fade-in
      colA[i * 3] = brightness;
      colA[i * 3 + 1] = brightness;
      colA[i * 3 + 2] = brightness;
      colB[i * 3] = brightness;
      colB[i * 3 + 1] = brightness;
      colB[i * 3 + 2] = brightness;
    }

    this.trailA.geometry.attributes.color.needsUpdate = true;
    this.trailB.geometry.attributes.color.needsUpdate = true;

    this.trailA.geometry.setDrawRange(start, count);
    this.trailB.geometry.setDrawRange(start, count);
  }

  setWaveformData(data) {
    this.waveformData = data;

    // Pre-compute cumulative phase by integrating frequency:
    // Φ(t) = ∫ 2πf(t') dt'
    if (data && data.frequency && data.time) {
      const n = data.time.length;
      data._cumulativePhase = new Float64Array(n);
      data._cumulativePhase[0] = 0;
      for (let i = 1; i < n; i++) {
        const dt = data.time[i] - data.time[i - 1];
        const fAvg = (data.frequency[i] + data.frequency[i - 1]) / 2;
        data._cumulativePhase[i] = data._cumulativePhase[i - 1] + 2 * Math.PI * fAvg * dt;
      }
    }
  }

  /**
   * Set the current time as a fraction [0, 1].
   */
  setTimeFraction(fraction) {
    if (!this.trajectoryData) return;
    const maxIdx = this.trajectoryData.time.length - 1;
    this.currentTimeIndex = Math.round(fraction * maxIdx);
  }

  getCurrentTime() {
    if (!this.trajectoryData) return 0;
    return this.trajectoryData.time[this.currentTimeIndex] || 0;
  }

  getTimeFraction() {
    if (!this.trajectoryData) return 0;
    return this.currentTimeIndex / (this.trajectoryData.time.length - 1);
  }

  setMeshVisible(visible) {
    if (this.spacetimeMesh) this.spacetimeMesh.setVisible(visible);
  }

  setTrailsVisible(visible) {
    if (this.trailA) this.trailA.visible = visible;
    if (this.trailB) this.trailB.visible = visible;
  }

  setLensingStrength(value) {
    if (this.lensingPass) {
      this.lensingPass.material.uniforms.uStrength.value = value;
    }
  }

  startPlaying() {
    this._playStartWall = performance.now() / 1000;
    this._playStartFraction = this.getTimeFraction();
  }

  /**
   * Advance time based on real wall-clock elapsed time.
   * Returns true if still playing, false if reached the end.
   */
  step() {
    if (!this.trajectoryData) return false;

    const now = performance.now() / 1000;
    const elapsed = now - this._playStartWall;
    const fraction = this._playStartFraction + elapsed / this.playbackDuration;

    if (fraction >= 1) {
      this.setTimeFraction(1);
      return false;
    }

    this.setTimeFraction(fraction);
    return true;
  }

  update() {
    if (!this.trajectoryData || !this.blackHoles) return;

    const idx = Math.min(
      this.currentTimeIndex,
      this.trajectoryData.time.length - 1
    );
    const data = this.trajectoryData;
    const currentTime = data.time[idx];
    const mergerTime = data.merger_time;
    const BH_LIFT = 0.8;

    // --- Determine merger state ---
    const TRANSITION_DURATION = 15; // M units — fast, dramatic merge
    const hasMerger = mergerTime != null && data.remnant != null;
    const isPostMerger = hasMerger && currentTime > mergerTime + TRANSITION_DURATION;
    const isTransitioning = hasMerger && currentTime >= mergerTime && !isPostMerger;
    const transitionFrac = isTransitioning
      ? Math.min((currentTime - mergerTime) / TRANSITION_DURATION, 1)
      : (isPostMerger ? 1 : 0);

    // --- Position bodies ---
    const ax = data.body_A.x[idx];
    const ay = (data.body_A.z[idx] || 0) + BH_LIFT;
    const az = data.body_A.y[idx];
    const bx = data.body_B.x[idx];
    const by = (data.body_B.z[idx] || 0) + BH_LIFT;
    const bz = data.body_B.y[idx];

    // --- Remnant position (from remnant trajectory data) ---
    let rx = (ax + bx) / 2, ry = (ay + by) / 2, rz = (az + bz) / 2;
    let rMass = 0.95;
    if (hasMerger && (isTransitioning || isPostMerger)) {
      const rem = data.remnant;
      // Find remnant index for current time
      let ri = 0;
      for (let k = 0; k < rem.time.length; k++) {
        if (rem.time[k] <= currentTime) ri = k;
        else break;
      }
      rx = rem.x[ri];
      ry = (rem.z ? rem.z[ri] || 0 : 0) + BH_LIFT;
      rz = rem.y[ri];
      rMass = rem.mass[ri];
    }

    if (isPostMerger) {
      // Fully merged — hide individual BHs, show remnant
      this.blackHoles.bhA.setVisible(false);
      this.blackHoles.bhB.setVisible(false);
      this.remnantBH.setVisible(true);
      this.remnantBH.setPosition(rx, ry, rz);

      // Ringdown flash: bright glow that fades over 50 M after transition ends
      const timeSinceMerged = currentTime - (mergerTime + TRANSITION_DURATION);
      const flashFade = Math.max(0, 1 - timeSinceMerged / 50);
      const flashScale = (rMass / 0.95) * (1 + flashFade * 0.5); // slight size pulse
      this.remnantBH.setScale(flashScale);
      this.remnantBH.setGlowIntensity(0.9 + flashFade * 0.8); // extra bright then settle

      this._bhPosA.set(rx, ry, rz);
      this._bhPosB.set(rx, ry, rz);
    } else if (isTransitioning) {
      // Transition: shrink individuals, grow remnant, interpolate positions
      const t = transitionFrac;
      const fadeOut = 1 - t;
      const fadeIn = t;

      // Individual BHs shrink and move toward remnant
      const mixAx = ax + (rx - ax) * t;
      const mixAy = ay + (ry - ay) * t;
      const mixAz = az + (rz - az) * t;
      const mixBx = bx + (rx - bx) * t;
      const mixBy = by + (ry - by) * t;
      const mixBz = bz + (rz - bz) * t;

      this.blackHoles.bhA.setVisible(true);
      this.blackHoles.bhB.setVisible(true);
      this.blackHoles.bhA.setPosition(mixAx, mixAy, mixAz);
      this.blackHoles.bhB.setPosition(mixBx, mixBy, mixBz);
      this.blackHoles.bhA.setScale(fadeOut);
      this.blackHoles.bhB.setScale(fadeOut);
      this.blackHoles.bhA.setGlowIntensity(0.9 * fadeOut);
      this.blackHoles.bhB.setGlowIntensity(0.9 * fadeOut);

      this.remnantBH.setVisible(true);
      this.remnantBH.setPosition(rx, ry, rz);
      this.remnantBH.setScale(fadeIn * rMass / 0.95);
      this.remnantBH.setGlowIntensity(0.9 * fadeIn);

      this._bhPosA.set(mixAx, mixAy, mixAz);
      this._bhPosB.set(mixBx, mixBy, mixBz);
    } else {
      // Pre-merger: normal inspiral
      this.blackHoles.bhA.setVisible(true);
      this.blackHoles.bhB.setVisible(true);
      this.blackHoles.bhA.setScale(1);
      this.blackHoles.bhB.setScale(1);
      this.blackHoles.bhA.setGlowIntensity(0.9);
      this.blackHoles.bhB.setGlowIntensity(0.9);
      this.remnantBH.setVisible(false);

      this.blackHoles.bhA.setPosition(ax, ay, az);
      this.blackHoles.bhB.setPosition(bx, by, bz);
      this._bhPosA.set(ax, ay, az);
      this._bhPosB.set(bx, by, bz);
    }

    // Billboard rings toward camera
    this.blackHoles.bhA.faceCamera(this.camera);
    this.blackHoles.bhB.faceCamera(this.camera);
    this.remnantBH.faceCamera(this.camera);

    // Update orbital trails
    this._updateTrails(idx);

    // Update lensing — use remnant position post-merger
    if (this.lensingPass) {
      if (isPostMerger) {
        this.lensingPass.updateBHPositions(
          this._bhPosA, this._bhPosB,
          rMass * 0.5, rMass * 0.5,
          this.camera
        );
      } else {
        this.lensingPass.updateBHPositions(
          this._bhPosA, this._bhPosB,
          data.body_A.mass[idx], data.body_B.mass[idx],
          this.camera
        );
      }
    }

    // Deform spacetime mesh
    if (this.spacetimeMesh && this.waveformData) {
      // Map trajectory time to waveform data (which may be non-uniformly sampled).
      // Use simulation time for lookup, not index fraction.
      const trajTime = data.time[idx];
      const wfTimes = this.waveformData.time;
      let wfIdx = 0;
      for (let k = 0; k < wfTimes.length; k++) {
        if (wfTimes[k] <= trajTime) wfIdx = k;
        else break;
      }

      const amplitude = this.waveformData.amplitude[wfIdx] || 0;
      const frequency = this.waveformData.frequency[wfIdx] || 0;
      const phase = this.waveformData._cumulativePhase
        ? this.waveformData._cumulativePhase[wfIdx]
        : 0;
      const simTime = this.waveformData.time[wfIdx] || 0;

      // The mesh geometry has rotation.x = -π/2, so geometry (gx, gy)
      // maps to scene (gx, -gy).  Body positions in the mesh's geometry
      // space therefore need negated y (scene z → geometry -y).
      this.spacetimeMesh.deform(
        [
          { x: ax, y: -az, mass: data.body_A.mass[idx] },
          { x: bx, y: -bz, mass: data.body_B.mass[idx] },
        ],
        amplitude,
        phase,
        frequency,
        simTime
      );
    }
  }

  render() {
    this.update();
    this.controls.update();
    updateStarField(1); // dt=1 frame

    if (this.lensingPass) {
      this.lensingPass.render(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _handleResize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    // Canvas fills remaining space; CSS flex handles sizing
    const rect = this.canvas.getBoundingClientRect();
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    if (this.lensingPass) {
      this.lensingPass.setSize(width, height);
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    if (this.lensingPass) this.lensingPass.dispose();
    this.renderer.dispose();
  }
}
