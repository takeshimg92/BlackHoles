/**
 * Spacetime mesh grid with gravitational wave deformations and
 * amplitude-mapped blue vertex colors.
 *
 * Uses a Cartesian grid (PlaneGeometry) to avoid the aliasing and
 * pole-singularity issues of a polar grid.  Wireframe is rendered
 * as LineSegments with EdgesGeometry for clean, thick lines.
 */

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const GRID_SEGS = 80;   // subdivisions in each direction
const GRID_SIZE = 60;   // total width/height of the grid
const C_PROP = 1.0;

export class SpacetimeMesh {
  constructor(scene) {
    this._scene = scene;
    this.visible = true;
    this._brightnessMultiplier = 0.9;
    this._colorHue = 220; // default blue
    this._grazingFade = 1.0;
    this._segs = GRID_SEGS;

    // Materials (created once, reused across resolution changes)
    this.solidMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.wireMaterial = new LineMaterial({
      vertexColors: true,
      linewidth: 1.2,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });

    this.solidMesh = null;
    this.wireMesh = null;
    this._buildMesh(GRID_SEGS);
  }

  _buildMesh(segs) {
    // Remove old meshes if they exist
    if (this.solidMesh) {
      this._scene.remove(this.solidMesh);
      this.solidMesh.geometry.dispose();
    }
    if (this.wireMesh) {
      this._scene.remove(this.wireMesh);
      this.wireMesh.geometry.dispose();
    }

    this._segs = segs;
    const geometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, segs, segs);
    const nVerts = geometry.attributes.position.count;
    this.nVerts = nVerts;

    // Vertex colors
    const colors = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      colors[i * 3] = 0.02;
      colors[i * 3 + 1] = 0.06;
      colors[i * 3 + 2] = 0.15;
    }

    const solidGeom = geometry.clone();
    solidGeom.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 3));
    this.solidMesh = new THREE.Mesh(solidGeom, this.solidMaterial);

    // Grid lines (horizontal + vertical only)
    this._gridLineIndices = buildGridLineIndices(segs);
    const linePositions = this._buildLinePositions(geometry.attributes.position.array);
    const lineColors = this._buildLineColors(linePositions.length / 3);

    const lineGeom = new LineSegmentsGeometry();
    lineGeom.setPositions(linePositions);
    lineGeom.setColors(lineColors);
    this.wireMesh = new LineSegments2(lineGeom, this.wireMaterial);
    this._linePositions = linePositions;
    this._lineColors = lineColors;

    // Position in scene
    this.solidMesh.rotation.x = -Math.PI / 2;
    this.wireMesh.rotation.x = -Math.PI / 2;
    this.solidMesh.position.y = -0.5;
    this.wireMesh.position.y = -0.5;

    this._scene.add(this.solidMesh);
    this._scene.add(this.wireMesh);

    this.basePositions = new Float32Array(geometry.attributes.position.array);
    this.solidGeom = solidGeom;

    // Apply current visibility
    this.solidMesh.visible = this.visible;
    this.wireMesh.visible = this.visible;
  }

  setResolution(segs) {
    if (segs === this._segs) return;
    this._buildMesh(segs);
  }

  /**
   * Build flat array of line segment positions from grid vertex positions.
   * Each pair of consecutive vec3s defines one line segment.
   */
  _buildLinePositions(vertPositions) {
    const indices = this._gridLineIndices;
    const positions = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const vi = indices[i];
      positions[i * 3] = vertPositions[vi * 3];
      positions[i * 3 + 1] = vertPositions[vi * 3 + 1];
      positions[i * 3 + 2] = vertPositions[vi * 3 + 2];
    }
    return positions;
  }

  /**
   * Build initial line colors (uniform blue).
   */
  _buildLineColors(nLineVerts) {
    const colors = new Float32Array(nLineVerts * 3);
    for (let i = 0; i < nLineVerts; i++) {
      colors[i * 3] = 0.27;
      colors[i * 3 + 1] = 0.53;
      colors[i * 3 + 2] = 0.87;
    }
    return colors;
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
        well -= (body.mass || 0.5) * 2.5 / (dist + 1.5) * envelope;
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
      const [r, g, b] = curvatureColor(t, disp, this._brightnessMultiplier, this._colorHue);

      // Radial fade: vertices beyond 70% of the grid half-size fade to black
      const x = basePos[i], y = basePos[i + 1];
      const edgeDist = Math.max(Math.abs(x), Math.abs(y));
      const halfGrid = GRID_SIZE / 2;
      const fade = 1 - smoothstep(halfGrid * 0.55, halfGrid * 0.95, edgeDist);

      solidColors[v * 3] = r * fade;
      solidColors[v * 3 + 1] = g * fade;
      solidColors[v * 3 + 2] = b * fade;
    }

    this.solidGeom.attributes.position.needsUpdate = true;
    this.solidGeom.attributes.color.needsUpdate = true;

    // Update grid line positions and colors from deformed solid mesh
    const indices = this._gridLineIndices;
    const linePos = this._linePositions;
    const lineCol = this._lineColors;
    const halfGrid = GRID_SIZE / 2;
    const bm = this._brightnessMultiplier;
    const [wr, wg, wb] = hslToRgb(this._colorHue / 360, 0.6, 0.55);

    for (let li = 0; li < indices.length; li++) {
      const vi = indices[li];
      const si = vi * 3;
      linePos[li * 3] = solidPos[si];
      linePos[li * 3 + 1] = solidPos[si + 1];
      linePos[li * 3 + 2] = solidPos[si + 2];

      const edgeDist = Math.max(Math.abs(basePos[si]), Math.abs(basePos[si + 1]));
      const fade = 1 - smoothstep(halfGrid * 0.55, halfGrid * 0.95, edgeDist);

      lineCol[li * 3] = wr * fade * bm;
      lineCol[li * 3 + 1] = wg * fade * bm;
      lineCol[li * 3 + 2] = wb * fade * bm;
    }

    // Update the underlying buffers directly instead of calling
    // setPositions/setColors (which reallocate every frame).
    const lineGeom = this.wireMesh.geometry;
    const posAttr = lineGeom.getAttribute('instanceStart');
    const colAttr = lineGeom.getAttribute('instanceColorStart');
    if (posAttr && colAttr) {
      const posArr = posAttr.data.array;
      const colArr = colAttr.data.array;
      // LineSegmentsGeometry interleaves start+end: stride=6 per segment
      const nSegs = indices.length / 2;
      for (let s = 0; s < nSegs; s++) {
        const li0 = s * 2, li1 = s * 2 + 1;
        const off = s * 6;
        posArr[off]     = linePos[li0 * 3];
        posArr[off + 1] = linePos[li0 * 3 + 1];
        posArr[off + 2] = linePos[li0 * 3 + 2];
        posArr[off + 3] = linePos[li1 * 3];
        posArr[off + 4] = linePos[li1 * 3 + 1];
        posArr[off + 5] = linePos[li1 * 3 + 2];

        colArr[off]     = lineCol[li0 * 3];
        colArr[off + 1] = lineCol[li0 * 3 + 1];
        colArr[off + 2] = lineCol[li0 * 3 + 2];
        colArr[off + 3] = lineCol[li1 * 3];
        colArr[off + 4] = lineCol[li1 * 3 + 1];
        colArr[off + 5] = lineCol[li1 * 3 + 2];
      }
      posAttr.data.needsUpdate = true;
      colAttr.data.needsUpdate = true;
    } else {
      // Fallback for first frame before buffers are set up
      lineGeom.setPositions(linePos);
      lineGeom.setColors(lineCol);
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.wireMesh.visible = visible;
    this.solidMesh.visible = visible;
  }

  setColorHue(hue) {
    this._colorHue = hue;
  }

  setBrightness(value) {
    // value: 0.1 (dim) to 1.5 (bright)
    this._brightnessMultiplier = value;
    this._updateOpacity();
  }

  /**
   * Fade mesh when camera is nearly edge-on to avoid aliasing.
   * Called each frame from the merger scene's render loop.
   */
  updateCameraFade(camera) {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    this._grazingFade = Math.min(Math.abs(camDir.y) * 4, 1.0);

    // Update LineMaterial resolution for correct line width
    this.wireMaterial.resolution.set(window.innerWidth, window.innerHeight);

    this._updateOpacity();
  }

  _updateOpacity() {
    const b = this._brightnessMultiplier;
    const g = this._grazingFade ?? 1.0;
    this.wireMaterial.opacity = Math.min(b * 0.7, 1.0) * g;
    this.solidMaterial.opacity = Math.min(b * 0.3, 1.0) * g;
  }

  dispose() {
    this.wireMesh.geometry.dispose();
    this.wireMaterial.dispose();
    this.solidMesh.geometry.dispose();
    this.solidMaterial.dispose();
  }
}

function curvatureColor(t, rawDisp, brightness = 1.0, hue = 220) {
  const absDisp = Math.abs(rawDisp);
  const intensity = Math.min(absDisp * 3.5, 1.0);

  // Use hue with varying lightness based on displacement
  const lightness = 0.05 + 0.35 * intensity;
  const [r, g, b] = hslToRgb(hue / 360, 0.6, lightness);
  return [r * brightness, g * brightness, b * brightness];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [r, g, b];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Build vertex index pairs for only the horizontal and vertical grid
 * lines of a PlaneGeometry(size, size, segs, segs).
 *
 * PlaneGeometry has (segs+1)×(segs+1) vertices laid out row-major.
 * We emit pairs [a, b] for each horizontal edge (along rows) and
 * each vertical edge (along columns), skipping the triangle diagonals
 * that `wireframe: true` would show.
 *
 * Returns a flat array of vertex indices: [a0, b0, a1, b1, ...]
 * Each consecutive pair defines one line segment.
 */
function buildGridLineIndices(segs) {
  const n = segs + 1; // vertices per row/column
  const indices = [];

  // Horizontal lines (along each row)
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < segs; col++) {
      const a = row * n + col;
      const b = row * n + col + 1;
      indices.push(a, b);
    }
  }

  // Vertical lines (along each column)
  for (let col = 0; col < n; col++) {
    for (let row = 0; row < segs; row++) {
      const a = row * n + col;
      const b = (row + 1) * n + col;
      indices.push(a, b);
    }
  }

  return indices;
}
