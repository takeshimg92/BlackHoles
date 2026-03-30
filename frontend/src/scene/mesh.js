/**
 * Spacetime mesh grid with gravitational wave deformations and
 * amplitude-mapped blue vertex colors.
 *
 * Uses a Cartesian grid (PlaneGeometry) to avoid the aliasing and
 * pole-singularity issues of a polar grid.  Wireframe is rendered
 * as LineSegments with EdgesGeometry for clean, thick lines.
 */

import * as THREE from 'three';

const GRID_SEGS = 80;   // subdivisions in each direction
const GRID_SIZE = 60;   // total width/height of the grid
const C_PROP = 1.0;

export class SpacetimeMesh {
  constructor(scene) {
    const geometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, GRID_SEGS, GRID_SEGS);
    const nVerts = geometry.attributes.position.count;
    this.nVerts = nVerts;

    // Vertex color attribute — blue monochrome
    const colors = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      colors[i * 3] = 0.02;
      colors[i * 3 + 1] = 0.06;
      colors[i * 3 + 2] = 0.15;
    }

    const solidGeom = geometry.clone();
    solidGeom.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 3));

    // Solid surface — low base opacity so stars show through
    this.solidMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.solidMesh = new THREE.Mesh(solidGeom, this.solidMaterial);

    // Wireframe as a second mesh with wireframe material
    const wireGeom = geometry.clone();
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488dd,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    this.wireMesh = new THREE.Mesh(wireGeom, this.wireMaterial);

    // Rotate to lie in the xz-plane (y = up)
    this.solidMesh.rotation.x = -Math.PI / 2;
    this.wireMesh.rotation.x = -Math.PI / 2;
    this.solidMesh.position.y = -0.5;
    this.wireMesh.position.y = -0.5;

    scene.add(this.solidMesh);
    scene.add(this.wireMesh);

    // Store the base (undeformed) positions for the solid mesh
    this.basePositions = new Float32Array(geometry.attributes.position.array);
    this.solidGeom = solidGeom;
    this.wireGeom = wireGeom;
    this.visible = true;
  }

  deform(bodyPositions, hAmplitude, phase, frequency, simTime) {
    const solidPos = this.solidGeom.attributes.position.array;
    const solidColors = this.solidGeom.attributes.color.array;
    const basePos = this.basePositions;

    const visualScale = Math.min(hAmplitude * 3600, 10.0);

    // Binary center-of-mass
    let cx = 0, cy = 0, totalMass = 0;
    for (const body of bodyPositions) {
      const m = body.mass || 0.5;
      cx += body.x * m;
      cy += body.y * m;
      totalMass += m;
    }
    cx /= totalMass;
    cy /= totalMass;

    let sep = 1;
    if (bodyPositions.length >= 2) {
      const dx = bodyPositions[0].x - bodyPositions[1].x;
      const dy = bodyPositions[0].y - bodyPositions[1].y;
      sep = Math.sqrt(dx * dx + dy * dy);
    }
    const waveZoneR = Math.max(sep * 2.5, 3.0);

    let minDisp = Infinity, maxDisp = -Infinity;
    const nVerts = this.nVerts;
    const displacements = new Float32Array(nVerts);

    for (let v = 0; v < nVerts; v++) {
      const i = v * 3;
      const x = basePos[i];
      const y = basePos[i + 1];

      // Near-zone: gravity wells around each body
      let well = 0;
      for (const body of bodyPositions) {
        const dx = x - body.x;
        const dy = y - body.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const envelope = Math.exp(-dist * dist / (sep * sep * 4.0));
        well -= (body.mass || 0.5) * 2.5 / (dist + 0.5) * envelope;
      }

      // Wave zone: quadrupole spiral from COM
      const dxc = x - cx;
      const dyc = y - cy;
      const rFromCOM = Math.sqrt(dxc * dxc + dyc * dyc);
      const phi = Math.atan2(dyc, dxc);

      const phaseRetarded = phase - 2 * Math.PI * frequency * (rFromCOM / C_PROP);
      const hPlus = visualScale * Math.cos(2 * phi - phaseRetarded);

      const waveOnset = smoothstep(waveZoneR, waveZoneR * 2.0, rFromCOM);
      const decay = 1.0 / Math.max(rFromCOM, 1.0);
      const waveDisp = hPlus * decay * waveOnset;

      const totalDisp = well + waveDisp;
      displacements[v] = totalDisp;

      if (totalDisp < minDisp) minDisp = totalDisp;
      if (totalDisp > maxDisp) maxDisp = totalDisp;
    }

    const dispRange = Math.max(maxDisp - minDisp, 0.001);

    // Apply positions and colors
    for (let v = 0; v < nVerts; v++) {
      const i = v * 3;
      const disp = displacements[v];

      solidPos[i] = basePos[i];
      solidPos[i + 1] = basePos[i + 1];
      solidPos[i + 2] = disp;

      const t = (disp - minDisp) / dispRange;
      const [r, g, b] = curvatureColor(t, disp);
      solidColors[v * 3] = r;
      solidColors[v * 3 + 1] = g;
      solidColors[v * 3 + 2] = b;
    }

    this.solidGeom.attributes.position.needsUpdate = true;
    this.solidGeom.attributes.color.needsUpdate = true;

    // Copy deformed positions to wireframe mesh
    const wirePos = this.wireGeom.attributes.position.array;
    for (let i = 0; i < solidPos.length; i++) {
      wirePos[i] = solidPos[i];
    }
    this.wireGeom.attributes.position.needsUpdate = true;
  }

  setVisible(visible) {
    this.visible = visible;
    this.wireMesh.visible = visible;
    this.solidMesh.visible = visible;
  }

  dispose() {
    this.wireMesh.geometry.dispose();
    this.wireMaterial.dispose();
    this.solidMesh.geometry.dispose();
    this.solidMaterial.dispose();
  }
}

function curvatureColor(t, rawDisp) {
  const absDisp = Math.abs(rawDisp);
  const intensity = Math.min(absDisp * 3.5, 1.0);

  return [
    0.02 + 0.08 * intensity,
    0.05 + 0.20 * intensity,
    0.12 + 0.55 * intensity,
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
