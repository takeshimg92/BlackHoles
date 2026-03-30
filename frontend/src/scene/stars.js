/**
 * Star background from the Yale Bright Star Catalog.
 * Ported from the StarSimulator project.
 * Stars rotate slowly for a dynamic feel.
 */

import * as THREE from 'three';

const STAR_RADIUS = 400;
const MAG_DIM = 8.0;

function bvToRGB(bv) {
  let r, g, b;

  if (bv < -0.4) bv = -0.4;
  if (bv > 2.0) bv = 2.0;

  if (bv < 0.0) {
    const t = (bv + 0.4) / 0.4;
    r = 0.61 + 0.39 * t;
    g = 0.70 + 0.30 * t;
    b = 1.0;
  } else if (bv < 0.4) {
    const t = bv / 0.4;
    r = 1.0;
    g = 1.0 - 0.1 * t;
    b = 1.0 - 0.4 * t;
  } else if (bv < 0.8) {
    const t = (bv - 0.4) / 0.4;
    r = 1.0;
    g = 0.9 - 0.2 * t;
    b = 0.6 - 0.3 * t;
  } else if (bv < 1.2) {
    const t = (bv - 0.8) / 0.4;
    r = 1.0;
    g = 0.7 - 0.2 * t;
    b = 0.3 - 0.15 * t;
  } else {
    const t = Math.min((bv - 1.2) / 0.8, 1.0);
    r = 1.0 - 0.2 * t;
    g = 0.5 - 0.2 * t;
    b = 0.15 - 0.1 * t;
  }

  return [r, g, b];
}

let _starPoints = null;

export async function createStarField(scene) {
  let starData;

  try {
    const res = await fetch('/bsc_stars.json');
    starData = await res.json();
  } catch {
    starData = Array.from({ length: 4000 }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      return [
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
        3 + Math.random() * 4,
        Math.random() * 1.5,
      ];
    });
  }

  const positions = new Float32Array(starData.length * 3);
  const colors = new Float32Array(starData.length * 3);

  for (let i = 0; i < starData.length; i++) {
    const [x, y, z, mag, bv] = starData[i];
    // Brighter overall — increase the brightness scaling
    const brightness = Math.pow(10, -0.14 * (mag - MAG_DIM));

    positions[i * 3] = x * STAR_RADIUS;
    positions[i * 3 + 1] = y * STAR_RADIUS;
    positions[i * 3 + 2] = z * STAR_RADIUS;

    const [r, g, b] = bvToRGB(bv);
    colors[i * 3] = r * brightness;
    colors[i * 3 + 1] = g * brightness;
    colors[i * 3 + 2] = b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.4,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);
  _starPoints = points;
  return points;
}

/**
 * Call each frame to slowly rotate the star field.
 */
export function updateStarField(dt) {
  if (_starPoints) {
    // Slow rotation around y-axis (~1 degree every 10 seconds)
    _starPoints.rotation.y += 0.0002 * dt;
  }
}
