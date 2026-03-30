/**
 * Black hole rendering with glow effects.
 *
 * Each BH is a dark sphere with sprite-based glow halos.
 * Sprites always face the camera automatically (no billboard
 * quaternion hacks needed), eliminating the dark-halo artifact
 * that occurred with RingGeometry + lookAt/quaternion.copy.
 */

import * as THREE from 'three';

/**
 * Create a radial gradient texture for the glow sprite.
 */
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const half = size / 2;

  // Photon ring: bright narrow ring
  const ring = ctx.createRadialGradient(half, half, half * 0.28, half, half, half * 0.45);
  ring.addColorStop(0, 'rgba(100, 150, 255, 0)');
  ring.addColorStop(0.4, 'rgba(100, 150, 255, 0.8)');
  ring.addColorStop(0.55, 'rgba(100, 150, 255, 0.9)');
  ring.addColorStop(0.7, 'rgba(80, 130, 220, 0.4)');
  ring.addColorStop(1.0, 'rgba(50, 80, 170, 0)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, size, size);

  // Outer halo
  const halo = ctx.createRadialGradient(half, half, half * 0.4, half, half, half);
  halo.addColorStop(0, 'rgba(50, 80, 170, 0)');
  halo.addColorStop(0.3, 'rgba(50, 80, 170, 0.08)');
  halo.addColorStop(0.7, 'rgba(40, 60, 140, 0.04)');
  halo.addColorStop(1.0, 'rgba(30, 40, 100, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

let _sharedGlowTexture = null;
function getGlowTexture() {
  if (!_sharedGlowTexture) _sharedGlowTexture = createGlowTexture();
  return _sharedGlowTexture;
}

export class BlackHole {
  constructor(scene, mass = 0.5) {
    this.mass = mass;
    const radius = mass * 0.6;

    // Pure black opaque core — blocks the background to look like a dark object.
    // Must render before the additive glow sprite so it occludes properly.
    const coreRadius = radius * 0.45;
    const geometry = new THREE.SphereGeometry(coreRadius, 24, 24);
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    scene.add(this.mesh);

    // Glow sprite — always faces camera
    const glowMaterial = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Sprite(glowMaterial);
    this.glow.scale.set(radius * 5, radius * 5, 1);
    this.mesh.add(this.glow);
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  setScale(s) {
    this.mesh.scale.setScalar(s);
  }

  setVisible(v) {
    this.mesh.visible = v;
  }

  setGlowIntensity(opacity) {
    this.glow.material.opacity = opacity;
  }

  faceCamera() {
    // Sprites face camera automatically — nothing to do
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.glow.material.dispose();
  }
}

export function createBlackHolePair(scene, mass1 = 0.5, mass2 = 0.5) {
  const bhA = new BlackHole(scene, mass1);
  const bhB = new BlackHole(scene, mass2);
  return { bhA, bhB };
}

export function createRemnant(scene, mass = 0.95) {
  const bh = new BlackHole(scene, mass);
  bh.setVisible(false);
  return bh;
}
