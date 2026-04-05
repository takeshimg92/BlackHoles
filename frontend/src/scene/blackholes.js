/**
 * Black hole rendering with a single sprite combining dark core + glow.
 * Uses NormalBlending so the opaque black center actually occludes
 * the background. No depth-sorting artifacts.
 */

import * as THREE from 'three';

/**
 * Single combined texture: opaque black core → photon ring → soft halo → transparent.
 * All in one sprite, one draw call, no depth issues.
 */
function createBHTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  // 1. Outer halo (faint blue glow)
  const halo = ctx.createRadialGradient(half, half, half * 0.35, half, half, half);
  halo.addColorStop(0, 'rgba(40, 70, 160, 0)');
  halo.addColorStop(0.4, 'rgba(40, 70, 160, 0.06)');
  halo.addColorStop(0.7, 'rgba(30, 50, 120, 0.03)');
  halo.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // 2. Photon ring (bright blue-white ring)
  const ring = ctx.createRadialGradient(half, half, half * 0.12, half, half, half * 0.4);
  ring.addColorStop(0, 'rgba(60, 100, 200, 0)');
  ring.addColorStop(0.35, 'rgba(100, 160, 255, 0.4)');
  ring.addColorStop(0.5, 'rgba(140, 180, 255, 0.9)');
  ring.addColorStop(0.65, 'rgba(120, 160, 255, 0.7)');
  ring.addColorStop(0.8, 'rgba(80, 120, 220, 0.3)');
  ring.addColorStop(1.0, 'rgba(40, 70, 160, 0)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, size, size);

  // 3. Opaque black core (event horizon)
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.beginPath();
  ctx.arc(half, half, half * 0.13, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

let _sharedTexture = null;
function getBHTexture() {
  if (!_sharedTexture) _sharedTexture = createBHTexture();
  return _sharedTexture;
}

export class BlackHole {
  constructor(scene, mass = 0.5) {
    this.mass = mass;
    const radius = mass * 0.6;

    // Single sprite with combined core + ring + halo texture
    this.mesh = new THREE.Object3D();
    scene.add(this.mesh);

    const material = new THREE.SpriteMaterial({
      map: getBHTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(radius * 6, radius * 6, 1);
    this.mesh.add(this.sprite);

    // Keep a reference for glow intensity changes
    this._material = material;
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
    this._material.opacity = opacity;
  }

  faceCamera() {
    // Sprites face camera automatically
  }

  dispose() {
    this._material.dispose();
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
