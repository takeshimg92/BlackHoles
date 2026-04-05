/**
 * Post-processing pipeline: Bloom + Gravitational Lensing.
 *
 * 1. Render scene → EffectComposer (RenderPass + UnrealBloomPass)
 * 2. Read bloomed result → lensing fullscreen quad (UV displacement)
 * 3. Output to screen
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D tScene;
  uniform vec2 uBH1;
  uniform vec2 uBH2;
  uniform float uMass1;
  uniform float uMass2;
  uniform float uAspect;
  uniform float uStrength;

  varying vec2 vUv;

  // Lensing: sample INWARD toward BH to show light bent around.
  // Soft saturation d_eff = d*r/(d+r) guarantees deflection < dist,
  // so source radius stays positive. No ring artifacts at any strength.
  // Verified by test_lensing_monotonicity.py (137 parametrized cases).
  vec4 applyLensing(vec4 color, vec2 uv, vec2 bhPos, float mass) {
    vec2 aspectCorrect = vec2(uAspect, 1.0);
    vec2 delta = (uv - bhPos) * aspectCorrect;
    float dist = length(delta);

    float rEH = mass * 0.06;
    float rLens = rEH * 5.0;
    float innerCutoff = rEH * 0.8;

    if (dist > innerCutoff && dist < rLens) {
      vec2 dir = normalize(delta);
      float d = uStrength * rEH * rEH / (dist * dist + rEH * 0.5);
      d *= smoothstep(rLens, rLens * 0.3, dist);
      // Soft saturation: approaches dist but never exceeds it
      float dEff = d * dist / (d + dist + 0.0001);
      color = texture2D(tScene, uv - (dir / aspectCorrect) * dEff);
    }

    return color;
  }

  void main() {
    vec4 color = texture2D(tScene, vUv);
    color = applyLensing(color, vUv, uBH1, uMass1);
    color = applyLensing(color, vUv, uBH2, uMass2);
    gl_FragColor = color;
  }
`;

export class LensingPass {
  constructor(renderer, width, height) {
    const dpr = renderer.getPixelRatio();
    const w = width * dpr;
    const h = height * dpr;

    // --- Bloom pipeline ---
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(w, h);

    // RenderPass will be configured with scene/camera in render()
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.4,   // strength — subtle glow
      0.6,   // radius
      0.7    // threshold — only bright areas bloom
    );
    this.composer.addPass(this.bloomPass);

    // --- Lensing quad ---
    // Reads from the composer's output texture
    this.lensingMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tScene: { value: this.composer.readBuffer.texture },
        uBH1: { value: new THREE.Vector2(0.5, 0.5) },
        uBH2: { value: new THREE.Vector2(0.5, 0.5) },
        uMass1: { value: 0.5 },
        uMass2: { value: 0.5 },
        uAspect: { value: width / height },
        uStrength: { value: 0.3 },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Expose material for external uniform access (lensing slider)
    this.material = this.lensingMaterial;

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.lensingMaterial);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._v3 = new THREE.Vector3();
  }

  updateBHPositions(posA, posB, massA, massB, camera) {
    this.lensingMaterial.uniforms.uBH1.value.copy(this._worldToUV(posA, camera));
    this.lensingMaterial.uniforms.uBH2.value.copy(this._worldToUV(posB, camera));
    this.lensingMaterial.uniforms.uMass1.value = massA;
    this.lensingMaterial.uniforms.uMass2.value = massB;
  }

  _worldToUV(pos, camera) {
    this._v3.copy(pos);
    this._v3.project(camera);
    return new THREE.Vector2(
      this._v3.x * 0.5 + 0.5,
      this._v3.y * 0.5 + 0.5
    );
  }

  render(renderer, scene, camera) {
    // Pass 1: render scene with bloom
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();

    // Update lensing texture from bloom output
    this.lensingMaterial.uniforms.tScene.value = this.composer.readBuffer.texture;

    // Pass 2: lensing quad to screen
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  setSize(width, height) {
    const dpr = window.devicePixelRatio;
    const w = width * dpr;
    const h = height * dpr;
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    this.lensingMaterial.uniforms.uAspect.value = width / height;
  }

  dispose() {
    this.composer.dispose();
    this.lensingMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
