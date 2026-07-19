import * as THREE from 'three';

/**
 * Adds the repeated micro-detail systems the base factory only describes as spec metadata
 * (repetitionSystems in object-sculpt-spec.json): grille slats, tread lugs, rim spokes, and
 * lug nuts. Built as InstancedMesh batches per rep-* system rather than one-off meshes.
 */

const TRIM_BLACK = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.7, metalness: 0.0 });
const WHEEL_METAL = new THREE.MeshStandardMaterial({ color: 0x3b3b3e, roughness: 0.35, metalness: 0.6 });
const TIRE_RUBBER = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85, metalness: 0.0 });

type WheelSpec = { center: THREE.Vector3; axis: 'x' | 'z'; radius: number };

const ROAD_WHEELS: WheelSpec[] = [
  { center: new THREE.Vector3(-0.775, 0.415, 0.9), axis: 'x', radius: 0.415 },
  { center: new THREE.Vector3(0.775, 0.415, 0.9), axis: 'x', radius: 0.415 },
  { center: new THREE.Vector3(-0.775, 0.415, -1.7), axis: 'x', radius: 0.415 },
  { center: new THREE.Vector3(0.775, 0.415, -1.7), axis: 'x', radius: 0.415 },
];
const SPARE_WHEEL: WheelSpec = { center: new THREE.Vector3(0, 0.7, -2.35), axis: 'z', radius: 0.415 };
const ALL_WHEELS = [...ROAD_WHEELS, SPARE_WHEEL];

function wheelPlaneOffset(axis: 'x' | 'z', radius: number, angle: number): THREE.Vector3 {
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  return axis === 'x' ? new THREE.Vector3(0, c, s) : new THREE.Vector3(c, s, 0);
}

// Radial (points away from hub), tangent (circumferential), and axial (along the axle) unit
// vectors at a given angle around the wheel. Used to build a rotation that keeps a box's local
// X/Y/Z consistently mapped to tangent/radial/axial regardless of where it sits on the wheel --
// a single fixed-axis rotation by `angle` does NOT do this (it spins the box's own long axis
// through every orientation as angle sweeps, producing spiky misaligned lugs/spokes).
function wheelBasis(axis: 'x' | 'z', angle: number): { tangent: THREE.Vector3; radial: THREE.Vector3; axial: THREE.Vector3 } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const radial = axis === 'x' ? new THREE.Vector3(0, c, s) : new THREE.Vector3(c, s, 0);
  const tangent = axis === 'x' ? new THREE.Vector3(0, -s, c) : new THREE.Vector3(-s, c, 0);
  // Derive axial via cross product rather than hardcoding a sign: a hand-picked axial vector
  // that doesn't satisfy tangent x radial = axial makes makeBasis() produce a left-handed
  // (mirrored, determinant -1) matrix, which setFromRotationMatrix silently mishandles
  // (returns a degenerate, non-unit quaternion instead of throwing).
  const axial = tangent.clone().cross(radial);
  return { tangent, radial, axial };
}

// rep-grille-slats: 7 vertical slats across the grille face.
function addGrilleSlats(root: THREE.Group): void {
  const count = 7;
  const grilleCenter = new THREE.Vector3(0, 0.95, 1.98);
  const slatWidth = 0.062;
  const spacing = 0.62 / count;
  const slatMaterial = new THREE.MeshStandardMaterial({ color: 0x100f0e, roughness: 0.55, metalness: 0.1 });
  const geometry = new THREE.BoxGeometry(0.036, 0.37, 0.09);
  const mesh = new THREE.InstancedMesh(geometry, slatMaterial, count);
  mesh.name = 'grille-slats';
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) {
    const x = (i - (count - 1) / 2) * spacing;
    m.makeTranslation(grilleCenter.x + x, grilleCenter.y, grilleCenter.z + 0.05);
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}

// rep-tread-lugs: tread lug blocks around each wheel's tire circumference.
function addTreadLugs(root: THREE.Group): void {
  const lugsPerWheel = 18;
  const totalInstances = lugsPerWheel * ALL_WHEELS.length;
  const geometry = new THREE.BoxGeometry(0.29, 0.09, 0.05);
  const mesh = new THREE.InstancedMesh(geometry, TIRE_RUBBER, totalInstances);
  mesh.name = 'tread-lugs';
  const m = new THREE.Matrix4();
  const basisMatrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let index = 0;
  for (const wheel of ALL_WHEELS) {
    const treadRadius = wheel.radius - 0.02;
    for (let i = 0; i < lugsPerWheel; i += 1) {
      const angle = (i / lugsPerWheel) * Math.PI * 2;
      const offset = wheelPlaneOffset(wheel.axis, treadRadius, angle);
      const position = wheel.center.clone().add(offset);
      // Box local X=tangent (0.29 circumferential), Y=radial (0.09 sticking outward), Z=axial (0.05 wheel width).
      const { tangent, radial, axial } = wheelBasis(wheel.axis, angle);
      basisMatrix.makeBasis(tangent, radial, axial);
      q.setFromRotationMatrix(basisMatrix);
      m.compose(position, q, scale);
      mesh.setMatrixAt(index, m);
      index += 1;
    }
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}

// wheel rim: 5-spoke hub disc per wheel (dark gunmetal), rep-lug-nuts: 5 nuts per hub.
function addRimSpokesAndLugNuts(root: THREE.Group): void {
  const spokesPerWheel = 5;
  const hubGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10);
  const spokeGeometry = new THREE.BoxGeometry(0.06, 0.24, 0.02);
  const lugGeometry = new THREE.SphereGeometry(0.018, 6, 4);

  const hubMesh = new THREE.InstancedMesh(hubGeometry, WHEEL_METAL, ALL_WHEELS.length);
  hubMesh.name = 'wheel-hubs';
  const spokeMesh = new THREE.InstancedMesh(spokeGeometry, WHEEL_METAL, spokesPerWheel * ALL_WHEELS.length);
  spokeMesh.name = 'rim-spokes';
  const lugMesh = new THREE.InstancedMesh(lugGeometry, WHEEL_METAL, spokesPerWheel * ALL_WHEELS.length);
  lugMesh.name = 'lug-nuts';

  const m = new THREE.Matrix4();
  const basisMatrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let spokeIndex = 0;

  ALL_WHEELS.forEach((wheel, wheelIndex) => {
    const axisVec = wheel.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    // Hub: cylinder's default axis is Y; rotate so its axis matches the wheel's axle axis.
    const hubQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisVec);
    m.compose(wheel.center, hubQuat, scale);
    hubMesh.setMatrixAt(wheelIndex, m);

    for (let i = 0; i < spokesPerWheel; i += 1) {
      const angle = (i / spokesPerWheel) * Math.PI * 2;
      const offset = wheelPlaneOffset(wheel.axis, 0.14, angle);
      const position = wheel.center.clone().add(offset);
      // Box local X=tangent (0.06 thin), Y=radial (0.24 spoke arm points outward), Z=axial (0.02).
      const { tangent, radial, axial } = wheelBasis(wheel.axis, angle);
      basisMatrix.makeBasis(tangent, radial, axial);
      q.setFromRotationMatrix(basisMatrix);
      m.compose(position, q, scale);
      spokeMesh.setMatrixAt(spokeIndex, m);

      const lugOffset = wheelPlaneOffset(wheel.axis, 0.11, angle + Math.PI / spokesPerWheel);
      const lugPosition = wheel.center.clone().add(lugOffset);
      m.compose(lugPosition, new THREE.Quaternion(), scale);
      lugMesh.setMatrixAt(spokeIndex, m);
      spokeIndex += 1;
    }
  });

  for (const mesh of [hubMesh, spokeMesh, lugMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

// headlight bezel rings (bevel local feature on headlight-left/right).
function addHeadlightBezels(root: THREE.Group): void {
  const geometry = new THREE.TorusGeometry(0.11, 0.012, 6, 14);
  const mesh = new THREE.InstancedMesh(geometry, WHEEL_METAL, 2);
  mesh.name = 'headlight-bezels';
  const centers = [new THREE.Vector3(-0.55, 0.95, 1.97), new THREE.Vector3(0.55, 0.95, 1.97)];
  const m = new THREE.Matrix4();
  centers.forEach((c, i) => {
    m.makeTranslation(c.x, c.y, c.z);
    mesh.setMatrixAt(i, m);
  });
  root.add(mesh);
}

// The generator's procedural-texture path forces material.color to white and derives albedo
// from a small canvas texture; for tiny flat-colored accent lenses that canvas ends up reading
// close to the surrounding panel color instead of the intended saturated hue. Override these
// small lens materials directly so they render as the deliberate accent colors from the spec.
const LENS_OVERRIDES: Record<string, { color: number; emissive: number; emissiveIntensity: number }> = {
  'headlight-left': { color: 0xf2f2e8, emissive: 0xfff6dd, emissiveIntensity: 0.5 },
  'headlight-right': { color: 0xf2f2e8, emissive: 0xfff6dd, emissiveIntensity: 0.5 },
  'turnsignal-left': { color: 0xd98a1e, emissive: 0xd98a1e, emissiveIntensity: 0.7 },
  'turnsignal-right': { color: 0xd98a1e, emissive: 0xd98a1e, emissiveIntensity: 0.7 },
  'taillight-left': { color: 0x8c1010, emissive: 0x8c1010, emissiveIntensity: 0.6 },
  'taillight-right': { color: 0x8c1010, emissive: 0x8c1010, emissiveIntensity: 0.6 },
};

function fixLensMaterials(meshes: Record<string, THREE.Mesh>): void {
  for (const [id, spec] of Object.entries(LENS_OVERRIDES)) {
    const mesh = meshes[id];
    if (!mesh) continue;
    mesh.material = new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.emissive,
      emissiveIntensity: spec.emissiveIntensity,
      roughness: 0.15,
      metalness: 0.0,
    });
  }
}

export function addProceduralDetails(root: THREE.Group): void {
  addGrilleSlats(root);
  addTreadLugs(root);
  addRimSpokesAndLugNuts(root);
  addHeadlightBezels(root);
  const runtime = root.userData.sculptRuntime as { meshes: Record<string, THREE.Mesh> } | undefined;
  if (runtime) fixLensMaterials(runtime.meshes);
}
