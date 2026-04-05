/**
 * Black hole rendering:
 * - Opaque black 3D sphere in the main scene (occluded by lensing)
 * - White halo sprite in a separate overlay scene (rendered AFTER lensing)
 */

import * as THREE from 'three';

function createHaloTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  // Tight white glow ring
  const ring = ctx.createRadialGradient(half, half, half * 0.35, half, half, half * 0.75);
  ring.addColorStop(0, 'rgba(255, 255, 255, 0)');
  ring.addColorStop(0.25, 'rgba(200, 220, 255, 0.2)');
  ring.addColorStop(0.45, 'rgba(230, 240, 255, 0.8)');
  ring.addColorStop(0.55, 'rgba(220, 235, 255, 0.6)');
  ring.addColorStop(0.7, 'rgba(180, 210, 250, 0.2)');
  ring.addColorStop(1.0, 'rgba(100, 140, 200, 0)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

let _sharedHalo = null;
function getHaloTexture() {
  if (!_sharedHalo) _sharedHalo = createHaloTexture();
  return _sharedHalo;
}

export class BlackHole {
  /**
   * @param {THREE.Scene} scene - main scene (for the opaque sphere)
   * @param {THREE.Scene} overlayScene - overlay scene (for the halo, rendered post-lensing)
   */
  constructor(scene, overlayScene, mass = 0.5) {
    this.mass = mass;
    const radius = mass * 0.6;

    // Container in main scene
    this.mesh = new THREE.Object3D();
    scene.add(this.mesh);

    // Opaque black sphere
    const sphereGeom = new THREE.SphereGeometry(radius, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this._sphere = new THREE.Mesh(sphereGeom, sphereMat);
    this.mesh.add(this._sphere);

    // Halo sprite in overlay scene (not affected by lensing)
    const haloMat = new THREE.SpriteMaterial({
      map: getHaloTexture(),
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._halo = new THREE.Sprite(haloMat);
    this._halo.scale.set(radius * 4.5, radius * 4.5, 1);
    this._haloMat = haloMat;

    if (overlayScene) {
      overlayScene.add(this._halo);
    }
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    this._halo.position.set(x, y, z);
  }

  setScale(s) {
    this.mesh.scale.setScalar(s);
    this._halo.scale.setScalar(s * this.mass * 0.6 * 4.5);
  }

  setVisible(v) {
    this.mesh.visible = v;
    this._halo.visible = v;
  }

  setGlowIntensity(opacity) {
    this._haloMat.opacity = opacity;
  }

  faceCamera() {
    // Sprites face camera automatically
  }

  dispose() {
    this._sphere.geometry.dispose();
    this._sphere.material.dispose();
    this._haloMat.dispose();
  }
}

export function createBlackHolePair(scene, overlayScene, mass1 = 0.5, mass2 = 0.5) {
  const bhA = new BlackHole(scene, overlayScene, mass1);
  const bhB = new BlackHole(scene, overlayScene, mass2);
  return { bhA, bhB };
}

export function createRemnant(scene, overlayScene, mass = 0.95) {
  const bh = new BlackHole(scene, overlayScene, mass);
  bh.setVisible(false);
  return bh;
}
