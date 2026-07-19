import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createOffroadSUV2005Model } from '../model/createOffroadSuv2005Model';
import { addProceduralDetails } from '../model/addOffroadSuvDetails';

const container = document.getElementById('app')!;
const hud = document.getElementById('hud')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a4258);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 2.0, 4.6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.update();

// -- lighting: key / fill / rim+environment, matches spec.lightingFromPhoto --
// Sky/ground/rim tints stay close to neutral white: near-black matte materials (tires, trim)
// are Lambertian and pick up colored ambient/rim light directly, so a strongly blue hemisphere
// or rim light reads as "navy" instead of "black" on those surfaces even though the same tint
// looks fine as a cool accent on the light-colored body paint.
const hemi = new THREE.HemisphereLight(0xe7edf1, 0x2a241c, 0.55);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff3dd, 2.6);
key.position.set(-4, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.bias = -0.0015;
scene.add(key);

const fill = new THREE.DirectionalLight(0xf0f2f5, 0.9);
fill.position.set(5, 3, 3);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x6f9fc9, 0.25);
rim.position.set(0, 3, -6);
scene.add(rim);

// -- ground contact shadow plane --
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(20, 40, 0x2a3a45, 0x1c2a33);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.4;
scene.add(grid);

const model = createOffroadSUV2005Model(
  { castShadow: true, receiveShadow: true, qualityPriority: 'reference-fidelity' }
);
addProceduralDetails(model);
scene.add(model);
const runtime = model.userData.sculptRuntime as { nodes: Record<string, THREE.Object3D>; meshes: Record<string, THREE.Mesh> };

hud.textContent = `Offroad SUV 2005 — blockout pass — ${Object.keys(runtime.meshes).length} meshes`;
(window as any).__viewer = { scene, camera, renderer, controls, runtime };
(window as any).__modelReady = true;

const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  front: { pos: [0, 1.4, 8.5], target: [0, 0.9, 0] },
  rear: { pos: [0, 1.4, -8.5], target: [0, 0.9, 0] },
  side: { pos: [8.8, 1.2, 0], target: [0, 0.9, 0] },
  'three-quarter-front': { pos: [6.2, 2.8, 7.2], target: [0, 0.9, 0] },
  'three-quarter-rear': { pos: [6.2, 2.8, -7.2], target: [0, 0.9, 0] },
  top: { pos: [0.001, 11, 0], target: [0, 0.7, 0] },
};

function setView(name: string): void {
  const v = VIEWS[name];
  if (!v) return;
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
}
(window as any).__setView = setView;
setView('three-quarter-front');

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// interaction-pass proof: spin each wheel pivot around its authored axle axis
// (actionProfile.pivot.axis / transformChannels.rotate from the spec) to demonstrate the
// per-component pivot rig is live, not just descriptive metadata.
const WHEEL_IDS = ['wheel-front-left', 'wheel-front-right', 'wheel-rear-left', 'wheel-rear-right'];
let wheelSpinEnabled = false;
(window as any).__setWheelSpin = (enabled: boolean) => {
  wheelSpinEnabled = enabled;
};

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  if (wheelSpinEnabled) {
    for (const id of WHEEL_IDS) {
      const node = runtime.nodes[id];
      if (node) node.rotateX(0.03);
    }
  }
  renderer.render(scene, camera);
}
animate();
