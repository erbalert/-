import * as THREE from 'three';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      const paletteValue = clamp01(
        0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
      );
      const color = mixPalette(colors, paletteValue);
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions): THREE.MeshPhysicalMaterial {
  const textures = makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : new THREE.Color(typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F'),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clamp01(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    if (bumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = bumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    if (displacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = displacementScale;
      material.displacementBias = -displacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Offroad SUV 2005
// Sculpt build pass: optimization-pass
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createOffroadSUV2005Model(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Offroad SUV 2005";

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["mat-body-paint"] = createSculptMaterial(
    "mat-body-paint",
    {"id": "mat-body-paint", "name": "Body Paint (Tan/Khaki)", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#C9C0AF", "color": "#C9C0AF", "albedo": {"dominant": "#797065", "secondary": ["#81786C", "#2C2B2A", "#554F46"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_albedo.png", "url": "mat-body-paint_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#797065", "#81786C", "#2C2B2A", "#554F46", "#938A7D"], "pattern": "reference-derived pixel palette", "amplitude": 0.14, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.397, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.228, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.099, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.685, "variation": 0.05, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_roughness.png", "url": "mat-body-paint_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.178, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_normal.png", "url": "mat-body-paint_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_height.png", "url": "mat-body-paint_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.01, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_height.png", "url": "mat-body-paint_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_ao.png", "url": "mat-body-paint_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [{"id": "albedo-swatch", "kind": "decal", "description": "reference spec-sheet swatch is the authoritative tan/khaki albedo source for all body panels", "albedo": "#C9C0AF", "evidenceRef": "color-palette", "confidence": 1.0}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Body Paint (Tan/Khaki): image-derived color/roughness from the reference spec-sheet swatches and zone crops.", "referencePbr": {"version": "1.0", "sourceImage": "/home/user/-/img2threejs-work/pbr-crops/crop-body-paint.png", "extractor": "extract_reference_pbr.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.866, "estimatedFidelity": 0.866, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_albedo.png", "url": "/pbr-maps/body-paint/mat-body-paint_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_roughness.png", "url": "/pbr-maps/body-paint/mat-body-paint_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_height.png", "url": "/pbr-maps/body-paint/mat-body-paint_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_normal.png", "url": "/pbr-maps/body-paint/mat-body-paint_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/-/img2threejs-work/pbr-maps/body-paint/mat-body-paint_ao.png", "url": "/pbr-maps/body-paint/mat-body-paint_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 170, "sourceHeight": 50, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 170, "height": 50}, "mask": {"backgroundColor": "#80776D", "backgroundNoise": 13.304, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.3776}, "mapStats": {"valueRange": 0.333, "heightP90Gradient": 0.0185, "roughnessBase": 0.685, "roughnessVariation": 0.05, "normalStrength": 0.178, "blurRadius": 21}, "palette": ["#797065", "#81786C", "#2C2B2A", "#554F46", "#938A7D"]}, "warnings": []}},
    options
  );
  materialMap["mat-trim-black"] = createSculptMaterial(
    "mat-trim-black",
    {"id": "mat-trim-black", "name": "Matte Black Trim/Plastic", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#232323", "color": "#232323", "albedo": {"dominant": "#0D0D0C", "secondary": ["#161615", "#10100F", "#131312"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_albedo.png", "url": "mat-trim-black_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#0D0D0C", "#161615", "#10100F", "#131312", "#080807"], "pattern": "reference-derived pixel palette", "amplitude": 0.08, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.308, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.193, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.08, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.68, "variation": 0.05, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_roughness.png", "url": "mat-trim-black_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.168, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_normal.png", "url": "mat-trim-black_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_height.png", "url": "mat-trim-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.01, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_height.png", "url": "mat-trim-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_ao.png", "url": "mat-trim-black_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [{"id": "roof-panel", "kind": "seam", "description": "matte-black hardtop mass reads as a distinct color break from the tan body at the beltline seam", "roughness": 0.65, "evidenceRef": "side-view", "confidence": 0.95}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Matte Black Trim/Plastic: image-derived color/roughness from the reference spec-sheet swatches and zone crops.", "referencePbr": {"version": "1.0", "sourceImage": "/home/user/-/img2threejs-work/pbr-crops/crop-black-trim-d.png", "extractor": "extract_reference_pbr.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.757, "estimatedFidelity": 0.757, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_albedo.png", "url": "/pbr-maps/trim-black/mat-trim-black_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_roughness.png", "url": "/pbr-maps/trim-black/mat-trim-black_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_height.png", "url": "/pbr-maps/trim-black/mat-trim-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_normal.png", "url": "/pbr-maps/trim-black/mat-trim-black_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/-/img2threejs-work/pbr-maps/trim-black/mat-trim-black_ao.png", "url": "/pbr-maps/trim-black/mat-trim-black_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 130, "sourceHeight": 15, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 1, "width": 130, "height": 8}, "mask": {"backgroundColor": "#252524", "backgroundNoise": 3.464, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.1072}, "mapStats": {"valueRange": 0.08, "heightP90Gradient": 0.01031, "roughnessBase": 0.68, "roughnessVariation": 0.05, "normalStrength": 0.168, "blurRadius": 21}, "palette": ["#0D0D0C", "#161615", "#10100F", "#131312", "#080807"]}, "warnings": ["low value range weakens height/roughness inference"]}},
    options
  );
  materialMap["mat-glass-tint"] = createSculptMaterial(
    "mat-glass-tint",
    {"id": "mat-glass-tint", "name": "Tinted Window Glass", "type": "standard", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#3A4A55", "color": "#3A4A55", "albedo": {"dominant": "#3A4A55", "secondary": ["#2A363F"], "samplingNotes": "Image-observed local color zone from the reference spec-sheet swatches, not a single averaged color."}, "colorVariation": {"palette": ["#3A4A55", "#2A363F"], "pattern": "panel-block", "amplitude": 0.08, "heightCorrelation": 0.1}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.3, "role": "broad panel color and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.15, "role": "seams, panel gaps, ridges"}, {"id": "micro", "frequency": 48.0, "amplitude": 0.06, "role": "highlight breakup under grazing light"}], "roughness": {"base": 0.12, "variation": 0.06, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities and dirt-prone lower panels, lower roughness on bevel crests"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.1, "scale": 20.0, "space": "tangent"}, "bump": {"pattern": "panel-grain", "amplitude": 0.02, "scale": 6.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "Darken door seams, wheel-well cavities, grille gaps, and panel joints."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise."], "notes": "Tinted Window Glass: image-derived color/roughness from the reference spec-sheet swatches and zone crops. qualityTier=utility: small/specular/transmissive/emissive accent material (lens, glass, or thin roll-cage tube) where single-image PBR extraction is not meaningful at this pixel scale; color/roughness/emissive values are set directly from the reference spec-sheet palette and zone-crop observation instead.", "transmission": 0.55, "opacity": 0.55, "transparent": true, "qualityTier": "utility"},
    options
  );
  materialMap["mat-tire-rubber"] = createSculptMaterial(
    "mat-tire-rubber",
    {"id": "mat-tire-rubber", "name": "All-Terrain Tire Rubber", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#151515", "color": "#151515", "albedo": {"dominant": "#10131B", "secondary": ["#1C1C1A", "#354861", "#0A0C0F"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_albedo.png", "url": "mat-tire-rubber_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#10131B", "#1C1C1A", "#354861", "#0A0C0F", "#1F2937"], "pattern": "reference-derived pixel palette", "amplitude": 0.107, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.369, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.176, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.07, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.68, "variation": 0.05, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_roughness.png", "url": "mat-tire-rubber_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.164, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_normal.png", "url": "mat-tire-rubber_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_height.png", "url": "mat-tire-rubber_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.01, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_height.png", "url": "mat-tire-rubber_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_ao.png", "url": "mat-tire-rubber_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "All-Terrain Tire Rubber: image-derived color/roughness from a clean tread crop in the user-supplied individual side-view reference (reference-views/side-view.jpg), confidence 0.749. Earlier crops from the composite reference sheet picked up blue studio rim-light bleed on the tire's curved surface; this crop from a dedicated single-subject image avoided that contamination.", "referencePbr": {"version": "1.0", "sourceImage": "/home/user/-/img2threejs-work/reference-views/side-view.jpg -> pbr-crops2/v2-tire-c.png", "extractor": "extract_reference_pbr.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.749, "estimatedFidelity": 0.749, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_albedo.png", "url": "/pbr-maps/tire-rubber/mat-tire-rubber_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_roughness.png", "url": "/pbr-maps/tire-rubber/mat-tire-rubber_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_height.png", "url": "/pbr-maps/tire-rubber/mat-tire-rubber_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_normal.png", "url": "/pbr-maps/tire-rubber/mat-tire-rubber_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/-/img2threejs-work/pbr-maps/tire-rubber-v2/mat-tire-rubber_ao.png", "url": "/pbr-maps/tire-rubber/mat-tire-rubber_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 40, "sourceHeight": 25, "mapSize": 1024, "cropBBoxPixels": {"x": 1, "y": 0, "width": 39, "height": 25}, "mask": {"backgroundColor": "#2B2E2E", "backgroundNoise": 26.608, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.115}, "mapStats": {"valueRange": 0.2554, "heightP90Gradient": 0.00629, "roughnessBase": 0.68, "roughnessVariation": 0.05, "normalStrength": 0.164, "blurRadius": 21}, "palette": ["#10131B", "#1C1C1A", "#354861", "#0A0C0F", "#1F2937"]}, "warnings": ["low high-frequency detail weakens normal/roughness inference"]}},
    options
  );
  materialMap["mat-wheel-metal"] = createSculptMaterial(
    "mat-wheel-metal",
    {"id": "mat-wheel-metal", "name": "Gunmetal Alloy Rim", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#3B3B3E", "color": "#3B3B3E", "albedo": {"dominant": "#0B0C0C", "secondary": ["#040404", "#323435", "#161816"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_albedo.png", "url": "mat-wheel-metal_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#0B0C0C", "#040404", "#323435", "#161816", "#838383"], "pattern": "reference-derived pixel palette", "amplitude": 0.164, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.416, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.237, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.104, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.682, "variation": 0.05, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_roughness.png", "url": "mat-wheel-metal_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.6, "variation": 0.05}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.18, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_normal.png", "url": "mat-wheel-metal_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_height.png", "url": "mat-wheel-metal_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.01, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_height.png", "url": "mat-wheel-metal_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_ao.png", "url": "mat-wheel-metal_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Gunmetal Alloy Rim: image-derived color/roughness from the reference spec-sheet swatches and zone crops.", "referencePbr": {"version": "1.0", "sourceImage": "/home/user/-/img2threejs-work/reference-views/side-view.jpg -> pbr-crops2/v2-wheelmetal-b.png", "extractor": "extract_reference_pbr.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.886, "estimatedFidelity": 0.886, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_albedo.png", "url": "/pbr-maps/wheel-metal/mat-wheel-metal_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_roughness.png", "url": "/pbr-maps/wheel-metal/mat-wheel-metal_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_height.png", "url": "/pbr-maps/wheel-metal/mat-wheel-metal_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_normal.png", "url": "/pbr-maps/wheel-metal/mat-wheel-metal_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/home/user/-/img2threejs-work/pbr-maps/wheel-metal-v2/mat-wheel-metal_ao.png", "url": "/pbr-maps/wheel-metal/mat-wheel-metal_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 35, "sourceHeight": 32, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 35, "height": 32}, "mask": {"backgroundColor": "#1A1918", "backgroundNoise": 11.0, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.3143}, "mapStats": {"valueRange": 0.3897, "heightP90Gradient": 0.02062, "roughnessBase": 0.682, "roughnessVariation": 0.05, "normalStrength": 0.18, "blurRadius": 21}, "palette": ["#0B0C0C", "#040404", "#323435", "#161816", "#838383"]}, "warnings": []}},
    options
  );
  materialMap["mat-headlight-lens"] = createSculptMaterial(
    "mat-headlight-lens",
    {"id": "mat-headlight-lens", "name": "Headlight Lens (Sealed Beam)", "type": "standard", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#F2F2E8", "color": "#F2F2E8", "albedo": {"dominant": "#F2F2E8", "secondary": [], "samplingNotes": "Image-observed local color zone from the reference spec-sheet swatches, not a single averaged color."}, "colorVariation": {"palette": ["#F2F2E8"], "pattern": "panel-block", "amplitude": 0.08, "heightCorrelation": 0.1}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.3, "role": "broad panel color and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.15, "role": "seams, panel gaps, ridges"}, {"id": "micro", "frequency": 48.0, "amplitude": 0.06, "role": "highlight breakup under grazing light"}], "roughness": {"base": 0.08, "variation": 0.05, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities and dirt-prone lower panels, lower roughness on bevel crests"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.05, "scale": 20.0, "space": "tangent"}, "bump": {"pattern": "panel-grain", "amplitude": 0.02, "scale": 6.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "Darken door seams, wheel-well cavities, grille gaps, and panel joints."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise."], "notes": "Headlight Lens (Sealed Beam): image-derived color/roughness from the reference spec-sheet swatches and zone crops. qualityTier=utility: small/specular/transmissive/emissive accent material (lens, glass, or thin roll-cage tube) where single-image PBR extraction is not meaningful at this pixel scale; color/roughness/emissive values are set directly from the reference spec-sheet palette and zone-crop observation instead.", "emissive": "#FFF6DD", "emissiveIntensity": 0.15, "qualityTier": "utility"},
    options
  );
  materialMap["mat-taillight-lens"] = createSculptMaterial(
    "mat-taillight-lens",
    {"id": "mat-taillight-lens", "name": "Taillight Lens (Red)", "type": "standard", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#8C1010", "color": "#8C1010", "albedo": {"dominant": "#8C1010", "secondary": [], "samplingNotes": "Image-observed local color zone from the reference spec-sheet swatches, not a single averaged color."}, "colorVariation": {"palette": ["#8C1010"], "pattern": "panel-block", "amplitude": 0.08, "heightCorrelation": 0.1}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.3, "role": "broad panel color and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.15, "role": "seams, panel gaps, ridges"}, {"id": "micro", "frequency": 48.0, "amplitude": 0.06, "role": "highlight breakup under grazing light"}], "roughness": {"base": 0.15, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities and dirt-prone lower panels, lower roughness on bevel crests"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.08, "scale": 20.0, "space": "tangent"}, "bump": {"pattern": "panel-grain", "amplitude": 0.02, "scale": 6.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "Darken door seams, wheel-well cavities, grille gaps, and panel joints."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [{"id": "red-gloss", "kind": "gloss", "description": "glossy low-roughness red lens with a soft emissive base", "roughness": 0.15, "emissiveColor": "#5A0A0A", "emissiveIntensity": 0.25, "evidenceRef": "rear-view", "confidence": 0.95}], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise."], "notes": "Taillight Lens (Red): image-derived color/roughness from the reference spec-sheet swatches and zone crops. qualityTier=utility: small/specular/transmissive/emissive accent material (lens, glass, or thin roll-cage tube) where single-image PBR extraction is not meaningful at this pixel scale; color/roughness/emissive values are set directly from the reference spec-sheet palette and zone-crop observation instead.", "emissive": "#5A0A0A", "emissiveIntensity": 0.25, "qualityTier": "utility"},
    options
  );
  materialMap["mat-turnsignal-lens"] = createSculptMaterial(
    "mat-turnsignal-lens",
    {"id": "mat-turnsignal-lens", "name": "Turn Signal Lens (Amber)", "type": "standard", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#D98A1E", "color": "#D98A1E", "albedo": {"dominant": "#D98A1E", "secondary": [], "samplingNotes": "Image-observed local color zone from the reference spec-sheet swatches, not a single averaged color."}, "colorVariation": {"palette": ["#D98A1E"], "pattern": "panel-block", "amplitude": 0.08, "heightCorrelation": 0.1}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.3, "role": "broad panel color and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.15, "role": "seams, panel gaps, ridges"}, {"id": "micro", "frequency": 48.0, "amplitude": 0.06, "role": "highlight breakup under grazing light"}], "roughness": {"base": 0.15, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities and dirt-prone lower panels, lower roughness on bevel crests"}, "metalness": {"base": 0.0, "variation": 0.05}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.08, "scale": 20.0, "space": "tangent"}, "bump": {"pattern": "panel-grain", "amplitude": 0.02, "scale": 6.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "Darken door seams, wheel-well cavities, grille gaps, and panel joints."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [{"id": "amber-glow", "kind": "emissive", "description": "amber emissive glow on the turn-signal lens face", "emissiveColor": "#D98A1E", "emissiveIntensity": 0.6, "evidenceRef": "three-quarter-front-view", "confidence": 0.9}], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise."], "notes": "Turn Signal Lens (Amber): image-derived color/roughness from the reference spec-sheet swatches and zone crops. qualityTier=utility: small/specular/transmissive/emissive accent material (lens, glass, or thin roll-cage tube) where single-image PBR extraction is not meaningful at this pixel scale; color/roughness/emissive values are set directly from the reference spec-sheet palette and zone-crop observation instead.", "emissive": "#D98A1E", "emissiveIntensity": 0.4, "qualityTier": "utility"},
    options
  );
  materialMap["mat-rollcage-metal"] = createSculptMaterial(
    "mat-rollcage-metal",
    {"id": "mat-rollcage-metal", "name": "Roll-Cage Tube Metal", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#1A1A1A", "color": "#1A1A1A", "albedo": {"dominant": "#1A1A1A", "secondary": ["#101010"], "samplingNotes": "Image-observed local color zone from the reference spec-sheet swatches, not a single averaged color."}, "colorVariation": {"palette": ["#1A1A1A", "#101010"], "pattern": "panel-block", "amplitude": 0.08, "heightCorrelation": 0.1}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.3, "role": "broad panel color and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.15, "role": "seams, panel gaps, ridges"}, {"id": "micro", "frequency": 48.0, "amplitude": 0.06, "role": "highlight breakup under grazing light"}], "roughness": {"base": 0.4, "variation": 0.1, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities and dirt-prone lower panels, lower roughness on bevel crests"}, "metalness": {"base": 0.4, "variation": 0.05}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.1, "scale": 20.0, "space": "tangent"}, "bump": {"pattern": "brushed", "amplitude": 0.02, "scale": 6.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.35, "contactShadowBias": 0.4, "notes": "Darken door seams, wheel-well cavities, grille gaps, and panel joints."}, "wear": {"edgeWear": 0.08, "scratches": [], "chips": []}, "dirt": {"amount": 0.06, "cavityBias": 0.3, "color": "#2B2620"}, "localOverrides": [], "shaderNotes": ["Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use MeshPhysicalMaterial when clearcoat/transmission/emissive response is needed (glass, lenses); MeshStandardMaterial otherwise."], "notes": "Roll-Cage Tube Metal: image-derived color/roughness from the reference spec-sheet swatches and zone crops. qualityTier=utility: small/specular/transmissive/emissive accent material (lens, glass, or thin roll-cage tube) where single-image PBR extraction is not meaningful at this pixel scale; color/roughness/emissive values are set directly from the reference spec-sheet palette and zone-crop observation instead.", "qualityTier": "utility"},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const attachment_body_tub_0 = null;
  const endpoint_body_tub_0 = makeAttachmentEndpoint(attachment_body_tub_0);
  const node_body_tub_0 = new THREE.Group();
  node_body_tub_0.name = "Body Tub__pivot";
  if (endpoint_body_tub_0) {
    node_body_tub_0.position.copy(endpoint_body_tub_0.start);
    node_body_tub_0.rotation.set(0, 0, 0);
    node_body_tub_0.scale.set(1, 1, 1);
  } else {
    node_body_tub_0.position.set(0.0, 0.825, 0.0);
    node_body_tub_0.rotation.set(0.0, 0.0, 0.0);
    node_body_tub_0.scale.set(1.65, 1.15, 3.9);
  }
  node_body_tub_0.userData.sculptComponent = {"id": "body-tub", "name": "Body Tub", "level": "macro", "role": "body-tub", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": null, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.65, "height": 1.15, "depth": 3.9}, "transform": {"position": [0.0, 0.825, 0.0], "rotation": [0, 0, 0], "scale": [1.65, 1.15, 3.9]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "roof-hardtop-mount", "localPosition": [0.0, 0.95, -0.15], "localRotation": [0, 0, 0]}, {"id": "cabin-glass-mount", "localPosition": [0.0, 0.725, -0.15], "localRotation": [0, 0, 0]}, {"id": "chassis-underbody-mount", "localPosition": [0.0, -0.635, 0.0], "localRotation": [0, 0, 0]}, {"id": "hood-mount", "localPosition": [0.0, 0.605, 1.475], "localRotation": [0, 0, 0]}, {"id": "grille-mount", "localPosition": [0.0, 0.125, 1.98], "localRotation": [0, 0, 0]}, {"id": "bumper-front-mount", "localPosition": [0.0, -0.375, 2.075], "localRotation": [0, 0, 0]}, {"id": "bumper-rear-mount", "localPosition": [0.0, -0.375, -2.075], "localRotation": [0, 0, 0]}, {"id": "door-left-mount", "localPosition": [-0.85, 0.075, 0.2], "localRotation": [0, 0, 0]}, {"id": "door-right-mount", "localPosition": [0.85, 0.075, 0.2], "localRotation": [0, 0, 0]}, {"id": "rocker-panel-left-mount", "localPosition": [-0.865, -0.525, -0.1], "localRotation": [0, 0, 0]}, {"id": "rocker-panel-right-mount", "localPosition": [0.865, -0.525, -0.1], "localRotation": [0, 0, 0]}, {"id": "fender-front-left-mount", "localPosition": [-0.915, -0.225, 0.9], "localRotation": [0, 0, 0]}, {"id": "fender-front-right-mount", "localPosition": [0.915, -0.225, 0.9], "localRotation": [0, 0, 0]}, {"id": "fender-rear-left-mount", "localPosition": [-0.915, -0.225, -1.7], "localRotation": [0, 0, 0]}, {"id": "fender-rear-right-mount", "localPosition": [0.915, -0.225, -1.7], "localRotation": [0, 0, 0]}, {"id": "windshield-frame-mount", "localPosition": [0.0, 0.605, 0.83], "localRotation": [0, 0, 0]}, {"id": "tailgate-mount", "localPosition": [0.0, -0.125, -2.0], "localRotation": [0, 0, 0]}, {"id": "wheel-front-left-mount", "localPosition": [-0.775, -0.41, 0.9], "localRotation": [0, 0, 0]}, {"id": "wheel-front-right-mount", "localPosition": [0.775, -0.41, 0.9], "localRotation": [0, 0, 0]}, {"id": "wheel-rear-left-mount", "localPosition": [-0.775, -0.41, -1.7], "localRotation": [0, 0, 0]}, {"id": "wheel-rear-right-mount", "localPosition": [0.775, -0.41, -1.7], "localRotation": [0, 0, 0]}, {"id": "mirror-left-mount", "localPosition": [-0.9, 0.725, 0.8], "localRotation": [0, 0, 0]}, {"id": "mirror-right-mount", "localPosition": [0.9, 0.725, 0.8], "localRotation": [0, 0, 0]}, {"id": "headlight-left-mount", "localPosition": [-0.55, 0.125, 1.97], "localRotation": [0, 0, 0]}, {"id": "headlight-right-mount", "localPosition": [0.55, 0.125, 1.97], "localRotation": [0, 0, 0]}, {"id": "turnsignal-left-mount", "localPosition": [-0.62, -0.205, 1.96], "localRotation": [0, 0, 0]}, {"id": "turnsignal-right-mount", "localPosition": [0.62, -0.205, 1.96], "localRotation": [0, 0, 0]}, {"id": "taillight-left-mount", "localPosition": [-0.78, -0.075, -1.97], "localRotation": [0, 0, 0]}, {"id": "taillight-right-mount", "localPosition": [0.78, -0.075, -1.97], "localRotation": [0, 0, 0]}, {"id": "window-rear-quarter-left-mount", "localPosition": [-0.775, 0.725, -0.6], "localRotation": [0, 0, 0]}, {"id": "window-rear-quarter-right-mount", "localPosition": [0.775, 0.725, -0.6], "localRotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "front-view"], "details": [], "fidelityTier": "blockout"};
  node_body_tub_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "roof-hardtop-mount", "localPosition": [0.0, 0.95, -0.15], "localRotation": [0, 0, 0]}, {"id": "cabin-glass-mount", "localPosition": [0.0, 0.725, -0.15], "localRotation": [0, 0, 0]}, {"id": "chassis-underbody-mount", "localPosition": [0.0, -0.635, 0.0], "localRotation": [0, 0, 0]}, {"id": "hood-mount", "localPosition": [0.0, 0.605, 1.475], "localRotation": [0, 0, 0]}, {"id": "grille-mount", "localPosition": [0.0, 0.125, 1.98], "localRotation": [0, 0, 0]}, {"id": "bumper-front-mount", "localPosition": [0.0, -0.375, 2.075], "localRotation": [0, 0, 0]}, {"id": "bumper-rear-mount", "localPosition": [0.0, -0.375, -2.075], "localRotation": [0, 0, 0]}, {"id": "door-left-mount", "localPosition": [-0.85, 0.075, 0.2], "localRotation": [0, 0, 0]}, {"id": "door-right-mount", "localPosition": [0.85, 0.075, 0.2], "localRotation": [0, 0, 0]}, {"id": "rocker-panel-left-mount", "localPosition": [-0.865, -0.525, -0.1], "localRotation": [0, 0, 0]}, {"id": "rocker-panel-right-mount", "localPosition": [0.865, -0.525, -0.1], "localRotation": [0, 0, 0]}, {"id": "fender-front-left-mount", "localPosition": [-0.915, -0.225, 0.9], "localRotation": [0, 0, 0]}, {"id": "fender-front-right-mount", "localPosition": [0.915, -0.225, 0.9], "localRotation": [0, 0, 0]}, {"id": "fender-rear-left-mount", "localPosition": [-0.915, -0.225, -1.7], "localRotation": [0, 0, 0]}, {"id": "fender-rear-right-mount", "localPosition": [0.915, -0.225, -1.7], "localRotation": [0, 0, 0]}, {"id": "windshield-frame-mount", "localPosition": [0.0, 0.605, 0.83], "localRotation": [0, 0, 0]}, {"id": "tailgate-mount", "localPosition": [0.0, -0.125, -2.0], "localRotation": [0, 0, 0]}, {"id": "wheel-front-left-mount", "localPosition": [-0.775, -0.41, 0.9], "localRotation": [0, 0, 0]}, {"id": "wheel-front-right-mount", "localPosition": [0.775, -0.41, 0.9], "localRotation": [0, 0, 0]}, {"id": "wheel-rear-left-mount", "localPosition": [-0.775, -0.41, -1.7], "localRotation": [0, 0, 0]}, {"id": "wheel-rear-right-mount", "localPosition": [0.775, -0.41, -1.7], "localRotation": [0, 0, 0]}, {"id": "mirror-left-mount", "localPosition": [-0.9, 0.725, 0.8], "localRotation": [0, 0, 0]}, {"id": "mirror-right-mount", "localPosition": [0.9, 0.725, 0.8], "localRotation": [0, 0, 0]}, {"id": "headlight-left-mount", "localPosition": [-0.55, 0.125, 1.97], "localRotation": [0, 0, 0]}, {"id": "headlight-right-mount", "localPosition": [0.55, 0.125, 1.97], "localRotation": [0, 0, 0]}, {"id": "turnsignal-left-mount", "localPosition": [-0.62, -0.205, 1.96], "localRotation": [0, 0, 0]}, {"id": "turnsignal-right-mount", "localPosition": [0.62, -0.205, 1.96], "localRotation": [0, 0, 0]}, {"id": "taillight-left-mount", "localPosition": [-0.78, -0.075, -1.97], "localRotation": [0, 0, 0]}, {"id": "taillight-right-mount", "localPosition": [0.78, -0.075, -1.97], "localRotation": [0, 0, 0]}, {"id": "window-rear-quarter-left-mount", "localPosition": [-0.775, 0.725, -0.6], "localRotation": [0, 0, 0]}, {"id": "window-rear-quarter-right-mount", "localPosition": [0.775, 0.725, -0.6], "localRotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}};
  (nodes["root"] ?? root).add(node_body_tub_0);
  nodes["body-tub"] = node_body_tub_0;
  const mesh_body_tub_0Geometry = endpoint_body_tub_0
    ? new THREE.CylinderGeometry(endpoint_body_tub_0.endRadius, endpoint_body_tub_0.baseRadius, endpoint_body_tub_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_body_tub_0 = new THREE.Mesh(
    mesh_body_tub_0Geometry,
    materialMap["mat-body-paint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_body_tub_0.name = "Body Tub";
  if (endpoint_body_tub_0) {
    mesh_body_tub_0.position.copy(endpoint_body_tub_0.midpoint);
    mesh_body_tub_0.quaternion.copy(endpoint_body_tub_0.quaternion);
  }
  mesh_body_tub_0.castShadow = options.castShadow ?? true;
  mesh_body_tub_0.receiveShadow = options.receiveShadow ?? true;
  mesh_body_tub_0.userData.sculptComponent = {"id": "body-tub", "name": "Body Tub", "level": "macro", "role": "body-tub", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": null, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.65, "height": 1.15, "depth": 3.9}, "transform": {"position": [0.0, 0.825, 0.0], "rotation": [0, 0, 0], "scale": [1.65, 1.15, 3.9]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "roof-hardtop-mount", "localPosition": [0.0, 0.95, -0.15], "localRotation": [0, 0, 0]}, {"id": "cabin-glass-mount", "localPosition": [0.0, 0.725, -0.15], "localRotation": [0, 0, 0]}, {"id": "chassis-underbody-mount", "localPosition": [0.0, -0.635, 0.0], "localRotation": [0, 0, 0]}, {"id": "hood-mount", "localPosition": [0.0, 0.605, 1.475], "localRotation": [0, 0, 0]}, {"id": "grille-mount", "localPosition": [0.0, 0.125, 1.98], "localRotation": [0, 0, 0]}, {"id": "bumper-front-mount", "localPosition": [0.0, -0.375, 2.075], "localRotation": [0, 0, 0]}, {"id": "bumper-rear-mount", "localPosition": [0.0, -0.375, -2.075], "localRotation": [0, 0, 0]}, {"id": "door-left-mount", "localPosition": [-0.85, 0.075, 0.2], "localRotation": [0, 0, 0]}, {"id": "door-right-mount", "localPosition": [0.85, 0.075, 0.2], "localRotation": [0, 0, 0]}, {"id": "rocker-panel-left-mount", "localPosition": [-0.865, -0.525, -0.1], "localRotation": [0, 0, 0]}, {"id": "rocker-panel-right-mount", "localPosition": [0.865, -0.525, -0.1], "localRotation": [0, 0, 0]}, {"id": "fender-front-left-mount", "localPosition": [-0.915, -0.225, 0.9], "localRotation": [0, 0, 0]}, {"id": "fender-front-right-mount", "localPosition": [0.915, -0.225, 0.9], "localRotation": [0, 0, 0]}, {"id": "fender-rear-left-mount", "localPosition": [-0.915, -0.225, -1.7], "localRotation": [0, 0, 0]}, {"id": "fender-rear-right-mount", "localPosition": [0.915, -0.225, -1.7], "localRotation": [0, 0, 0]}, {"id": "windshield-frame-mount", "localPosition": [0.0, 0.605, 0.83], "localRotation": [0, 0, 0]}, {"id": "tailgate-mount", "localPosition": [0.0, -0.125, -2.0], "localRotation": [0, 0, 0]}, {"id": "wheel-front-left-mount", "localPosition": [-0.775, -0.41, 0.9], "localRotation": [0, 0, 0]}, {"id": "wheel-front-right-mount", "localPosition": [0.775, -0.41, 0.9], "localRotation": [0, 0, 0]}, {"id": "wheel-rear-left-mount", "localPosition": [-0.775, -0.41, -1.7], "localRotation": [0, 0, 0]}, {"id": "wheel-rear-right-mount", "localPosition": [0.775, -0.41, -1.7], "localRotation": [0, 0, 0]}, {"id": "mirror-left-mount", "localPosition": [-0.9, 0.725, 0.8], "localRotation": [0, 0, 0]}, {"id": "mirror-right-mount", "localPosition": [0.9, 0.725, 0.8], "localRotation": [0, 0, 0]}, {"id": "headlight-left-mount", "localPosition": [-0.55, 0.125, 1.97], "localRotation": [0, 0, 0]}, {"id": "headlight-right-mount", "localPosition": [0.55, 0.125, 1.97], "localRotation": [0, 0, 0]}, {"id": "turnsignal-left-mount", "localPosition": [-0.62, -0.205, 1.96], "localRotation": [0, 0, 0]}, {"id": "turnsignal-right-mount", "localPosition": [0.62, -0.205, 1.96], "localRotation": [0, 0, 0]}, {"id": "taillight-left-mount", "localPosition": [-0.78, -0.075, -1.97], "localRotation": [0, 0, 0]}, {"id": "taillight-right-mount", "localPosition": [0.78, -0.075, -1.97], "localRotation": [0, 0, 0]}, {"id": "window-rear-quarter-left-mount", "localPosition": [-0.775, 0.725, -0.6], "localRotation": [0, 0, 0]}, {"id": "window-rear-quarter-right-mount", "localPosition": [0.775, 0.725, -0.6], "localRotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "front-view"], "details": [], "fidelityTier": "blockout"};
  node_body_tub_0.add(mesh_body_tub_0);
  meshes["body-tub"] = mesh_body_tub_0;
  colliders["body-tub"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_body_tub_0);
  const socket_body_tub_roof_hardtop_mount_0 = new THREE.Object3D();
  socket_body_tub_roof_hardtop_mount_0.name = "roof-hardtop-mount";
  socket_body_tub_roof_hardtop_mount_0.position.set(0.0, 0.95, -0.15);
  socket_body_tub_roof_hardtop_mount_0.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_roof_hardtop_mount_0.userData.socket = {"id": "roof-hardtop-mount", "localPosition": [0.0, 0.95, -0.15], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_roof_hardtop_mount_0);
  sockets["body-tub:roof-hardtop-mount"] = socket_body_tub_roof_hardtop_mount_0;
  const socket_body_tub_cabin_glass_mount_1 = new THREE.Object3D();
  socket_body_tub_cabin_glass_mount_1.name = "cabin-glass-mount";
  socket_body_tub_cabin_glass_mount_1.position.set(0.0, 0.725, -0.15);
  socket_body_tub_cabin_glass_mount_1.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_cabin_glass_mount_1.userData.socket = {"id": "cabin-glass-mount", "localPosition": [0.0, 0.725, -0.15], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_cabin_glass_mount_1);
  sockets["body-tub:cabin-glass-mount"] = socket_body_tub_cabin_glass_mount_1;
  const socket_body_tub_chassis_underbody_mount_2 = new THREE.Object3D();
  socket_body_tub_chassis_underbody_mount_2.name = "chassis-underbody-mount";
  socket_body_tub_chassis_underbody_mount_2.position.set(0.0, -0.635, 0.0);
  socket_body_tub_chassis_underbody_mount_2.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_chassis_underbody_mount_2.userData.socket = {"id": "chassis-underbody-mount", "localPosition": [0.0, -0.635, 0.0], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_chassis_underbody_mount_2);
  sockets["body-tub:chassis-underbody-mount"] = socket_body_tub_chassis_underbody_mount_2;
  const socket_body_tub_hood_mount_3 = new THREE.Object3D();
  socket_body_tub_hood_mount_3.name = "hood-mount";
  socket_body_tub_hood_mount_3.position.set(0.0, 0.605, 1.475);
  socket_body_tub_hood_mount_3.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_hood_mount_3.userData.socket = {"id": "hood-mount", "localPosition": [0.0, 0.605, 1.475], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_hood_mount_3);
  sockets["body-tub:hood-mount"] = socket_body_tub_hood_mount_3;
  const socket_body_tub_grille_mount_4 = new THREE.Object3D();
  socket_body_tub_grille_mount_4.name = "grille-mount";
  socket_body_tub_grille_mount_4.position.set(0.0, 0.125, 1.98);
  socket_body_tub_grille_mount_4.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_grille_mount_4.userData.socket = {"id": "grille-mount", "localPosition": [0.0, 0.125, 1.98], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_grille_mount_4);
  sockets["body-tub:grille-mount"] = socket_body_tub_grille_mount_4;
  const socket_body_tub_bumper_front_mount_5 = new THREE.Object3D();
  socket_body_tub_bumper_front_mount_5.name = "bumper-front-mount";
  socket_body_tub_bumper_front_mount_5.position.set(0.0, -0.375, 2.075);
  socket_body_tub_bumper_front_mount_5.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_bumper_front_mount_5.userData.socket = {"id": "bumper-front-mount", "localPosition": [0.0, -0.375, 2.075], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_bumper_front_mount_5);
  sockets["body-tub:bumper-front-mount"] = socket_body_tub_bumper_front_mount_5;
  const socket_body_tub_bumper_rear_mount_6 = new THREE.Object3D();
  socket_body_tub_bumper_rear_mount_6.name = "bumper-rear-mount";
  socket_body_tub_bumper_rear_mount_6.position.set(0.0, -0.375, -2.075);
  socket_body_tub_bumper_rear_mount_6.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_bumper_rear_mount_6.userData.socket = {"id": "bumper-rear-mount", "localPosition": [0.0, -0.375, -2.075], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_bumper_rear_mount_6);
  sockets["body-tub:bumper-rear-mount"] = socket_body_tub_bumper_rear_mount_6;
  const socket_body_tub_door_left_mount_7 = new THREE.Object3D();
  socket_body_tub_door_left_mount_7.name = "door-left-mount";
  socket_body_tub_door_left_mount_7.position.set(-0.85, 0.075, 0.2);
  socket_body_tub_door_left_mount_7.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_door_left_mount_7.userData.socket = {"id": "door-left-mount", "localPosition": [-0.85, 0.075, 0.2], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_door_left_mount_7);
  sockets["body-tub:door-left-mount"] = socket_body_tub_door_left_mount_7;
  const socket_body_tub_door_right_mount_8 = new THREE.Object3D();
  socket_body_tub_door_right_mount_8.name = "door-right-mount";
  socket_body_tub_door_right_mount_8.position.set(0.85, 0.075, 0.2);
  socket_body_tub_door_right_mount_8.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_door_right_mount_8.userData.socket = {"id": "door-right-mount", "localPosition": [0.85, 0.075, 0.2], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_door_right_mount_8);
  sockets["body-tub:door-right-mount"] = socket_body_tub_door_right_mount_8;
  const socket_body_tub_rocker_panel_left_mount_9 = new THREE.Object3D();
  socket_body_tub_rocker_panel_left_mount_9.name = "rocker-panel-left-mount";
  socket_body_tub_rocker_panel_left_mount_9.position.set(-0.865, -0.525, -0.1);
  socket_body_tub_rocker_panel_left_mount_9.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_rocker_panel_left_mount_9.userData.socket = {"id": "rocker-panel-left-mount", "localPosition": [-0.865, -0.525, -0.1], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_rocker_panel_left_mount_9);
  sockets["body-tub:rocker-panel-left-mount"] = socket_body_tub_rocker_panel_left_mount_9;
  const socket_body_tub_rocker_panel_right_mount_10 = new THREE.Object3D();
  socket_body_tub_rocker_panel_right_mount_10.name = "rocker-panel-right-mount";
  socket_body_tub_rocker_panel_right_mount_10.position.set(0.865, -0.525, -0.1);
  socket_body_tub_rocker_panel_right_mount_10.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_rocker_panel_right_mount_10.userData.socket = {"id": "rocker-panel-right-mount", "localPosition": [0.865, -0.525, -0.1], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_rocker_panel_right_mount_10);
  sockets["body-tub:rocker-panel-right-mount"] = socket_body_tub_rocker_panel_right_mount_10;
  const socket_body_tub_fender_front_left_mount_11 = new THREE.Object3D();
  socket_body_tub_fender_front_left_mount_11.name = "fender-front-left-mount";
  socket_body_tub_fender_front_left_mount_11.position.set(-0.915, -0.225, 0.9);
  socket_body_tub_fender_front_left_mount_11.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_fender_front_left_mount_11.userData.socket = {"id": "fender-front-left-mount", "localPosition": [-0.915, -0.225, 0.9], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_fender_front_left_mount_11);
  sockets["body-tub:fender-front-left-mount"] = socket_body_tub_fender_front_left_mount_11;
  const socket_body_tub_fender_front_right_mount_12 = new THREE.Object3D();
  socket_body_tub_fender_front_right_mount_12.name = "fender-front-right-mount";
  socket_body_tub_fender_front_right_mount_12.position.set(0.915, -0.225, 0.9);
  socket_body_tub_fender_front_right_mount_12.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_fender_front_right_mount_12.userData.socket = {"id": "fender-front-right-mount", "localPosition": [0.915, -0.225, 0.9], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_fender_front_right_mount_12);
  sockets["body-tub:fender-front-right-mount"] = socket_body_tub_fender_front_right_mount_12;
  const socket_body_tub_fender_rear_left_mount_13 = new THREE.Object3D();
  socket_body_tub_fender_rear_left_mount_13.name = "fender-rear-left-mount";
  socket_body_tub_fender_rear_left_mount_13.position.set(-0.915, -0.225, -1.7);
  socket_body_tub_fender_rear_left_mount_13.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_fender_rear_left_mount_13.userData.socket = {"id": "fender-rear-left-mount", "localPosition": [-0.915, -0.225, -1.7], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_fender_rear_left_mount_13);
  sockets["body-tub:fender-rear-left-mount"] = socket_body_tub_fender_rear_left_mount_13;
  const socket_body_tub_fender_rear_right_mount_14 = new THREE.Object3D();
  socket_body_tub_fender_rear_right_mount_14.name = "fender-rear-right-mount";
  socket_body_tub_fender_rear_right_mount_14.position.set(0.915, -0.225, -1.7);
  socket_body_tub_fender_rear_right_mount_14.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_fender_rear_right_mount_14.userData.socket = {"id": "fender-rear-right-mount", "localPosition": [0.915, -0.225, -1.7], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_fender_rear_right_mount_14);
  sockets["body-tub:fender-rear-right-mount"] = socket_body_tub_fender_rear_right_mount_14;
  const socket_body_tub_windshield_frame_mount_15 = new THREE.Object3D();
  socket_body_tub_windshield_frame_mount_15.name = "windshield-frame-mount";
  socket_body_tub_windshield_frame_mount_15.position.set(0.0, 0.605, 0.83);
  socket_body_tub_windshield_frame_mount_15.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_windshield_frame_mount_15.userData.socket = {"id": "windshield-frame-mount", "localPosition": [0.0, 0.605, 0.83], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_windshield_frame_mount_15);
  sockets["body-tub:windshield-frame-mount"] = socket_body_tub_windshield_frame_mount_15;
  const socket_body_tub_tailgate_mount_16 = new THREE.Object3D();
  socket_body_tub_tailgate_mount_16.name = "tailgate-mount";
  socket_body_tub_tailgate_mount_16.position.set(0.0, -0.125, -2.0);
  socket_body_tub_tailgate_mount_16.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_tailgate_mount_16.userData.socket = {"id": "tailgate-mount", "localPosition": [0.0, -0.125, -2.0], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_tailgate_mount_16);
  sockets["body-tub:tailgate-mount"] = socket_body_tub_tailgate_mount_16;
  const socket_body_tub_wheel_front_left_mount_17 = new THREE.Object3D();
  socket_body_tub_wheel_front_left_mount_17.name = "wheel-front-left-mount";
  socket_body_tub_wheel_front_left_mount_17.position.set(-0.775, -0.41, 0.9);
  socket_body_tub_wheel_front_left_mount_17.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_wheel_front_left_mount_17.userData.socket = {"id": "wheel-front-left-mount", "localPosition": [-0.775, -0.41, 0.9], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_wheel_front_left_mount_17);
  sockets["body-tub:wheel-front-left-mount"] = socket_body_tub_wheel_front_left_mount_17;
  const socket_body_tub_wheel_front_right_mount_18 = new THREE.Object3D();
  socket_body_tub_wheel_front_right_mount_18.name = "wheel-front-right-mount";
  socket_body_tub_wheel_front_right_mount_18.position.set(0.775, -0.41, 0.9);
  socket_body_tub_wheel_front_right_mount_18.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_wheel_front_right_mount_18.userData.socket = {"id": "wheel-front-right-mount", "localPosition": [0.775, -0.41, 0.9], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_wheel_front_right_mount_18);
  sockets["body-tub:wheel-front-right-mount"] = socket_body_tub_wheel_front_right_mount_18;
  const socket_body_tub_wheel_rear_left_mount_19 = new THREE.Object3D();
  socket_body_tub_wheel_rear_left_mount_19.name = "wheel-rear-left-mount";
  socket_body_tub_wheel_rear_left_mount_19.position.set(-0.775, -0.41, -1.7);
  socket_body_tub_wheel_rear_left_mount_19.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_wheel_rear_left_mount_19.userData.socket = {"id": "wheel-rear-left-mount", "localPosition": [-0.775, -0.41, -1.7], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_wheel_rear_left_mount_19);
  sockets["body-tub:wheel-rear-left-mount"] = socket_body_tub_wheel_rear_left_mount_19;
  const socket_body_tub_wheel_rear_right_mount_20 = new THREE.Object3D();
  socket_body_tub_wheel_rear_right_mount_20.name = "wheel-rear-right-mount";
  socket_body_tub_wheel_rear_right_mount_20.position.set(0.775, -0.41, -1.7);
  socket_body_tub_wheel_rear_right_mount_20.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_wheel_rear_right_mount_20.userData.socket = {"id": "wheel-rear-right-mount", "localPosition": [0.775, -0.41, -1.7], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_wheel_rear_right_mount_20);
  sockets["body-tub:wheel-rear-right-mount"] = socket_body_tub_wheel_rear_right_mount_20;
  const socket_body_tub_mirror_left_mount_21 = new THREE.Object3D();
  socket_body_tub_mirror_left_mount_21.name = "mirror-left-mount";
  socket_body_tub_mirror_left_mount_21.position.set(-0.9, 0.725, 0.8);
  socket_body_tub_mirror_left_mount_21.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_mirror_left_mount_21.userData.socket = {"id": "mirror-left-mount", "localPosition": [-0.9, 0.725, 0.8], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_mirror_left_mount_21);
  sockets["body-tub:mirror-left-mount"] = socket_body_tub_mirror_left_mount_21;
  const socket_body_tub_mirror_right_mount_22 = new THREE.Object3D();
  socket_body_tub_mirror_right_mount_22.name = "mirror-right-mount";
  socket_body_tub_mirror_right_mount_22.position.set(0.9, 0.725, 0.8);
  socket_body_tub_mirror_right_mount_22.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_mirror_right_mount_22.userData.socket = {"id": "mirror-right-mount", "localPosition": [0.9, 0.725, 0.8], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_mirror_right_mount_22);
  sockets["body-tub:mirror-right-mount"] = socket_body_tub_mirror_right_mount_22;
  const socket_body_tub_headlight_left_mount_23 = new THREE.Object3D();
  socket_body_tub_headlight_left_mount_23.name = "headlight-left-mount";
  socket_body_tub_headlight_left_mount_23.position.set(-0.55, 0.125, 1.97);
  socket_body_tub_headlight_left_mount_23.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_headlight_left_mount_23.userData.socket = {"id": "headlight-left-mount", "localPosition": [-0.55, 0.125, 1.97], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_headlight_left_mount_23);
  sockets["body-tub:headlight-left-mount"] = socket_body_tub_headlight_left_mount_23;
  const socket_body_tub_headlight_right_mount_24 = new THREE.Object3D();
  socket_body_tub_headlight_right_mount_24.name = "headlight-right-mount";
  socket_body_tub_headlight_right_mount_24.position.set(0.55, 0.125, 1.97);
  socket_body_tub_headlight_right_mount_24.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_headlight_right_mount_24.userData.socket = {"id": "headlight-right-mount", "localPosition": [0.55, 0.125, 1.97], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_headlight_right_mount_24);
  sockets["body-tub:headlight-right-mount"] = socket_body_tub_headlight_right_mount_24;
  const socket_body_tub_turnsignal_left_mount_25 = new THREE.Object3D();
  socket_body_tub_turnsignal_left_mount_25.name = "turnsignal-left-mount";
  socket_body_tub_turnsignal_left_mount_25.position.set(-0.62, -0.205, 1.96);
  socket_body_tub_turnsignal_left_mount_25.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_turnsignal_left_mount_25.userData.socket = {"id": "turnsignal-left-mount", "localPosition": [-0.62, -0.205, 1.96], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_turnsignal_left_mount_25);
  sockets["body-tub:turnsignal-left-mount"] = socket_body_tub_turnsignal_left_mount_25;
  const socket_body_tub_turnsignal_right_mount_26 = new THREE.Object3D();
  socket_body_tub_turnsignal_right_mount_26.name = "turnsignal-right-mount";
  socket_body_tub_turnsignal_right_mount_26.position.set(0.62, -0.205, 1.96);
  socket_body_tub_turnsignal_right_mount_26.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_turnsignal_right_mount_26.userData.socket = {"id": "turnsignal-right-mount", "localPosition": [0.62, -0.205, 1.96], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_turnsignal_right_mount_26);
  sockets["body-tub:turnsignal-right-mount"] = socket_body_tub_turnsignal_right_mount_26;
  const socket_body_tub_taillight_left_mount_27 = new THREE.Object3D();
  socket_body_tub_taillight_left_mount_27.name = "taillight-left-mount";
  socket_body_tub_taillight_left_mount_27.position.set(-0.78, -0.075, -1.97);
  socket_body_tub_taillight_left_mount_27.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_taillight_left_mount_27.userData.socket = {"id": "taillight-left-mount", "localPosition": [-0.78, -0.075, -1.97], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_taillight_left_mount_27);
  sockets["body-tub:taillight-left-mount"] = socket_body_tub_taillight_left_mount_27;
  const socket_body_tub_taillight_right_mount_28 = new THREE.Object3D();
  socket_body_tub_taillight_right_mount_28.name = "taillight-right-mount";
  socket_body_tub_taillight_right_mount_28.position.set(0.78, -0.075, -1.97);
  socket_body_tub_taillight_right_mount_28.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_taillight_right_mount_28.userData.socket = {"id": "taillight-right-mount", "localPosition": [0.78, -0.075, -1.97], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_taillight_right_mount_28);
  sockets["body-tub:taillight-right-mount"] = socket_body_tub_taillight_right_mount_28;
  const socket_body_tub_window_rear_quarter_left_mount_29 = new THREE.Object3D();
  socket_body_tub_window_rear_quarter_left_mount_29.name = "window-rear-quarter-left-mount";
  socket_body_tub_window_rear_quarter_left_mount_29.position.set(-0.775, 0.725, -0.6);
  socket_body_tub_window_rear_quarter_left_mount_29.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_window_rear_quarter_left_mount_29.userData.socket = {"id": "window-rear-quarter-left-mount", "localPosition": [-0.775, 0.725, -0.6], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_window_rear_quarter_left_mount_29);
  sockets["body-tub:window-rear-quarter-left-mount"] = socket_body_tub_window_rear_quarter_left_mount_29;
  const socket_body_tub_window_rear_quarter_right_mount_30 = new THREE.Object3D();
  socket_body_tub_window_rear_quarter_right_mount_30.name = "window-rear-quarter-right-mount";
  socket_body_tub_window_rear_quarter_right_mount_30.position.set(0.775, 0.725, -0.6);
  socket_body_tub_window_rear_quarter_right_mount_30.rotation.set(0.0, 0.0, 0.0);
  socket_body_tub_window_rear_quarter_right_mount_30.userData.socket = {"id": "window-rear-quarter-right-mount", "localPosition": [0.775, 0.725, -0.6], "localRotation": [0, 0, 0]};
  node_body_tub_0.add(socket_body_tub_window_rear_quarter_right_mount_30);
  sockets["body-tub:window-rear-quarter-right-mount"] = socket_body_tub_window_rear_quarter_right_mount_30;

  const attachment_roof_hardtop_1 = {"parentId": null, "parentSocket": "roof-hardtop-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "top-view"]};
  const endpoint_roof_hardtop_1 = makeAttachmentEndpoint(attachment_roof_hardtop_1);
  const node_roof_hardtop_1 = new THREE.Group();
  node_roof_hardtop_1.name = "Hardtop Roof__pivot";
  if (endpoint_roof_hardtop_1) {
    node_roof_hardtop_1.position.copy(endpoint_roof_hardtop_1.start);
    node_roof_hardtop_1.rotation.set(0, 0, 0);
    node_roof_hardtop_1.scale.set(1, 1, 1);
  } else {
    node_roof_hardtop_1.position.set(0.0, 1.775, -0.15);
    node_roof_hardtop_1.rotation.set(0.0, 0.0, 0.0);
    node_roof_hardtop_1.scale.set(1.55, 0.15, 2.05);
  }
  node_roof_hardtop_1.userData.sculptComponent = {"id": "roof-hardtop", "name": "Hardtop Roof", "level": "macro", "role": "roof", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "roof-hardtop-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "top-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.55, "height": 0.15, "depth": 2.05}, "transform": {"position": [0.0, 1.775, -0.15], "rotation": [0, 0, 0], "scale": [1.55, 0.15, 2.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "top-view"], "details": [], "fidelityTier": "blockout"};
  node_roof_hardtop_1.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_roof_hardtop_1);
  nodes["roof-hardtop"] = node_roof_hardtop_1;
  const mesh_roof_hardtop_1Geometry = endpoint_roof_hardtop_1
    ? new THREE.CylinderGeometry(endpoint_roof_hardtop_1.endRadius, endpoint_roof_hardtop_1.baseRadius, endpoint_roof_hardtop_1.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_roof_hardtop_1 = new THREE.Mesh(
    mesh_roof_hardtop_1Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_roof_hardtop_1.name = "Hardtop Roof";
  if (endpoint_roof_hardtop_1) {
    mesh_roof_hardtop_1.position.copy(endpoint_roof_hardtop_1.midpoint);
    mesh_roof_hardtop_1.quaternion.copy(endpoint_roof_hardtop_1.quaternion);
  }
  mesh_roof_hardtop_1.castShadow = options.castShadow ?? true;
  mesh_roof_hardtop_1.receiveShadow = options.receiveShadow ?? true;
  mesh_roof_hardtop_1.userData.sculptComponent = {"id": "roof-hardtop", "name": "Hardtop Roof", "level": "macro", "role": "roof", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "roof-hardtop-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "top-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.55, "height": 0.15, "depth": 2.05}, "transform": {"position": [0.0, 1.775, -0.15], "rotation": [0, 0, 0], "scale": [1.55, 0.15, 2.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "top-view"], "details": [], "fidelityTier": "blockout"};
  node_roof_hardtop_1.add(mesh_roof_hardtop_1);
  meshes["roof-hardtop"] = mesh_roof_hardtop_1;
  colliders["roof-hardtop"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_roof_hardtop_1);

  const attachment_cabin_glass_2 = {"parentId": null, "parentSocket": "cabin-glass-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "rear-view"]};
  const endpoint_cabin_glass_2 = makeAttachmentEndpoint(attachment_cabin_glass_2);
  const node_cabin_glass_2 = new THREE.Group();
  node_cabin_glass_2.name = "Cabin Glasshouse__pivot";
  if (endpoint_cabin_glass_2) {
    node_cabin_glass_2.position.copy(endpoint_cabin_glass_2.start);
    node_cabin_glass_2.rotation.set(0, 0, 0);
    node_cabin_glass_2.scale.set(1, 1, 1);
  } else {
    node_cabin_glass_2.position.set(0.0, 1.55, -0.15);
    node_cabin_glass_2.rotation.set(0.0, 0.0, 0.0);
    node_cabin_glass_2.scale.set(1.55, 0.3, 2.0);
  }
  node_cabin_glass_2.userData.sculptComponent = {"id": "cabin-glass", "name": "Cabin Glasshouse", "level": "macro", "role": "greenhouse-glass", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "cabin-glass-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.55, "height": 0.3, "depth": 2.0}, "transform": {"position": [0.0, 1.55, -0.15], "rotation": [0, 0, 0], "scale": [1.55, 0.3, 2.0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}}, "material": "mat-glass-tint", "materialLayers": ["mat-glass-tint"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "rear-view"], "details": [], "fidelityTier": "blockout"};
  node_cabin_glass_2.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}};
  (nodes["root"] ?? root).add(node_cabin_glass_2);
  nodes["cabin-glass"] = node_cabin_glass_2;
  const mesh_cabin_glass_2Geometry = endpoint_cabin_glass_2
    ? new THREE.CylinderGeometry(endpoint_cabin_glass_2.endRadius, endpoint_cabin_glass_2.baseRadius, endpoint_cabin_glass_2.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_cabin_glass_2 = new THREE.Mesh(
    mesh_cabin_glass_2Geometry,
    materialMap["mat-glass-tint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cabin_glass_2.name = "Cabin Glasshouse";
  if (endpoint_cabin_glass_2) {
    mesh_cabin_glass_2.position.copy(endpoint_cabin_glass_2.midpoint);
    mesh_cabin_glass_2.quaternion.copy(endpoint_cabin_glass_2.quaternion);
  }
  mesh_cabin_glass_2.castShadow = options.castShadow ?? true;
  mesh_cabin_glass_2.receiveShadow = options.receiveShadow ?? true;
  mesh_cabin_glass_2.userData.sculptComponent = {"id": "cabin-glass", "name": "Cabin Glasshouse", "level": "macro", "role": "greenhouse-glass", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "cabin-glass-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.55, "height": 0.3, "depth": 2.0}, "transform": {"position": [0.0, 1.55, -0.15], "rotation": [0, 0, 0], "scale": [1.55, 0.3, 2.0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}}, "material": "mat-glass-tint", "materialLayers": ["mat-glass-tint"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "rear-view"], "details": [], "fidelityTier": "blockout"};
  node_cabin_glass_2.add(mesh_cabin_glass_2);
  meshes["cabin-glass"] = mesh_cabin_glass_2;
  colliders["cabin-glass"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_cabin_glass_2);

  const attachment_chassis_underbody_3 = {"parentId": null, "parentSocket": "chassis-underbody-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["lineup-view"]};
  const endpoint_chassis_underbody_3 = makeAttachmentEndpoint(attachment_chassis_underbody_3);
  const node_chassis_underbody_3 = new THREE.Group();
  node_chassis_underbody_3.name = "Underbody Plate__pivot";
  if (endpoint_chassis_underbody_3) {
    node_chassis_underbody_3.position.copy(endpoint_chassis_underbody_3.start);
    node_chassis_underbody_3.rotation.set(0, 0, 0);
    node_chassis_underbody_3.scale.set(1, 1, 1);
  } else {
    node_chassis_underbody_3.position.set(0.0, 0.19, 0.0);
    node_chassis_underbody_3.rotation.set(0.0, 0.0, 0.0);
    node_chassis_underbody_3.scale.set(1.5, 0.12, 3.3);
  }
  node_chassis_underbody_3.userData.sculptComponent = {"id": "chassis-underbody", "name": "Underbody Plate", "level": "macro", "role": "underbody", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "chassis-underbody-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["lineup-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.5, "height": 0.12, "depth": 3.3}, "transform": {"position": [0.0, 0.19, 0.0], "rotation": [0, 0, 0], "scale": [1.5, 0.12, 3.3]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["lineup-view"], "details": [], "fidelityTier": "blockout"};
  node_chassis_underbody_3.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_chassis_underbody_3);
  nodes["chassis-underbody"] = node_chassis_underbody_3;
  const mesh_chassis_underbody_3Geometry = endpoint_chassis_underbody_3
    ? new THREE.CylinderGeometry(endpoint_chassis_underbody_3.endRadius, endpoint_chassis_underbody_3.baseRadius, endpoint_chassis_underbody_3.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_chassis_underbody_3 = new THREE.Mesh(
    mesh_chassis_underbody_3Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_chassis_underbody_3.name = "Underbody Plate";
  if (endpoint_chassis_underbody_3) {
    mesh_chassis_underbody_3.position.copy(endpoint_chassis_underbody_3.midpoint);
    mesh_chassis_underbody_3.quaternion.copy(endpoint_chassis_underbody_3.quaternion);
  }
  mesh_chassis_underbody_3.castShadow = options.castShadow ?? true;
  mesh_chassis_underbody_3.receiveShadow = options.receiveShadow ?? true;
  mesh_chassis_underbody_3.userData.sculptComponent = {"id": "chassis-underbody", "name": "Underbody Plate", "level": "macro", "role": "underbody", "importance": 1.0, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "chassis-underbody-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["lineup-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.5, "height": 0.12, "depth": 3.3}, "transform": {"position": [0.0, 0.19, 0.0], "rotation": [0, 0, 0], "scale": [1.5, 0.12, 3.3]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["lineup-view"], "details": [], "fidelityTier": "blockout"};
  node_chassis_underbody_3.add(mesh_chassis_underbody_3);
  meshes["chassis-underbody"] = mesh_chassis_underbody_3;
  colliders["chassis-underbody"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_chassis_underbody_3);

  const attachment_hood_4 = {"parentId": null, "parentSocket": "hood-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["top-view", "front-view"]};
  const endpoint_hood_4 = makeAttachmentEndpoint(attachment_hood_4);
  const node_hood_4 = new THREE.Group();
  node_hood_4.name = "Hood Panel__pivot";
  if (endpoint_hood_4) {
    node_hood_4.position.copy(endpoint_hood_4.start);
    node_hood_4.rotation.set(0, 0, 0);
    node_hood_4.scale.set(1, 1, 1);
  } else {
    node_hood_4.position.set(0.0, 1.43, 1.475);
    node_hood_4.rotation.set(0.0, 0.0, 0.0);
    node_hood_4.scale.set(1.45, 0.06, 0.95);
  }
  node_hood_4.userData.sculptComponent = {"id": "hood", "name": "Hood Panel", "level": "meso", "role": "panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "hood-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["top-view", "front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.45, "height": 0.06, "depth": 0.95}, "transform": {"position": [0.0, 1.43, 1.475], "rotation": [0, 0, 0], "scale": [1.45, 0.06, 0.95]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [], "seams": [{"id": "hood-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "hood-vents", "kind": "groove", "description": "two small hood-latch bumps near the cowl plus faint louvered vent lines on the hood top", "geometry": "low-relief grooves, amplitude 0.01, near windshield-frame edge", "evidenceRef": "top-view", "confidence": 0.75}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["top-view", "front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_hood_4.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}};
  (nodes["root"] ?? root).add(node_hood_4);
  nodes["hood"] = node_hood_4;
  const mesh_hood_4Geometry = endpoint_hood_4
    ? new THREE.CylinderGeometry(endpoint_hood_4.endRadius, endpoint_hood_4.baseRadius, endpoint_hood_4.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_hood_4 = new THREE.Mesh(
    mesh_hood_4Geometry,
    materialMap["mat-body-paint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hood_4.name = "Hood Panel";
  if (endpoint_hood_4) {
    mesh_hood_4.position.copy(endpoint_hood_4.midpoint);
    mesh_hood_4.quaternion.copy(endpoint_hood_4.quaternion);
  }
  mesh_hood_4.castShadow = options.castShadow ?? true;
  mesh_hood_4.receiveShadow = options.receiveShadow ?? true;
  mesh_hood_4.userData.sculptComponent = {"id": "hood", "name": "Hood Panel", "level": "meso", "role": "panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "hood-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["top-view", "front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.45, "height": 0.06, "depth": 0.95}, "transform": {"position": [0.0, 1.43, 1.475], "rotation": [0, 0, 0], "scale": [1.45, 0.06, 0.95]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [], "seams": [{"id": "hood-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "hood-vents", "kind": "groove", "description": "two small hood-latch bumps near the cowl plus faint louvered vent lines on the hood top", "geometry": "low-relief grooves, amplitude 0.01, near windshield-frame edge", "evidenceRef": "top-view", "confidence": 0.75}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["top-view", "front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_hood_4.add(mesh_hood_4);
  meshes["hood"] = mesh_hood_4;
  colliders["hood"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_hood_4);

  const attachment_grille_5 = {"parentId": null, "parentSocket": "grille-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view", "top-view"]};
  const endpoint_grille_5 = makeAttachmentEndpoint(attachment_grille_5);
  const node_grille_5 = new THREE.Group();
  node_grille_5.name = "Front Grille__pivot";
  if (endpoint_grille_5) {
    node_grille_5.position.copy(endpoint_grille_5.start);
    node_grille_5.rotation.set(0, 0, 0);
    node_grille_5.scale.set(1, 1, 1);
  } else {
    node_grille_5.position.set(0.0, 0.95, 1.98);
    node_grille_5.rotation.set(0.0, 0.0, 0.0);
    node_grille_5.scale.set(0.62, 0.42, 0.06);
  }
  node_grille_5.userData.sculptComponent = {"id": "grille", "name": "Front Grille", "level": "meso", "role": "panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "grille-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view", "top-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.62, "height": 0.42, "depth": 0.06}, "transform": {"position": [0.0, 0.95, 1.98], "rotation": [0, 0, 0], "scale": [0.62, 0.42, 0.06]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "grille-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "grille-slats", "kind": "linework", "description": "7 evenly spaced vertical black slats across the grille face, each with a recessed AO gap", "geometry": "7x thin raised ridge strips, ~0.06 width, 0.01 relief, spanning grille height", "evidenceRef": "front-view", "confidence": 0.95}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view", "top-view"], "details": [], "fidelityTier": "structural-pass"};
  node_grille_5.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_grille_5);
  nodes["grille"] = node_grille_5;
  const mesh_grille_5Geometry = endpoint_grille_5
    ? new THREE.CylinderGeometry(endpoint_grille_5.endRadius, endpoint_grille_5.baseRadius, endpoint_grille_5.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_grille_5 = new THREE.Mesh(
    mesh_grille_5Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_grille_5.name = "Front Grille";
  if (endpoint_grille_5) {
    mesh_grille_5.position.copy(endpoint_grille_5.midpoint);
    mesh_grille_5.quaternion.copy(endpoint_grille_5.quaternion);
  }
  mesh_grille_5.castShadow = options.castShadow ?? true;
  mesh_grille_5.receiveShadow = options.receiveShadow ?? true;
  mesh_grille_5.userData.sculptComponent = {"id": "grille", "name": "Front Grille", "level": "meso", "role": "panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "grille-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view", "top-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.62, "height": 0.42, "depth": 0.06}, "transform": {"position": [0.0, 0.95, 1.98], "rotation": [0, 0, 0], "scale": [0.62, 0.42, 0.06]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "grille-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "grille-slats", "kind": "linework", "description": "7 evenly spaced vertical black slats across the grille face, each with a recessed AO gap", "geometry": "7x thin raised ridge strips, ~0.06 width, 0.01 relief, spanning grille height", "evidenceRef": "front-view", "confidence": 0.95}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view", "top-view"], "details": [], "fidelityTier": "structural-pass"};
  node_grille_5.add(mesh_grille_5);
  meshes["grille"] = mesh_grille_5;
  colliders["grille"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_grille_5);

  const attachment_bumper_front_6 = {"parentId": null, "parentSocket": "bumper-front-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view", "three-quarter-front-view"]};
  const endpoint_bumper_front_6 = makeAttachmentEndpoint(attachment_bumper_front_6);
  const node_bumper_front_6 = new THREE.Group();
  node_bumper_front_6.name = "Front Bumper__pivot";
  if (endpoint_bumper_front_6) {
    node_bumper_front_6.position.copy(endpoint_bumper_front_6.start);
    node_bumper_front_6.rotation.set(0, 0, 0);
    node_bumper_front_6.scale.set(1, 1, 1);
  } else {
    node_bumper_front_6.position.set(0.0, 0.45, 2.075);
    node_bumper_front_6.rotation.set(0.0, 0.0, 0.0);
    node_bumper_front_6.scale.set(1.7, 0.35, 0.25);
  }
  node_bumper_front_6.userData.sculptComponent = {"id": "bumper-front", "name": "Front Bumper", "level": "meso", "role": "bumper", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "bumper-front-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view", "three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.7, "height": 0.35, "depth": 0.25}, "transform": {"position": [0.0, 0.45, 2.075], "rotation": [0, 0, 0], "scale": [1.7, 0.35, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "bumper-front-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "tow-hook-left", "kind": "hole", "description": "small dark tow-hook loop near the left bumper end", "geometry": "torus/hole cut, radius 0.03", "evidenceRef": "three-quarter-front-view", "confidence": 0.8}, {"id": "tow-hook-right", "kind": "hole", "description": "mirror tow hook at the right bumper end", "geometry": "torus/hole cut, radius 0.03", "evidenceRef": "front-view", "confidence": 0.8}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view", "three-quarter-front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_bumper_front_6.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_bumper_front_6);
  nodes["bumper-front"] = node_bumper_front_6;
  const mesh_bumper_front_6Geometry = endpoint_bumper_front_6
    ? new THREE.CylinderGeometry(endpoint_bumper_front_6.endRadius, endpoint_bumper_front_6.baseRadius, endpoint_bumper_front_6.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_bumper_front_6 = new THREE.Mesh(
    mesh_bumper_front_6Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bumper_front_6.name = "Front Bumper";
  if (endpoint_bumper_front_6) {
    mesh_bumper_front_6.position.copy(endpoint_bumper_front_6.midpoint);
    mesh_bumper_front_6.quaternion.copy(endpoint_bumper_front_6.quaternion);
  }
  mesh_bumper_front_6.castShadow = options.castShadow ?? true;
  mesh_bumper_front_6.receiveShadow = options.receiveShadow ?? true;
  mesh_bumper_front_6.userData.sculptComponent = {"id": "bumper-front", "name": "Front Bumper", "level": "meso", "role": "bumper", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "bumper-front-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view", "three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.7, "height": 0.35, "depth": 0.25}, "transform": {"position": [0.0, 0.45, 2.075], "rotation": [0, 0, 0], "scale": [1.7, 0.35, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "bumper-front-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "tow-hook-left", "kind": "hole", "description": "small dark tow-hook loop near the left bumper end", "geometry": "torus/hole cut, radius 0.03", "evidenceRef": "three-quarter-front-view", "confidence": 0.8}, {"id": "tow-hook-right", "kind": "hole", "description": "mirror tow hook at the right bumper end", "geometry": "torus/hole cut, radius 0.03", "evidenceRef": "front-view", "confidence": 0.8}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view", "three-quarter-front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_bumper_front_6.add(mesh_bumper_front_6);
  meshes["bumper-front"] = mesh_bumper_front_6;
  colliders["bumper-front"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_bumper_front_6);

  const attachment_bumper_rear_7 = {"parentId": null, "parentSocket": "bumper-rear-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]};
  const endpoint_bumper_rear_7 = makeAttachmentEndpoint(attachment_bumper_rear_7);
  const node_bumper_rear_7 = new THREE.Group();
  node_bumper_rear_7.name = "Rear Bumper__pivot";
  if (endpoint_bumper_rear_7) {
    node_bumper_rear_7.position.copy(endpoint_bumper_rear_7.start);
    node_bumper_rear_7.rotation.set(0, 0, 0);
    node_bumper_rear_7.scale.set(1, 1, 1);
  } else {
    node_bumper_rear_7.position.set(0.0, 0.45, -2.075);
    node_bumper_rear_7.rotation.set(0.0, 0.0, 0.0);
    node_bumper_rear_7.scale.set(1.7, 0.35, 0.25);
  }
  node_bumper_rear_7.userData.sculptComponent = {"id": "bumper-rear", "name": "Rear Bumper", "level": "meso", "role": "bumper", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "bumper-rear-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.7, "height": 0.35, "depth": 0.25}, "transform": {"position": [0.0, 0.45, -2.075], "rotation": [0, 0, 0], "scale": [1.7, 0.35, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "bumper-rear-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "tow-hook-rear", "kind": "hole", "description": "dark tow-hook loop centered under the rear bumper", "geometry": "torus/hole cut, radius 0.03", "evidenceRef": "rear-view", "confidence": 0.75}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_bumper_rear_7.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_bumper_rear_7);
  nodes["bumper-rear"] = node_bumper_rear_7;
  const mesh_bumper_rear_7Geometry = endpoint_bumper_rear_7
    ? new THREE.CylinderGeometry(endpoint_bumper_rear_7.endRadius, endpoint_bumper_rear_7.baseRadius, endpoint_bumper_rear_7.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_bumper_rear_7 = new THREE.Mesh(
    mesh_bumper_rear_7Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bumper_rear_7.name = "Rear Bumper";
  if (endpoint_bumper_rear_7) {
    mesh_bumper_rear_7.position.copy(endpoint_bumper_rear_7.midpoint);
    mesh_bumper_rear_7.quaternion.copy(endpoint_bumper_rear_7.quaternion);
  }
  mesh_bumper_rear_7.castShadow = options.castShadow ?? true;
  mesh_bumper_rear_7.receiveShadow = options.receiveShadow ?? true;
  mesh_bumper_rear_7.userData.sculptComponent = {"id": "bumper-rear", "name": "Rear Bumper", "level": "meso", "role": "bumper", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "bumper-rear-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.7, "height": 0.35, "depth": 0.25}, "transform": {"position": [0.0, 0.45, -2.075], "rotation": [0, 0, 0], "scale": [1.7, 0.35, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "bumper-rear-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "tow-hook-rear", "kind": "hole", "description": "dark tow-hook loop centered under the rear bumper", "geometry": "torus/hole cut, radius 0.03", "evidenceRef": "rear-view", "confidence": 0.75}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_bumper_rear_7.add(mesh_bumper_rear_7);
  meshes["bumper-rear"] = mesh_bumper_rear_7;
  colliders["bumper-rear"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_bumper_rear_7);

  const attachment_door_left_8 = {"parentId": null, "parentSocket": "door-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_door_left_8 = makeAttachmentEndpoint(attachment_door_left_8);
  const node_door_left_8 = new THREE.Group();
  node_door_left_8.name = "Left Door__pivot";
  if (endpoint_door_left_8) {
    node_door_left_8.position.copy(endpoint_door_left_8.start);
    node_door_left_8.rotation.set(0, 0, 0);
    node_door_left_8.scale.set(1, 1, 1);
  } else {
    node_door_left_8.position.set(-0.85, 0.9, 0.2);
    node_door_left_8.rotation.set(0.0, 0.0, 0.0);
    node_door_left_8.scale.set(0.05, 1.0, 1.05);
  }
  node_door_left_8.userData.sculptComponent = {"id": "door-left", "name": "Left Door", "level": "meso", "role": "door", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "door-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 1.0, "depth": 1.05}, "transform": {"position": [-0.85, 0.9, 0.2], "rotation": [0, 0, 0], "scale": [0.05, 1.0, 1.05]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [{"id": "door-left-hinge", "type": "hinge", "axis": [0, 1, 0], "parentRef": "root"}], "seams": [{"id": "door-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "door-handle-left", "kind": "seam", "description": "recessed black paddle door handle at mid-height plus the vertical door-gap seam", "geometry": "handle: small raised box 0.10x0.03x0.02; seam: 1-segment groove along door edge", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_door_left_8.userData.actionProfile = {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}};
  (nodes["root"] ?? root).add(node_door_left_8);
  nodes["door-left"] = node_door_left_8;
  const mesh_door_left_8Geometry = endpoint_door_left_8
    ? new THREE.CylinderGeometry(endpoint_door_left_8.endRadius, endpoint_door_left_8.baseRadius, endpoint_door_left_8.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_door_left_8 = new THREE.Mesh(
    mesh_door_left_8Geometry,
    materialMap["mat-body-paint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_door_left_8.name = "Left Door";
  if (endpoint_door_left_8) {
    mesh_door_left_8.position.copy(endpoint_door_left_8.midpoint);
    mesh_door_left_8.quaternion.copy(endpoint_door_left_8.quaternion);
  }
  mesh_door_left_8.castShadow = options.castShadow ?? true;
  mesh_door_left_8.receiveShadow = options.receiveShadow ?? true;
  mesh_door_left_8.userData.sculptComponent = {"id": "door-left", "name": "Left Door", "level": "meso", "role": "door", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "door-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 1.0, "depth": 1.05}, "transform": {"position": [-0.85, 0.9, 0.2], "rotation": [0, 0, 0], "scale": [0.05, 1.0, 1.05]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [{"id": "door-left-hinge", "type": "hinge", "axis": [0, 1, 0], "parentRef": "root"}], "seams": [{"id": "door-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "door-handle-left", "kind": "seam", "description": "recessed black paddle door handle at mid-height plus the vertical door-gap seam", "geometry": "handle: small raised box 0.10x0.03x0.02; seam: 1-segment groove along door edge", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_door_left_8.add(mesh_door_left_8);
  meshes["door-left"] = mesh_door_left_8;
  colliders["door-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_door_left_8);

  const attachment_door_right_9 = {"parentId": null, "parentSocket": "door-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_door_right_9 = makeAttachmentEndpoint(attachment_door_right_9);
  const node_door_right_9 = new THREE.Group();
  node_door_right_9.name = "Right Door__pivot";
  if (endpoint_door_right_9) {
    node_door_right_9.position.copy(endpoint_door_right_9.start);
    node_door_right_9.rotation.set(0, 0, 0);
    node_door_right_9.scale.set(1, 1, 1);
  } else {
    node_door_right_9.position.set(0.85, 0.9, 0.2);
    node_door_right_9.rotation.set(0.0, 0.0, 0.0);
    node_door_right_9.scale.set(0.05, 1.0, 1.05);
  }
  node_door_right_9.userData.sculptComponent = {"id": "door-right", "name": "Right Door", "level": "meso", "role": "door", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "door-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 1.0, "depth": 1.05}, "transform": {"position": [0.85, 0.9, 0.2], "rotation": [0, 0, 0], "scale": [0.05, 1.0, 1.05]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [{"id": "door-right-hinge", "type": "hinge", "axis": [0, 1, 0], "parentRef": "root"}], "seams": [{"id": "door-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "door-handle-right", "kind": "seam", "description": "mirror of door-handle-left on the right flank", "geometry": "handle: small raised box 0.10x0.03x0.02; seam: 1-segment groove along door edge", "evidenceRef": "side-view", "confidence": 0.8}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_door_right_9.userData.actionProfile = {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}};
  (nodes["root"] ?? root).add(node_door_right_9);
  nodes["door-right"] = node_door_right_9;
  const mesh_door_right_9Geometry = endpoint_door_right_9
    ? new THREE.CylinderGeometry(endpoint_door_right_9.endRadius, endpoint_door_right_9.baseRadius, endpoint_door_right_9.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_door_right_9 = new THREE.Mesh(
    mesh_door_right_9Geometry,
    materialMap["mat-body-paint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_door_right_9.name = "Right Door";
  if (endpoint_door_right_9) {
    mesh_door_right_9.position.copy(endpoint_door_right_9.midpoint);
    mesh_door_right_9.quaternion.copy(endpoint_door_right_9.quaternion);
  }
  mesh_door_right_9.castShadow = options.castShadow ?? true;
  mesh_door_right_9.receiveShadow = options.receiveShadow ?? true;
  mesh_door_right_9.userData.sculptComponent = {"id": "door-right", "name": "Right Door", "level": "meso", "role": "door", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "door-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 1.0, "depth": 1.05}, "transform": {"position": [0.85, 0.9, 0.2], "rotation": [0, 0, 0], "scale": [0.05, 1.0, 1.05]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [{"id": "door-right-hinge", "type": "hinge", "axis": [0, 1, 0], "parentRef": "root"}], "seams": [{"id": "door-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "door-handle-right", "kind": "seam", "description": "mirror of door-handle-left on the right flank", "geometry": "handle: small raised box 0.10x0.03x0.02; seam: 1-segment groove along door edge", "evidenceRef": "side-view", "confidence": 0.8}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_door_right_9.add(mesh_door_right_9);
  meshes["door-right"] = mesh_door_right_9;
  colliders["door-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_door_right_9);

  const attachment_rocker_panel_left_10 = {"parentId": null, "parentSocket": "rocker-panel-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_rocker_panel_left_10 = makeAttachmentEndpoint(attachment_rocker_panel_left_10);
  const node_rocker_panel_left_10 = new THREE.Group();
  node_rocker_panel_left_10.name = "Left Rocker Rail__pivot";
  if (endpoint_rocker_panel_left_10) {
    node_rocker_panel_left_10.position.copy(endpoint_rocker_panel_left_10.start);
    node_rocker_panel_left_10.rotation.set(0, 0, 0);
    node_rocker_panel_left_10.scale.set(1, 1, 1);
  } else {
    node_rocker_panel_left_10.position.set(-0.865, 0.3, -0.1);
    node_rocker_panel_left_10.rotation.set(0.0, 0.0, 0.0);
    node_rocker_panel_left_10.scale.set(0.08, 0.15, 2.2);
  }
  node_rocker_panel_left_10.userData.sculptComponent = {"id": "rocker-panel-left", "name": "Left Rocker Rail", "level": "meso", "role": "rocker-rail", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rocker-panel-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.08, "height": 0.15, "depth": 2.2}, "transform": {"position": [-0.865, 0.3, -0.1], "rotation": [0, 0, 0], "scale": [0.08, 0.15, 2.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "rocker-panel-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "rock-rail-left", "kind": "ridge", "description": "tubular rock rail raised ridge running the full rocker length", "geometry": "raised ridge, radius 0.04, spans rocker depth", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_rocker_panel_left_10.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_rocker_panel_left_10);
  nodes["rocker-panel-left"] = node_rocker_panel_left_10;
  const mesh_rocker_panel_left_10Geometry = endpoint_rocker_panel_left_10
    ? new THREE.CylinderGeometry(endpoint_rocker_panel_left_10.endRadius, endpoint_rocker_panel_left_10.baseRadius, endpoint_rocker_panel_left_10.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_rocker_panel_left_10 = new THREE.Mesh(
    mesh_rocker_panel_left_10Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rocker_panel_left_10.name = "Left Rocker Rail";
  if (endpoint_rocker_panel_left_10) {
    mesh_rocker_panel_left_10.position.copy(endpoint_rocker_panel_left_10.midpoint);
    mesh_rocker_panel_left_10.quaternion.copy(endpoint_rocker_panel_left_10.quaternion);
  }
  mesh_rocker_panel_left_10.castShadow = options.castShadow ?? true;
  mesh_rocker_panel_left_10.receiveShadow = options.receiveShadow ?? true;
  mesh_rocker_panel_left_10.userData.sculptComponent = {"id": "rocker-panel-left", "name": "Left Rocker Rail", "level": "meso", "role": "rocker-rail", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rocker-panel-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.08, "height": 0.15, "depth": 2.2}, "transform": {"position": [-0.865, 0.3, -0.1], "rotation": [0, 0, 0], "scale": [0.08, 0.15, 2.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "rocker-panel-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "rock-rail-left", "kind": "ridge", "description": "tubular rock rail raised ridge running the full rocker length", "geometry": "raised ridge, radius 0.04, spans rocker depth", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_rocker_panel_left_10.add(mesh_rocker_panel_left_10);
  meshes["rocker-panel-left"] = mesh_rocker_panel_left_10;
  colliders["rocker-panel-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_rocker_panel_left_10);

  const attachment_rocker_panel_right_11 = {"parentId": null, "parentSocket": "rocker-panel-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_rocker_panel_right_11 = makeAttachmentEndpoint(attachment_rocker_panel_right_11);
  const node_rocker_panel_right_11 = new THREE.Group();
  node_rocker_panel_right_11.name = "Right Rocker Rail__pivot";
  if (endpoint_rocker_panel_right_11) {
    node_rocker_panel_right_11.position.copy(endpoint_rocker_panel_right_11.start);
    node_rocker_panel_right_11.rotation.set(0, 0, 0);
    node_rocker_panel_right_11.scale.set(1, 1, 1);
  } else {
    node_rocker_panel_right_11.position.set(0.865, 0.3, -0.1);
    node_rocker_panel_right_11.rotation.set(0.0, 0.0, 0.0);
    node_rocker_panel_right_11.scale.set(0.08, 0.15, 2.2);
  }
  node_rocker_panel_right_11.userData.sculptComponent = {"id": "rocker-panel-right", "name": "Right Rocker Rail", "level": "meso", "role": "rocker-rail", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rocker-panel-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.08, "height": 0.15, "depth": 2.2}, "transform": {"position": [0.865, 0.3, -0.1], "rotation": [0, 0, 0], "scale": [0.08, 0.15, 2.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "rocker-panel-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "rock-rail-right", "kind": "ridge", "description": "mirror rock rail on the right flank", "geometry": "raised ridge, radius 0.04, spans rocker depth", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_rocker_panel_right_11.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_rocker_panel_right_11);
  nodes["rocker-panel-right"] = node_rocker_panel_right_11;
  const mesh_rocker_panel_right_11Geometry = endpoint_rocker_panel_right_11
    ? new THREE.CylinderGeometry(endpoint_rocker_panel_right_11.endRadius, endpoint_rocker_panel_right_11.baseRadius, endpoint_rocker_panel_right_11.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_rocker_panel_right_11 = new THREE.Mesh(
    mesh_rocker_panel_right_11Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rocker_panel_right_11.name = "Right Rocker Rail";
  if (endpoint_rocker_panel_right_11) {
    mesh_rocker_panel_right_11.position.copy(endpoint_rocker_panel_right_11.midpoint);
    mesh_rocker_panel_right_11.quaternion.copy(endpoint_rocker_panel_right_11.quaternion);
  }
  mesh_rocker_panel_right_11.castShadow = options.castShadow ?? true;
  mesh_rocker_panel_right_11.receiveShadow = options.receiveShadow ?? true;
  mesh_rocker_panel_right_11.userData.sculptComponent = {"id": "rocker-panel-right", "name": "Right Rocker Rail", "level": "meso", "role": "rocker-rail", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rocker-panel-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.08, "height": 0.15, "depth": 2.2}, "transform": {"position": [0.865, 0.3, -0.1], "rotation": [0, 0, 0], "scale": [0.08, 0.15, 2.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "rocker-panel-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "rock-rail-right", "kind": "ridge", "description": "mirror rock rail on the right flank", "geometry": "raised ridge, radius 0.04, spans rocker depth", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_rocker_panel_right_11.add(mesh_rocker_panel_right_11);
  meshes["rocker-panel-right"] = mesh_rocker_panel_right_11;
  colliders["rocker-panel-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_rocker_panel_right_11);

  const attachment_fender_front_left_12 = {"parentId": null, "parentSocket": "fender-front-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "three-quarter-front-view"]};
  const endpoint_fender_front_left_12 = makeAttachmentEndpoint(attachment_fender_front_left_12);
  const node_fender_front_left_12 = new THREE.Group();
  node_fender_front_left_12.name = "Front-Left Fender Flare__pivot";
  if (endpoint_fender_front_left_12) {
    node_fender_front_left_12.position.copy(endpoint_fender_front_left_12.start);
    node_fender_front_left_12.rotation.set(0, 0, 0);
    node_fender_front_left_12.scale.set(1, 1, 1);
  } else {
    node_fender_front_left_12.position.set(-0.915, 0.6, 0.9);
    node_fender_front_left_12.rotation.set(0.0, 0.0, 0.0);
    node_fender_front_left_12.scale.set(0.18, 0.55, 0.75);
  }
  node_fender_front_left_12.userData.sculptComponent = {"id": "fender-front-left", "name": "Front-Left Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-front-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [-0.915, 0.6, 0.9], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-front-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-fl", "kind": "seam", "description": "panel seam where the matte-black flare wraps the wheel opening, distinct from body paint", "geometry": "recessed groove + material color break at flare perimeter", "evidenceRef": "side-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "three-quarter-front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_front_left_12.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_fender_front_left_12);
  nodes["fender-front-left"] = node_fender_front_left_12;
  const mesh_fender_front_left_12Geometry = endpoint_fender_front_left_12
    ? new THREE.CylinderGeometry(endpoint_fender_front_left_12.endRadius, endpoint_fender_front_left_12.baseRadius, endpoint_fender_front_left_12.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_fender_front_left_12 = new THREE.Mesh(
    mesh_fender_front_left_12Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fender_front_left_12.name = "Front-Left Fender Flare";
  if (endpoint_fender_front_left_12) {
    mesh_fender_front_left_12.position.copy(endpoint_fender_front_left_12.midpoint);
    mesh_fender_front_left_12.quaternion.copy(endpoint_fender_front_left_12.quaternion);
  }
  mesh_fender_front_left_12.castShadow = options.castShadow ?? true;
  mesh_fender_front_left_12.receiveShadow = options.receiveShadow ?? true;
  mesh_fender_front_left_12.userData.sculptComponent = {"id": "fender-front-left", "name": "Front-Left Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-front-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [-0.915, 0.6, 0.9], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-front-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-fl", "kind": "seam", "description": "panel seam where the matte-black flare wraps the wheel opening, distinct from body paint", "geometry": "recessed groove + material color break at flare perimeter", "evidenceRef": "side-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "three-quarter-front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_front_left_12.add(mesh_fender_front_left_12);
  meshes["fender-front-left"] = mesh_fender_front_left_12;
  colliders["fender-front-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_fender_front_left_12);

  const attachment_fender_front_right_13 = {"parentId": null, "parentSocket": "fender-front-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]};
  const endpoint_fender_front_right_13 = makeAttachmentEndpoint(attachment_fender_front_right_13);
  const node_fender_front_right_13 = new THREE.Group();
  node_fender_front_right_13.name = "Front-Right Fender Flare__pivot";
  if (endpoint_fender_front_right_13) {
    node_fender_front_right_13.position.copy(endpoint_fender_front_right_13.start);
    node_fender_front_right_13.rotation.set(0, 0, 0);
    node_fender_front_right_13.scale.set(1, 1, 1);
  } else {
    node_fender_front_right_13.position.set(0.915, 0.6, 0.9);
    node_fender_front_right_13.rotation.set(0.0, 0.0, 0.0);
    node_fender_front_right_13.scale.set(0.18, 0.55, 0.75);
  }
  node_fender_front_right_13.userData.sculptComponent = {"id": "fender-front-right", "name": "Front-Right Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-front-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [0.915, 0.6, 0.9], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-front-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-fr", "kind": "seam", "description": "mirror of flare-seam-fl", "geometry": "recessed groove + material color break", "evidenceRef": "front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_front_right_13.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_fender_front_right_13);
  nodes["fender-front-right"] = node_fender_front_right_13;
  const mesh_fender_front_right_13Geometry = endpoint_fender_front_right_13
    ? new THREE.CylinderGeometry(endpoint_fender_front_right_13.endRadius, endpoint_fender_front_right_13.baseRadius, endpoint_fender_front_right_13.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_fender_front_right_13 = new THREE.Mesh(
    mesh_fender_front_right_13Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fender_front_right_13.name = "Front-Right Fender Flare";
  if (endpoint_fender_front_right_13) {
    mesh_fender_front_right_13.position.copy(endpoint_fender_front_right_13.midpoint);
    mesh_fender_front_right_13.quaternion.copy(endpoint_fender_front_right_13.quaternion);
  }
  mesh_fender_front_right_13.castShadow = options.castShadow ?? true;
  mesh_fender_front_right_13.receiveShadow = options.receiveShadow ?? true;
  mesh_fender_front_right_13.userData.sculptComponent = {"id": "fender-front-right", "name": "Front-Right Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-front-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [0.915, 0.6, 0.9], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-front-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-fr", "kind": "seam", "description": "mirror of flare-seam-fl", "geometry": "recessed groove + material color break", "evidenceRef": "front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_front_right_13.add(mesh_fender_front_right_13);
  meshes["fender-front-right"] = mesh_fender_front_right_13;
  colliders["fender-front-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_fender_front_right_13);

  const attachment_fender_rear_left_14 = {"parentId": null, "parentSocket": "fender-rear-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_fender_rear_left_14 = makeAttachmentEndpoint(attachment_fender_rear_left_14);
  const node_fender_rear_left_14 = new THREE.Group();
  node_fender_rear_left_14.name = "Rear-Left Fender Flare__pivot";
  if (endpoint_fender_rear_left_14) {
    node_fender_rear_left_14.position.copy(endpoint_fender_rear_left_14.start);
    node_fender_rear_left_14.rotation.set(0, 0, 0);
    node_fender_rear_left_14.scale.set(1, 1, 1);
  } else {
    node_fender_rear_left_14.position.set(-0.915, 0.6, -1.7);
    node_fender_rear_left_14.rotation.set(0.0, 0.0, 0.0);
    node_fender_rear_left_14.scale.set(0.18, 0.55, 0.75);
  }
  node_fender_rear_left_14.userData.sculptComponent = {"id": "fender-rear-left", "name": "Rear-Left Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-rear-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [-0.915, 0.6, -1.7], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-rear-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-rl", "kind": "seam", "description": "mirror flare seam at rear-left wheel opening", "geometry": "recessed groove + material color break", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_rear_left_14.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_fender_rear_left_14);
  nodes["fender-rear-left"] = node_fender_rear_left_14;
  const mesh_fender_rear_left_14Geometry = endpoint_fender_rear_left_14
    ? new THREE.CylinderGeometry(endpoint_fender_rear_left_14.endRadius, endpoint_fender_rear_left_14.baseRadius, endpoint_fender_rear_left_14.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_fender_rear_left_14 = new THREE.Mesh(
    mesh_fender_rear_left_14Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fender_rear_left_14.name = "Rear-Left Fender Flare";
  if (endpoint_fender_rear_left_14) {
    mesh_fender_rear_left_14.position.copy(endpoint_fender_rear_left_14.midpoint);
    mesh_fender_rear_left_14.quaternion.copy(endpoint_fender_rear_left_14.quaternion);
  }
  mesh_fender_rear_left_14.castShadow = options.castShadow ?? true;
  mesh_fender_rear_left_14.receiveShadow = options.receiveShadow ?? true;
  mesh_fender_rear_left_14.userData.sculptComponent = {"id": "fender-rear-left", "name": "Rear-Left Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-rear-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [-0.915, 0.6, -1.7], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-rear-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-rl", "kind": "seam", "description": "mirror flare seam at rear-left wheel opening", "geometry": "recessed groove + material color break", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_rear_left_14.add(mesh_fender_rear_left_14);
  meshes["fender-rear-left"] = mesh_fender_rear_left_14;
  colliders["fender-rear-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_fender_rear_left_14);

  const attachment_fender_rear_right_15 = {"parentId": null, "parentSocket": "fender-rear-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]};
  const endpoint_fender_rear_right_15 = makeAttachmentEndpoint(attachment_fender_rear_right_15);
  const node_fender_rear_right_15 = new THREE.Group();
  node_fender_rear_right_15.name = "Rear-Right Fender Flare__pivot";
  if (endpoint_fender_rear_right_15) {
    node_fender_rear_right_15.position.copy(endpoint_fender_rear_right_15.start);
    node_fender_rear_right_15.rotation.set(0, 0, 0);
    node_fender_rear_right_15.scale.set(1, 1, 1);
  } else {
    node_fender_rear_right_15.position.set(0.915, 0.6, -1.7);
    node_fender_rear_right_15.rotation.set(0.0, 0.0, 0.0);
    node_fender_rear_right_15.scale.set(0.18, 0.55, 0.75);
  }
  node_fender_rear_right_15.userData.sculptComponent = {"id": "fender-rear-right", "name": "Rear-Right Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-rear-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [0.915, 0.6, -1.7], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-rear-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-rr", "kind": "seam", "description": "mirror flare seam at rear-right wheel opening", "geometry": "recessed groove + material color break", "evidenceRef": "three-quarter-rear-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_rear_right_15.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_fender_rear_right_15);
  nodes["fender-rear-right"] = node_fender_rear_right_15;
  const mesh_fender_rear_right_15Geometry = endpoint_fender_rear_right_15
    ? new THREE.CylinderGeometry(endpoint_fender_rear_right_15.endRadius, endpoint_fender_rear_right_15.baseRadius, endpoint_fender_rear_right_15.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_fender_rear_right_15 = new THREE.Mesh(
    mesh_fender_rear_right_15Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fender_rear_right_15.name = "Rear-Right Fender Flare";
  if (endpoint_fender_rear_right_15) {
    mesh_fender_rear_right_15.position.copy(endpoint_fender_rear_right_15.midpoint);
    mesh_fender_rear_right_15.quaternion.copy(endpoint_fender_rear_right_15.quaternion);
  }
  mesh_fender_rear_right_15.castShadow = options.castShadow ?? true;
  mesh_fender_rear_right_15.receiveShadow = options.receiveShadow ?? true;
  mesh_fender_rear_right_15.userData.sculptComponent = {"id": "fender-rear-right", "name": "Rear-Right Fender Flare", "level": "meso", "role": "fender-flare", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "fender-rear-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.18, "height": 0.55, "depth": 0.75}, "transform": {"position": [0.915, 0.6, -1.7], "rotation": [0, 0, 0], "scale": [0.18, 0.55, 0.75]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "fender-rear-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "flare-seam-rr", "kind": "seam", "description": "mirror flare seam at rear-right wheel opening", "geometry": "recessed groove + material color break", "evidenceRef": "three-quarter-rear-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_fender_rear_right_15.add(mesh_fender_rear_right_15);
  meshes["fender-rear-right"] = mesh_fender_rear_right_15;
  colliders["fender-rear-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_fender_rear_right_15);

  const attachment_windshield_frame_16 = {"parentId": null, "parentSocket": "windshield-frame-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["top-view", "front-view"]};
  const endpoint_windshield_frame_16 = makeAttachmentEndpoint(attachment_windshield_frame_16);
  const node_windshield_frame_16 = new THREE.Group();
  node_windshield_frame_16.name = "Windshield Base Frame__pivot";
  if (endpoint_windshield_frame_16) {
    node_windshield_frame_16.position.copy(endpoint_windshield_frame_16.start);
    node_windshield_frame_16.rotation.set(0, 0, 0);
    node_windshield_frame_16.scale.set(1, 1, 1);
  } else {
    node_windshield_frame_16.position.set(0.0, 1.43, 0.83);
    node_windshield_frame_16.rotation.set(0.0, 0.0, 0.0);
    node_windshield_frame_16.scale.set(1.4, 0.06, 0.08);
  }
  node_windshield_frame_16.userData.sculptComponent = {"id": "windshield-frame", "name": "Windshield Base Frame", "level": "meso", "role": "frame", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "windshield-frame-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["top-view", "front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.4, "height": 0.06, "depth": 0.08}, "transform": {"position": [0.0, 1.43, 0.83], "rotation": [0, 0, 0], "scale": [1.4, 0.06, 0.08]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "windshield-frame-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "wiper-arms", "kind": "linework", "description": "two thin black wiper arms resting diagonally at the windshield base", "geometry": "2x thin cylinder/curve-sweep arms, radius 0.006, crossing at shallow angle", "evidenceRef": "top-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["top-view", "front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_windshield_frame_16.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_windshield_frame_16);
  nodes["windshield-frame"] = node_windshield_frame_16;
  const mesh_windshield_frame_16Geometry = endpoint_windshield_frame_16
    ? new THREE.CylinderGeometry(endpoint_windshield_frame_16.endRadius, endpoint_windshield_frame_16.baseRadius, endpoint_windshield_frame_16.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_windshield_frame_16 = new THREE.Mesh(
    mesh_windshield_frame_16Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_windshield_frame_16.name = "Windshield Base Frame";
  if (endpoint_windshield_frame_16) {
    mesh_windshield_frame_16.position.copy(endpoint_windshield_frame_16.midpoint);
    mesh_windshield_frame_16.quaternion.copy(endpoint_windshield_frame_16.quaternion);
  }
  mesh_windshield_frame_16.castShadow = options.castShadow ?? true;
  mesh_windshield_frame_16.receiveShadow = options.receiveShadow ?? true;
  mesh_windshield_frame_16.userData.sculptComponent = {"id": "windshield-frame", "name": "Windshield Base Frame", "level": "meso", "role": "frame", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "windshield-frame-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["top-view", "front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.4, "height": 0.06, "depth": 0.08}, "transform": {"position": [0.0, 1.43, 0.83], "rotation": [0, 0, 0], "scale": [1.4, 0.06, 0.08]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "windshield-frame-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "wiper-arms", "kind": "linework", "description": "two thin black wiper arms resting diagonally at the windshield base", "geometry": "2x thin cylinder/curve-sweep arms, radius 0.006, crossing at shallow angle", "evidenceRef": "top-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["top-view", "front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_windshield_frame_16.add(mesh_windshield_frame_16);
  meshes["windshield-frame"] = mesh_windshield_frame_16;
  colliders["windshield-frame"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_windshield_frame_16);

  const attachment_tailgate_17 = {"parentId": null, "parentSocket": "tailgate-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]};
  const endpoint_tailgate_17 = makeAttachmentEndpoint(attachment_tailgate_17);
  const node_tailgate_17 = new THREE.Group();
  node_tailgate_17.name = "Tailgate__pivot";
  if (endpoint_tailgate_17) {
    node_tailgate_17.position.copy(endpoint_tailgate_17.start);
    node_tailgate_17.rotation.set(0, 0, 0);
    node_tailgate_17.scale.set(1, 1, 1);
  } else {
    node_tailgate_17.position.set(0.0, 0.7, -2.0);
    node_tailgate_17.rotation.set(0.0, 0.0, 0.0);
    node_tailgate_17.scale.set(1.5, 0.9, 0.1);
  }
  node_tailgate_17.userData.sculptComponent = {"id": "tailgate", "name": "Tailgate", "level": "meso", "role": "tailgate", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "tailgate-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.5, "height": 0.9, "depth": 0.1}, "transform": {"position": [0.0, 0.7, -2.0], "rotation": [0, 0, 0], "scale": [1.5, 0.9, 0.1]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "spare-tire-mount", "localPosition": [0.0, 0.0, -0.35], "localRotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "tailgate", "seamRefs": [], "detachableFragments": ["tailgate"], "breakImpulse": 4.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [{"id": "tailgate-hinge", "type": "hinge", "axis": [0, 1, 0], "parentRef": "root"}], "seams": [{"id": "tailgate-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "spare-tire-mount-bracket", "kind": "hole", "description": "swing-out bracket bolting the spare tire assembly to the tailgate, centered, overlapping the rear window sightline", "geometry": "bracket plate 0.3x0.3x0.05 plus socket for spare-tire attachment", "evidenceRef": "rear-view", "confidence": 0.95}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_tailgate_17.userData.actionProfile = {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "spare-tire-mount", "localPosition": [0.0, 0.0, -0.35], "localRotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "tailgate", "seamRefs": [], "detachableFragments": ["tailgate"], "breakImpulse": 4.0, "debrisMaterial": "mat-body-paint"}};
  (nodes["root"] ?? root).add(node_tailgate_17);
  nodes["tailgate"] = node_tailgate_17;
  const mesh_tailgate_17Geometry = endpoint_tailgate_17
    ? new THREE.CylinderGeometry(endpoint_tailgate_17.endRadius, endpoint_tailgate_17.baseRadius, endpoint_tailgate_17.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_tailgate_17 = new THREE.Mesh(
    mesh_tailgate_17Geometry,
    materialMap["mat-body-paint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tailgate_17.name = "Tailgate";
  if (endpoint_tailgate_17) {
    mesh_tailgate_17.position.copy(endpoint_tailgate_17.midpoint);
    mesh_tailgate_17.quaternion.copy(endpoint_tailgate_17.quaternion);
  }
  mesh_tailgate_17.castShadow = options.castShadow ?? true;
  mesh_tailgate_17.receiveShadow = options.receiveShadow ?? true;
  mesh_tailgate_17.userData.sculptComponent = {"id": "tailgate", "name": "Tailgate", "level": "meso", "role": "tailgate", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "tailgate-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 1.5, "height": 0.9, "depth": 0.1}, "transform": {"position": [0.0, 0.7, -2.0], "rotation": [0, 0, 0], "scale": [1.5, 0.9, 0.1]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "hinge-edge", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "spare-tire-mount", "localPosition": [0.0, 0.0, -0.35], "localRotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "tailgate", "seamRefs": [], "detachableFragments": ["tailgate"], "breakImpulse": 4.0, "debrisMaterial": "mat-body-paint"}}, "material": "mat-body-paint", "materialLayers": ["mat-body-paint"], "deformations": [], "joints": [{"id": "tailgate-hinge", "type": "hinge", "axis": [0, 1, 0], "parentRef": "root"}], "seams": [{"id": "tailgate-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "spare-tire-mount-bracket", "kind": "hole", "description": "swing-out bracket bolting the spare tire assembly to the tailgate, centered, overlapping the rear window sightline", "geometry": "bracket plate 0.3x0.3x0.05 plus socket for spare-tire attachment", "evidenceRef": "rear-view", "confidence": 0.95}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_tailgate_17.add(mesh_tailgate_17);
  meshes["tailgate"] = mesh_tailgate_17;
  colliders["tailgate"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["tailgate"] ??= [];
  destructionGroups["tailgate"].push(node_tailgate_17);
  const socket_tailgate_spare_tire_mount_0 = new THREE.Object3D();
  socket_tailgate_spare_tire_mount_0.name = "spare-tire-mount";
  socket_tailgate_spare_tire_mount_0.position.set(0.0, 0.0, -0.35);
  socket_tailgate_spare_tire_mount_0.rotation.set(0.0, 0.0, 0.0);
  socket_tailgate_spare_tire_mount_0.userData.socket = {"id": "spare-tire-mount", "localPosition": [0.0, 0.0, -0.35], "localRotation": [0, 0, 0]};
  node_tailgate_17.add(socket_tailgate_spare_tire_mount_0);
  sockets["tailgate:spare-tire-mount"] = socket_tailgate_spare_tire_mount_0;

  const attachment_wheel_front_left_18 = {"parentId": null, "parentSocket": "wheel-front-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "top-view"]};
  const endpoint_wheel_front_left_18 = makeAttachmentEndpoint(attachment_wheel_front_left_18);
  const node_wheel_front_left_18 = new THREE.Group();
  node_wheel_front_left_18.name = "Front-Left Wheel__pivot";
  if (endpoint_wheel_front_left_18) {
    node_wheel_front_left_18.position.copy(endpoint_wheel_front_left_18.start);
    node_wheel_front_left_18.rotation.set(0, 0, 0);
    node_wheel_front_left_18.scale.set(1, 1, 1);
  } else {
    node_wheel_front_left_18.position.set(-0.775, 0.415, 0.9);
    node_wheel_front_left_18.rotation.set(0.0, 0.0, 1.5707963);
    node_wheel_front_left_18.scale.set(0.83, 0.28, 0.83);
  }
  node_wheel_front_left_18.userData.sculptComponent = {"id": "wheel-front-left", "name": "Front-Left Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-front-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "top-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [-0.775, 0.415, 0.9], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-front-left-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-fl", "kind": "fastener", "description": "chunky repeated tread lug blocks around the tire circumference", "geometry": "InstancedMesh ring, ~28 lugs, radial distribution at tire OD", "evidenceRef": "side-view", "confidence": 0.9}, {"id": "rim-spokes-fl", "kind": "bevel", "description": "5-6 spoke dark alloy rim with center hub and lug nuts", "geometry": "lathe/extrude rim hub + 5x spoke wedges + 5x lug-nut instances", "evidenceRef": "three-quarter-front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "top-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_front_left_18.userData.actionProfile = {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}};
  (nodes["root"] ?? root).add(node_wheel_front_left_18);
  nodes["wheel-front-left"] = node_wheel_front_left_18;
  const mesh_wheel_front_left_18Geometry = endpoint_wheel_front_left_18
    ? new THREE.CylinderGeometry(endpoint_wheel_front_left_18.endRadius, endpoint_wheel_front_left_18.baseRadius, endpoint_wheel_front_left_18.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_wheel_front_left_18 = new THREE.Mesh(
    mesh_wheel_front_left_18Geometry,
    materialMap["mat-tire-rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_front_left_18.name = "Front-Left Wheel";
  if (endpoint_wheel_front_left_18) {
    mesh_wheel_front_left_18.position.copy(endpoint_wheel_front_left_18.midpoint);
    mesh_wheel_front_left_18.quaternion.copy(endpoint_wheel_front_left_18.quaternion);
  }
  mesh_wheel_front_left_18.castShadow = options.castShadow ?? true;
  mesh_wheel_front_left_18.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_front_left_18.userData.sculptComponent = {"id": "wheel-front-left", "name": "Front-Left Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-front-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view", "top-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [-0.775, 0.415, 0.9], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-front-left-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-fl", "kind": "fastener", "description": "chunky repeated tread lug blocks around the tire circumference", "geometry": "InstancedMesh ring, ~28 lugs, radial distribution at tire OD", "evidenceRef": "side-view", "confidence": 0.9}, {"id": "rim-spokes-fl", "kind": "bevel", "description": "5-6 spoke dark alloy rim with center hub and lug nuts", "geometry": "lathe/extrude rim hub + 5x spoke wedges + 5x lug-nut instances", "evidenceRef": "three-quarter-front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view", "top-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_front_left_18.add(mesh_wheel_front_left_18);
  meshes["wheel-front-left"] = mesh_wheel_front_left_18;
  colliders["wheel-front-left"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_wheel_front_left_18);

  const attachment_wheel_front_right_19 = {"parentId": null, "parentSocket": "wheel-front-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-front-view"]};
  const endpoint_wheel_front_right_19 = makeAttachmentEndpoint(attachment_wheel_front_right_19);
  const node_wheel_front_right_19 = new THREE.Group();
  node_wheel_front_right_19.name = "Front-Right Wheel__pivot";
  if (endpoint_wheel_front_right_19) {
    node_wheel_front_right_19.position.copy(endpoint_wheel_front_right_19.start);
    node_wheel_front_right_19.rotation.set(0, 0, 0);
    node_wheel_front_right_19.scale.set(1, 1, 1);
  } else {
    node_wheel_front_right_19.position.set(0.775, 0.415, 0.9);
    node_wheel_front_right_19.rotation.set(0.0, 0.0, 1.5707963);
    node_wheel_front_right_19.scale.set(0.83, 0.28, 0.83);
  }
  node_wheel_front_right_19.userData.sculptComponent = {"id": "wheel-front-right", "name": "Front-Right Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-front-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [0.775, 0.415, 0.9], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-front-right-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-fr", "kind": "fastener", "description": "mirror tread pattern", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "top-view", "confidence": 0.9}, {"id": "rim-spokes-fr", "kind": "bevel", "description": "mirror spoked rim", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-front-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_front_right_19.userData.actionProfile = {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}};
  (nodes["root"] ?? root).add(node_wheel_front_right_19);
  nodes["wheel-front-right"] = node_wheel_front_right_19;
  const mesh_wheel_front_right_19Geometry = endpoint_wheel_front_right_19
    ? new THREE.CylinderGeometry(endpoint_wheel_front_right_19.endRadius, endpoint_wheel_front_right_19.baseRadius, endpoint_wheel_front_right_19.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_wheel_front_right_19 = new THREE.Mesh(
    mesh_wheel_front_right_19Geometry,
    materialMap["mat-tire-rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_front_right_19.name = "Front-Right Wheel";
  if (endpoint_wheel_front_right_19) {
    mesh_wheel_front_right_19.position.copy(endpoint_wheel_front_right_19.midpoint);
    mesh_wheel_front_right_19.quaternion.copy(endpoint_wheel_front_right_19.quaternion);
  }
  mesh_wheel_front_right_19.castShadow = options.castShadow ?? true;
  mesh_wheel_front_right_19.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_front_right_19.userData.sculptComponent = {"id": "wheel-front-right", "name": "Front-Right Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-front-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [0.775, 0.415, 0.9], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-front-right-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-fr", "kind": "fastener", "description": "mirror tread pattern", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "top-view", "confidence": 0.9}, {"id": "rim-spokes-fr", "kind": "bevel", "description": "mirror spoked rim", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-front-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_front_right_19.add(mesh_wheel_front_right_19);
  meshes["wheel-front-right"] = mesh_wheel_front_right_19;
  colliders["wheel-front-right"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_wheel_front_right_19);

  const attachment_wheel_rear_left_20 = {"parentId": null, "parentSocket": "wheel-rear-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_wheel_rear_left_20 = makeAttachmentEndpoint(attachment_wheel_rear_left_20);
  const node_wheel_rear_left_20 = new THREE.Group();
  node_wheel_rear_left_20.name = "Rear-Left Wheel__pivot";
  if (endpoint_wheel_rear_left_20) {
    node_wheel_rear_left_20.position.copy(endpoint_wheel_rear_left_20.start);
    node_wheel_rear_left_20.rotation.set(0, 0, 0);
    node_wheel_rear_left_20.scale.set(1, 1, 1);
  } else {
    node_wheel_rear_left_20.position.set(-0.775, 0.415, -1.7);
    node_wheel_rear_left_20.rotation.set(0.0, 0.0, 1.5707963);
    node_wheel_rear_left_20.scale.set(0.83, 0.28, 0.83);
  }
  node_wheel_rear_left_20.userData.sculptComponent = {"id": "wheel-rear-left", "name": "Rear-Left Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-rear-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [-0.775, 0.415, -1.7], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-rear-left-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-rl", "kind": "fastener", "description": "mirror tread pattern", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "side-view", "confidence": 0.9}, {"id": "rim-spokes-rl", "kind": "bevel", "description": "mirror spoked rim", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_rear_left_20.userData.actionProfile = {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}};
  (nodes["root"] ?? root).add(node_wheel_rear_left_20);
  nodes["wheel-rear-left"] = node_wheel_rear_left_20;
  const mesh_wheel_rear_left_20Geometry = endpoint_wheel_rear_left_20
    ? new THREE.CylinderGeometry(endpoint_wheel_rear_left_20.endRadius, endpoint_wheel_rear_left_20.baseRadius, endpoint_wheel_rear_left_20.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_wheel_rear_left_20 = new THREE.Mesh(
    mesh_wheel_rear_left_20Geometry,
    materialMap["mat-tire-rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_rear_left_20.name = "Rear-Left Wheel";
  if (endpoint_wheel_rear_left_20) {
    mesh_wheel_rear_left_20.position.copy(endpoint_wheel_rear_left_20.midpoint);
    mesh_wheel_rear_left_20.quaternion.copy(endpoint_wheel_rear_left_20.quaternion);
  }
  mesh_wheel_rear_left_20.castShadow = options.castShadow ?? true;
  mesh_wheel_rear_left_20.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_rear_left_20.userData.sculptComponent = {"id": "wheel-rear-left", "name": "Rear-Left Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-rear-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [-0.775, 0.415, -1.7], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-rear-left-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-rl", "kind": "fastener", "description": "mirror tread pattern", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "side-view", "confidence": 0.9}, {"id": "rim-spokes-rl", "kind": "bevel", "description": "mirror spoked rim", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "side-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_rear_left_20.add(mesh_wheel_rear_left_20);
  meshes["wheel-rear-left"] = mesh_wheel_rear_left_20;
  colliders["wheel-rear-left"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_wheel_rear_left_20);

  const attachment_wheel_rear_right_21 = {"parentId": null, "parentSocket": "wheel-rear-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]};
  const endpoint_wheel_rear_right_21 = makeAttachmentEndpoint(attachment_wheel_rear_right_21);
  const node_wheel_rear_right_21 = new THREE.Group();
  node_wheel_rear_right_21.name = "Rear-Right Wheel__pivot";
  if (endpoint_wheel_rear_right_21) {
    node_wheel_rear_right_21.position.copy(endpoint_wheel_rear_right_21.start);
    node_wheel_rear_right_21.rotation.set(0, 0, 0);
    node_wheel_rear_right_21.scale.set(1, 1, 1);
  } else {
    node_wheel_rear_right_21.position.set(0.775, 0.415, -1.7);
    node_wheel_rear_right_21.rotation.set(0.0, 0.0, 1.5707963);
    node_wheel_rear_right_21.scale.set(0.83, 0.28, 0.83);
  }
  node_wheel_rear_right_21.userData.sculptComponent = {"id": "wheel-rear-right", "name": "Rear-Right Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-rear-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [0.775, 0.415, -1.7], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-rear-right-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-rr", "kind": "fastener", "description": "mirror tread pattern", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "three-quarter-rear-view", "confidence": 0.9}, {"id": "rim-spokes-rr", "kind": "bevel", "description": "mirror spoked rim", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "three-quarter-rear-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-rear-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_rear_right_21.userData.actionProfile = {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}};
  (nodes["root"] ?? root).add(node_wheel_rear_right_21);
  nodes["wheel-rear-right"] = node_wheel_rear_right_21;
  const mesh_wheel_rear_right_21Geometry = endpoint_wheel_rear_right_21
    ? new THREE.CylinderGeometry(endpoint_wheel_rear_right_21.endRadius, endpoint_wheel_rear_right_21.baseRadius, endpoint_wheel_rear_right_21.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_wheel_rear_right_21 = new THREE.Mesh(
    mesh_wheel_rear_right_21Geometry,
    materialMap["mat-tire-rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_rear_right_21.name = "Rear-Right Wheel";
  if (endpoint_wheel_rear_right_21) {
    mesh_wheel_rear_right_21.position.copy(endpoint_wheel_rear_right_21.midpoint);
    mesh_wheel_rear_right_21.quaternion.copy(endpoint_wheel_rear_right_21.quaternion);
  }
  mesh_wheel_rear_right_21.castShadow = options.castShadow ?? true;
  mesh_wheel_rear_right_21.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_rear_right_21.userData.sculptComponent = {"id": "wheel-rear-right", "name": "Rear-Right Wheel", "level": "macro", "role": "wheel", "importance": 1.0, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.015, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "wheel-rear-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [0.775, 0.415, -1.7], "rotation": [0, 0, 1.5707963], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "wheel-rear-right-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "root"}], "seams": [], "localFeatures": [{"id": "tread-lugs-rr", "kind": "fastener", "description": "mirror tread pattern", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "three-quarter-rear-view", "confidence": 0.9}, {"id": "rim-spokes-rr", "kind": "bevel", "description": "mirror spoked rim", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "three-quarter-rear-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-rear-view"], "details": [], "fidelityTier": "blockout"};
  node_wheel_rear_right_21.add(mesh_wheel_rear_right_21);
  meshes["wheel-rear-right"] = mesh_wheel_rear_right_21;
  colliders["wheel-rear-right"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_wheel_rear_right_21);

  const attachment_spare_tire_22 = {"parentId": null, "parentSocket": "spare-tire-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]};
  const endpoint_spare_tire_22 = makeAttachmentEndpoint(attachment_spare_tire_22);
  const node_spare_tire_22 = new THREE.Group();
  node_spare_tire_22.name = "Spare Tire (Tailgate-Mounted)__pivot";
  if (endpoint_spare_tire_22) {
    node_spare_tire_22.position.copy(endpoint_spare_tire_22.start);
    node_spare_tire_22.rotation.set(0, 0, 0);
    node_spare_tire_22.scale.set(1, 1, 1);
  } else {
    node_spare_tire_22.position.set(0.0, 0.7, -2.35);
    node_spare_tire_22.rotation.set(1.5707963, 0.0, 0.0);
    node_spare_tire_22.scale.set(0.83, 0.28, 0.83);
  }
  node_spare_tire_22.userData.sculptComponent = {"id": "spare-tire", "name": "Spare Tire (Tailgate-Mounted)", "level": "meso", "role": "wheel", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "spare-tire-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [0.0, 0.7, -2.35], "rotation": [1.5707963, 0, 0], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "spare-tire", "seamRefs": [], "detachableFragments": ["spare-tire"], "breakImpulse": 4.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "spare-tire-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "tailgate"}], "seams": [{"id": "spare-tire-seam", "parentRef": "tailgate", "kind": "panel-line"}], "localFeatures": [{"id": "tread-lugs-spare", "kind": "fastener", "description": "matching tread pattern on the mounted spare", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "rear-view", "confidence": 0.85}, {"id": "rim-spokes-spare", "kind": "bevel", "description": "matching spoked rim on the spare", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "rear-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_spare_tire_22.userData.actionProfile = {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "spare-tire", "seamRefs": [], "detachableFragments": ["spare-tire"], "breakImpulse": 4.0, "debrisMaterial": "mat-tire-rubber"}};
  (nodes["root"] ?? root).add(node_spare_tire_22);
  nodes["spare-tire"] = node_spare_tire_22;
  const mesh_spare_tire_22Geometry = endpoint_spare_tire_22
    ? new THREE.CylinderGeometry(endpoint_spare_tire_22.endRadius, endpoint_spare_tire_22.baseRadius, endpoint_spare_tire_22.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_spare_tire_22 = new THREE.Mesh(
    mesh_spare_tire_22Geometry,
    materialMap["mat-tire-rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_spare_tire_22.name = "Spare Tire (Tailgate-Mounted)";
  if (endpoint_spare_tire_22) {
    mesh_spare_tire_22.position.copy(endpoint_spare_tire_22.midpoint);
    mesh_spare_tire_22.quaternion.copy(endpoint_spare_tire_22.quaternion);
  }
  mesh_spare_tire_22.castShadow = options.castShadow ?? true;
  mesh_spare_tire_22.receiveShadow = options.receiveShadow ?? true;
  mesh_spare_tire_22.userData.sculptComponent = {"id": "spare-tire", "name": "Spare Tire (Tailgate-Mounted)", "level": "meso", "role": "wheel", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "spare-tire-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.415, "length": 0.28, "width": 0.83, "height": 0.28, "depth": 0.83}, "transform": {"position": [0.0, 0.7, -2.35], "rotation": [1.5707963, 0, 0], "scale": [0.83, 0.28, 0.83]}, "actionProfile": {"animationRole": "wheel", "pivot": {"mode": "axle-center", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "spare-tire", "seamRefs": [], "detachableFragments": ["spare-tire"], "breakImpulse": 4.0, "debrisMaterial": "mat-tire-rubber"}}, "material": "mat-tire-rubber", "materialLayers": ["mat-tire-rubber"], "deformations": [], "joints": [{"id": "spare-tire-axle", "type": "revolute", "axis": [1, 0, 0], "parentRef": "tailgate"}], "seams": [{"id": "spare-tire-seam", "parentRef": "tailgate", "kind": "panel-line"}], "localFeatures": [{"id": "tread-lugs-spare", "kind": "fastener", "description": "matching tread pattern on the mounted spare", "geometry": "InstancedMesh ring, ~28 lugs", "evidenceRef": "rear-view", "confidence": 0.85}, {"id": "rim-spokes-spare", "kind": "bevel", "description": "matching spoked rim on the spare", "geometry": "lathe/extrude rim hub + 5x spoke wedges + lug-nut instances", "evidenceRef": "rear-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_spare_tire_22.add(mesh_spare_tire_22);
  meshes["spare-tire"] = mesh_spare_tire_22;
  colliders["spare-tire"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["spare-tire"] ??= [];
  destructionGroups["spare-tire"].push(node_spare_tire_22);

  const attachment_mirror_left_23 = {"parentId": null, "parentSocket": "mirror-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_mirror_left_23 = makeAttachmentEndpoint(attachment_mirror_left_23);
  const node_mirror_left_23 = new THREE.Group();
  node_mirror_left_23.name = "Left Side Mirror__pivot";
  if (endpoint_mirror_left_23) {
    node_mirror_left_23.position.copy(endpoint_mirror_left_23.start);
    node_mirror_left_23.rotation.set(0, 0, 0);
    node_mirror_left_23.scale.set(1, 1, 1);
  } else {
    node_mirror_left_23.position.set(-0.9, 1.55, 0.8);
    node_mirror_left_23.rotation.set(0.0, 0.0, 0.0);
    node_mirror_left_23.scale.set(0.05, 0.14, 0.2);
  }
  node_mirror_left_23.userData.sculptComponent = {"id": "mirror-left", "name": "Left Side Mirror", "level": "meso", "role": "mirror", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "mirror-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 0.14, "depth": 0.2}, "transform": {"position": [-0.9, 1.55, 0.8], "rotation": [0, 0, 0], "scale": [0.05, 0.14, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "mirror-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "mirror-housing-bevel-left", "kind": "bevel", "description": "boxy angled mirror housing with a beveled edge catching a highlight", "geometry": "chamfer bevelRadius 0.01, 2 segments", "evidenceRef": "side-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_mirror_left_23.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_mirror_left_23);
  nodes["mirror-left"] = node_mirror_left_23;
  const mesh_mirror_left_23Geometry = endpoint_mirror_left_23
    ? new THREE.CylinderGeometry(endpoint_mirror_left_23.endRadius, endpoint_mirror_left_23.baseRadius, endpoint_mirror_left_23.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_mirror_left_23 = new THREE.Mesh(
    mesh_mirror_left_23Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mirror_left_23.name = "Left Side Mirror";
  if (endpoint_mirror_left_23) {
    mesh_mirror_left_23.position.copy(endpoint_mirror_left_23.midpoint);
    mesh_mirror_left_23.quaternion.copy(endpoint_mirror_left_23.quaternion);
  }
  mesh_mirror_left_23.castShadow = options.castShadow ?? true;
  mesh_mirror_left_23.receiveShadow = options.receiveShadow ?? true;
  mesh_mirror_left_23.userData.sculptComponent = {"id": "mirror-left", "name": "Left Side Mirror", "level": "meso", "role": "mirror", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "mirror-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 0.14, "depth": 0.2}, "transform": {"position": [-0.9, 1.55, 0.8], "rotation": [0, 0, 0], "scale": [0.05, 0.14, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "mirror-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "mirror-housing-bevel-left", "kind": "bevel", "description": "boxy angled mirror housing with a beveled edge catching a highlight", "geometry": "chamfer bevelRadius 0.01, 2 segments", "evidenceRef": "side-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_mirror_left_23.add(mesh_mirror_left_23);
  meshes["mirror-left"] = mesh_mirror_left_23;
  colliders["mirror-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_mirror_left_23);

  const attachment_mirror_right_24 = {"parentId": null, "parentSocket": "mirror-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]};
  const endpoint_mirror_right_24 = makeAttachmentEndpoint(attachment_mirror_right_24);
  const node_mirror_right_24 = new THREE.Group();
  node_mirror_right_24.name = "Right Side Mirror__pivot";
  if (endpoint_mirror_right_24) {
    node_mirror_right_24.position.copy(endpoint_mirror_right_24.start);
    node_mirror_right_24.rotation.set(0, 0, 0);
    node_mirror_right_24.scale.set(1, 1, 1);
  } else {
    node_mirror_right_24.position.set(0.9, 1.55, 0.8);
    node_mirror_right_24.rotation.set(0.0, 0.0, 0.0);
    node_mirror_right_24.scale.set(0.05, 0.14, 0.2);
  }
  node_mirror_right_24.userData.sculptComponent = {"id": "mirror-right", "name": "Right Side Mirror", "level": "meso", "role": "mirror", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "mirror-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 0.14, "depth": 0.2}, "transform": {"position": [0.9, 1.55, 0.8], "rotation": [0, 0, 0], "scale": [0.05, 0.14, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "mirror-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "mirror-housing-bevel-right", "kind": "bevel", "description": "mirror of the left housing bevel", "geometry": "chamfer bevelRadius 0.01, 2 segments", "evidenceRef": "front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_mirror_right_24.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}};
  (nodes["root"] ?? root).add(node_mirror_right_24);
  nodes["mirror-right"] = node_mirror_right_24;
  const mesh_mirror_right_24Geometry = endpoint_mirror_right_24
    ? new THREE.CylinderGeometry(endpoint_mirror_right_24.endRadius, endpoint_mirror_right_24.baseRadius, endpoint_mirror_right_24.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_mirror_right_24 = new THREE.Mesh(
    mesh_mirror_right_24Geometry,
    materialMap["mat-trim-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mirror_right_24.name = "Right Side Mirror";
  if (endpoint_mirror_right_24) {
    mesh_mirror_right_24.position.copy(endpoint_mirror_right_24.midpoint);
    mesh_mirror_right_24.quaternion.copy(endpoint_mirror_right_24.quaternion);
  }
  mesh_mirror_right_24.castShadow = options.castShadow ?? true;
  mesh_mirror_right_24.receiveShadow = options.receiveShadow ?? true;
  mesh_mirror_right_24.userData.sculptComponent = {"id": "mirror-right", "name": "Right Side Mirror", "level": "meso", "role": "mirror", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "mirror-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.05, "height": 0.14, "depth": 0.2}, "transform": {"position": [0.9, 1.55, 0.8], "rotation": [0, 0, 0], "scale": [0.05, 0.14, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-trim-black"}}, "material": "mat-trim-black", "materialLayers": ["mat-trim-black"], "deformations": [], "joints": [], "seams": [{"id": "mirror-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "mirror-housing-bevel-right", "kind": "bevel", "description": "mirror of the left housing bevel", "geometry": "chamfer bevelRadius 0.01, 2 segments", "evidenceRef": "front-view", "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_mirror_right_24.add(mesh_mirror_right_24);
  meshes["mirror-right"] = mesh_mirror_right_24;
  colliders["mirror-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_mirror_right_24);

  const attachment_headlight_left_25 = {"parentId": null, "parentSocket": "headlight-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]};
  const endpoint_headlight_left_25 = makeAttachmentEndpoint(attachment_headlight_left_25);
  const node_headlight_left_25 = new THREE.Group();
  node_headlight_left_25.name = "Left Headlight__pivot";
  if (endpoint_headlight_left_25) {
    node_headlight_left_25.position.copy(endpoint_headlight_left_25.start);
    node_headlight_left_25.rotation.set(0, 0, 0);
    node_headlight_left_25.scale.set(1, 1, 1);
  } else {
    node_headlight_left_25.position.set(-0.55, 0.95, 1.97);
    node_headlight_left_25.rotation.set(1.5707963, 0.0, 0.0);
    node_headlight_left_25.scale.set(0.22, 0.05, 0.22);
  }
  node_headlight_left_25.userData.sculptComponent = {"id": "headlight-left", "name": "Left Headlight", "level": "meso", "role": "headlight", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "headlight-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.11, "length": 0.05, "width": 0.22, "height": 0.05, "depth": 0.22}, "transform": {"position": [-0.55, 0.95, 1.97], "rotation": [1.5707963, 0, 0], "scale": [0.22, 0.05, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-headlight-lens"}}, "material": "mat-headlight-lens", "materialLayers": ["mat-headlight-lens"], "deformations": [], "joints": [], "seams": [{"id": "headlight-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "lens-bezel", "kind": "bevel", "description": "raised chrome-ish bezel ring around the round sealed-beam lens", "geometry": "torus bezel ring, radius 0.11, tube 0.01", "evidenceRef": "front-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_headlight_left_25.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-headlight-lens"}};
  (nodes["root"] ?? root).add(node_headlight_left_25);
  nodes["headlight-left"] = node_headlight_left_25;
  const mesh_headlight_left_25Geometry = endpoint_headlight_left_25
    ? new THREE.CylinderGeometry(endpoint_headlight_left_25.endRadius, endpoint_headlight_left_25.baseRadius, endpoint_headlight_left_25.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_headlight_left_25 = new THREE.Mesh(
    mesh_headlight_left_25Geometry,
    materialMap["mat-headlight-lens"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_headlight_left_25.name = "Left Headlight";
  if (endpoint_headlight_left_25) {
    mesh_headlight_left_25.position.copy(endpoint_headlight_left_25.midpoint);
    mesh_headlight_left_25.quaternion.copy(endpoint_headlight_left_25.quaternion);
  }
  mesh_headlight_left_25.castShadow = options.castShadow ?? true;
  mesh_headlight_left_25.receiveShadow = options.receiveShadow ?? true;
  mesh_headlight_left_25.userData.sculptComponent = {"id": "headlight-left", "name": "Left Headlight", "level": "meso", "role": "headlight", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "headlight-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.11, "length": 0.05, "width": 0.22, "height": 0.05, "depth": 0.22}, "transform": {"position": [-0.55, 0.95, 1.97], "rotation": [1.5707963, 0, 0], "scale": [0.22, 0.05, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-headlight-lens"}}, "material": "mat-headlight-lens", "materialLayers": ["mat-headlight-lens"], "deformations": [], "joints": [], "seams": [{"id": "headlight-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "lens-bezel", "kind": "bevel", "description": "raised chrome-ish bezel ring around the round sealed-beam lens", "geometry": "torus bezel ring, radius 0.11, tube 0.01", "evidenceRef": "front-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_headlight_left_25.add(mesh_headlight_left_25);
  meshes["headlight-left"] = mesh_headlight_left_25;
  colliders["headlight-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_headlight_left_25);

  const attachment_headlight_right_26 = {"parentId": null, "parentSocket": "headlight-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]};
  const endpoint_headlight_right_26 = makeAttachmentEndpoint(attachment_headlight_right_26);
  const node_headlight_right_26 = new THREE.Group();
  node_headlight_right_26.name = "Right Headlight__pivot";
  if (endpoint_headlight_right_26) {
    node_headlight_right_26.position.copy(endpoint_headlight_right_26.start);
    node_headlight_right_26.rotation.set(0, 0, 0);
    node_headlight_right_26.scale.set(1, 1, 1);
  } else {
    node_headlight_right_26.position.set(0.55, 0.95, 1.97);
    node_headlight_right_26.rotation.set(1.5707963, 0.0, 0.0);
    node_headlight_right_26.scale.set(0.22, 0.05, 0.22);
  }
  node_headlight_right_26.userData.sculptComponent = {"id": "headlight-right", "name": "Right Headlight", "level": "meso", "role": "headlight", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "headlight-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.11, "length": 0.05, "width": 0.22, "height": 0.05, "depth": 0.22}, "transform": {"position": [0.55, 0.95, 1.97], "rotation": [1.5707963, 0, 0], "scale": [0.22, 0.05, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-headlight-lens"}}, "material": "mat-headlight-lens", "materialLayers": ["mat-headlight-lens"], "deformations": [], "joints": [], "seams": [{"id": "headlight-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "lens-bezel-right", "kind": "bevel", "description": "mirror bezel ring", "geometry": "torus bezel ring, radius 0.11, tube 0.01", "evidenceRef": "front-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_headlight_right_26.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-headlight-lens"}};
  (nodes["root"] ?? root).add(node_headlight_right_26);
  nodes["headlight-right"] = node_headlight_right_26;
  const mesh_headlight_right_26Geometry = endpoint_headlight_right_26
    ? new THREE.CylinderGeometry(endpoint_headlight_right_26.endRadius, endpoint_headlight_right_26.baseRadius, endpoint_headlight_right_26.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_headlight_right_26 = new THREE.Mesh(
    mesh_headlight_right_26Geometry,
    materialMap["mat-headlight-lens"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_headlight_right_26.name = "Right Headlight";
  if (endpoint_headlight_right_26) {
    mesh_headlight_right_26.position.copy(endpoint_headlight_right_26.midpoint);
    mesh_headlight_right_26.quaternion.copy(endpoint_headlight_right_26.quaternion);
  }
  mesh_headlight_right_26.castShadow = options.castShadow ?? true;
  mesh_headlight_right_26.receiveShadow = options.receiveShadow ?? true;
  mesh_headlight_right_26.userData.sculptComponent = {"id": "headlight-right", "name": "Right Headlight", "level": "meso", "role": "headlight", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "headlight-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.11, "length": 0.05, "width": 0.22, "height": 0.05, "depth": 0.22}, "transform": {"position": [0.55, 0.95, 1.97], "rotation": [1.5707963, 0, 0], "scale": [0.22, 0.05, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-headlight-lens"}}, "material": "mat-headlight-lens", "materialLayers": ["mat-headlight-lens"], "deformations": [], "joints": [], "seams": [{"id": "headlight-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [{"id": "lens-bezel-right", "kind": "bevel", "description": "mirror bezel ring", "geometry": "torus bezel ring, radius 0.11, tube 0.01", "evidenceRef": "front-view", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_headlight_right_26.add(mesh_headlight_right_26);
  meshes["headlight-right"] = mesh_headlight_right_26;
  colliders["headlight-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_headlight_right_26);

  const attachment_turnsignal_left_27 = {"parentId": null, "parentSocket": "turnsignal-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-front-view"]};
  const endpoint_turnsignal_left_27 = makeAttachmentEndpoint(attachment_turnsignal_left_27);
  const node_turnsignal_left_27 = new THREE.Group();
  node_turnsignal_left_27.name = "Left Turn Signal__pivot";
  if (endpoint_turnsignal_left_27) {
    node_turnsignal_left_27.position.copy(endpoint_turnsignal_left_27.start);
    node_turnsignal_left_27.rotation.set(0, 0, 0);
    node_turnsignal_left_27.scale.set(1, 1, 1);
  } else {
    node_turnsignal_left_27.position.set(-0.62, 0.68, 1.99);
    node_turnsignal_left_27.rotation.set(0.0, 0.0, 0.0);
    node_turnsignal_left_27.scale.set(0.14, 0.1, 0.04);
  }
  node_turnsignal_left_27.userData.sculptComponent = {"id": "turnsignal-left", "name": "Left Turn Signal", "level": "meso", "role": "turnsignal", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "turnsignal-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.1, "depth": 0.04}, "transform": {"position": [-0.62, 0.68, 1.99], "rotation": [0, 0, 0], "scale": [0.14, 0.1, 0.04]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-turnsignal-lens"}}, "material": "mat-turnsignal-lens", "materialLayers": ["mat-turnsignal-lens"], "deformations": [], "joints": [], "seams": [{"id": "turnsignal-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_turnsignal_left_27.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-turnsignal-lens"}};
  (nodes["root"] ?? root).add(node_turnsignal_left_27);
  nodes["turnsignal-left"] = node_turnsignal_left_27;
  const mesh_turnsignal_left_27Geometry = endpoint_turnsignal_left_27
    ? new THREE.CylinderGeometry(endpoint_turnsignal_left_27.endRadius, endpoint_turnsignal_left_27.baseRadius, endpoint_turnsignal_left_27.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_turnsignal_left_27 = new THREE.Mesh(
    mesh_turnsignal_left_27Geometry,
    materialMap["mat-turnsignal-lens"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_turnsignal_left_27.name = "Left Turn Signal";
  if (endpoint_turnsignal_left_27) {
    mesh_turnsignal_left_27.position.copy(endpoint_turnsignal_left_27.midpoint);
    mesh_turnsignal_left_27.quaternion.copy(endpoint_turnsignal_left_27.quaternion);
  }
  mesh_turnsignal_left_27.castShadow = options.castShadow ?? true;
  mesh_turnsignal_left_27.receiveShadow = options.receiveShadow ?? true;
  mesh_turnsignal_left_27.userData.sculptComponent = {"id": "turnsignal-left", "name": "Left Turn Signal", "level": "meso", "role": "turnsignal", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "turnsignal-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.1, "depth": 0.04}, "transform": {"position": [-0.62, 0.68, 1.99], "rotation": [0, 0, 0], "scale": [0.14, 0.1, 0.04]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-turnsignal-lens"}}, "material": "mat-turnsignal-lens", "materialLayers": ["mat-turnsignal-lens"], "deformations": [], "joints": [], "seams": [{"id": "turnsignal-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_turnsignal_left_27.add(mesh_turnsignal_left_27);
  meshes["turnsignal-left"] = mesh_turnsignal_left_27;
  colliders["turnsignal-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_turnsignal_left_27);

  const attachment_turnsignal_right_28 = {"parentId": null, "parentSocket": "turnsignal-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]};
  const endpoint_turnsignal_right_28 = makeAttachmentEndpoint(attachment_turnsignal_right_28);
  const node_turnsignal_right_28 = new THREE.Group();
  node_turnsignal_right_28.name = "Right Turn Signal__pivot";
  if (endpoint_turnsignal_right_28) {
    node_turnsignal_right_28.position.copy(endpoint_turnsignal_right_28.start);
    node_turnsignal_right_28.rotation.set(0, 0, 0);
    node_turnsignal_right_28.scale.set(1, 1, 1);
  } else {
    node_turnsignal_right_28.position.set(0.62, 0.68, 1.99);
    node_turnsignal_right_28.rotation.set(0.0, 0.0, 0.0);
    node_turnsignal_right_28.scale.set(0.14, 0.1, 0.04);
  }
  node_turnsignal_right_28.userData.sculptComponent = {"id": "turnsignal-right", "name": "Right Turn Signal", "level": "meso", "role": "turnsignal", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "turnsignal-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.1, "depth": 0.04}, "transform": {"position": [0.62, 0.68, 1.99], "rotation": [0, 0, 0], "scale": [0.14, 0.1, 0.04]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-turnsignal-lens"}}, "material": "mat-turnsignal-lens", "materialLayers": ["mat-turnsignal-lens"], "deformations": [], "joints": [], "seams": [{"id": "turnsignal-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_turnsignal_right_28.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-turnsignal-lens"}};
  (nodes["root"] ?? root).add(node_turnsignal_right_28);
  nodes["turnsignal-right"] = node_turnsignal_right_28;
  const mesh_turnsignal_right_28Geometry = endpoint_turnsignal_right_28
    ? new THREE.CylinderGeometry(endpoint_turnsignal_right_28.endRadius, endpoint_turnsignal_right_28.baseRadius, endpoint_turnsignal_right_28.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_turnsignal_right_28 = new THREE.Mesh(
    mesh_turnsignal_right_28Geometry,
    materialMap["mat-turnsignal-lens"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_turnsignal_right_28.name = "Right Turn Signal";
  if (endpoint_turnsignal_right_28) {
    mesh_turnsignal_right_28.position.copy(endpoint_turnsignal_right_28.midpoint);
    mesh_turnsignal_right_28.quaternion.copy(endpoint_turnsignal_right_28.quaternion);
  }
  mesh_turnsignal_right_28.castShadow = options.castShadow ?? true;
  mesh_turnsignal_right_28.receiveShadow = options.receiveShadow ?? true;
  mesh_turnsignal_right_28.userData.sculptComponent = {"id": "turnsignal-right", "name": "Right Turn Signal", "level": "meso", "role": "turnsignal", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "turnsignal-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["front-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.1, "depth": 0.04}, "transform": {"position": [0.62, 0.68, 1.99], "rotation": [0, 0, 0], "scale": [0.14, 0.1, 0.04]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-turnsignal-lens"}}, "material": "mat-turnsignal-lens", "materialLayers": ["mat-turnsignal-lens"], "deformations": [], "joints": [], "seams": [{"id": "turnsignal-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["front-view"], "details": [], "fidelityTier": "structural-pass"};
  node_turnsignal_right_28.add(mesh_turnsignal_right_28);
  meshes["turnsignal-right"] = mesh_turnsignal_right_28;
  colliders["turnsignal-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_turnsignal_right_28);

  const attachment_taillight_left_29 = {"parentId": null, "parentSocket": "taillight-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]};
  const endpoint_taillight_left_29 = makeAttachmentEndpoint(attachment_taillight_left_29);
  const node_taillight_left_29 = new THREE.Group();
  node_taillight_left_29.name = "Left Taillight Cluster__pivot";
  if (endpoint_taillight_left_29) {
    node_taillight_left_29.position.copy(endpoint_taillight_left_29.start);
    node_taillight_left_29.rotation.set(0, 0, 0);
    node_taillight_left_29.scale.set(1, 1, 1);
  } else {
    node_taillight_left_29.position.set(-0.78, 0.75, -1.97);
    node_taillight_left_29.rotation.set(0.0, 0.0, 0.0);
    node_taillight_left_29.scale.set(0.14, 0.3, 0.05);
  }
  node_taillight_left_29.userData.sculptComponent = {"id": "taillight-left", "name": "Left Taillight Cluster", "level": "meso", "role": "taillight", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "taillight-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.3, "depth": 0.05}, "transform": {"position": [-0.78, 0.75, -1.97], "rotation": [0, 0, 0], "scale": [0.14, 0.3, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-taillight-lens"}}, "material": "mat-taillight-lens", "materialLayers": ["mat-taillight-lens"], "deformations": [], "joints": [], "seams": [{"id": "taillight-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_taillight_left_29.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-taillight-lens"}};
  (nodes["root"] ?? root).add(node_taillight_left_29);
  nodes["taillight-left"] = node_taillight_left_29;
  const mesh_taillight_left_29Geometry = endpoint_taillight_left_29
    ? new THREE.CylinderGeometry(endpoint_taillight_left_29.endRadius, endpoint_taillight_left_29.baseRadius, endpoint_taillight_left_29.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_taillight_left_29 = new THREE.Mesh(
    mesh_taillight_left_29Geometry,
    materialMap["mat-taillight-lens"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_taillight_left_29.name = "Left Taillight Cluster";
  if (endpoint_taillight_left_29) {
    mesh_taillight_left_29.position.copy(endpoint_taillight_left_29.midpoint);
    mesh_taillight_left_29.quaternion.copy(endpoint_taillight_left_29.quaternion);
  }
  mesh_taillight_left_29.castShadow = options.castShadow ?? true;
  mesh_taillight_left_29.receiveShadow = options.receiveShadow ?? true;
  mesh_taillight_left_29.userData.sculptComponent = {"id": "taillight-left", "name": "Left Taillight Cluster", "level": "meso", "role": "taillight", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "taillight-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.3, "depth": 0.05}, "transform": {"position": [-0.78, 0.75, -1.97], "rotation": [0, 0, 0], "scale": [0.14, 0.3, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-taillight-lens"}}, "material": "mat-taillight-lens", "materialLayers": ["mat-taillight-lens"], "deformations": [], "joints": [], "seams": [{"id": "taillight-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_taillight_left_29.add(mesh_taillight_left_29);
  meshes["taillight-left"] = mesh_taillight_left_29;
  colliders["taillight-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_taillight_left_29);

  const attachment_taillight_right_30 = {"parentId": null, "parentSocket": "taillight-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]};
  const endpoint_taillight_right_30 = makeAttachmentEndpoint(attachment_taillight_right_30);
  const node_taillight_right_30 = new THREE.Group();
  node_taillight_right_30.name = "Right Taillight Cluster__pivot";
  if (endpoint_taillight_right_30) {
    node_taillight_right_30.position.copy(endpoint_taillight_right_30.start);
    node_taillight_right_30.rotation.set(0, 0, 0);
    node_taillight_right_30.scale.set(1, 1, 1);
  } else {
    node_taillight_right_30.position.set(0.78, 0.75, -1.97);
    node_taillight_right_30.rotation.set(0.0, 0.0, 0.0);
    node_taillight_right_30.scale.set(0.14, 0.3, 0.05);
  }
  node_taillight_right_30.userData.sculptComponent = {"id": "taillight-right", "name": "Right Taillight Cluster", "level": "meso", "role": "taillight", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "taillight-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.3, "depth": 0.05}, "transform": {"position": [0.78, 0.75, -1.97], "rotation": [0, 0, 0], "scale": [0.14, 0.3, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-taillight-lens"}}, "material": "mat-taillight-lens", "materialLayers": ["mat-taillight-lens"], "deformations": [], "joints": [], "seams": [{"id": "taillight-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_taillight_right_30.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-taillight-lens"}};
  (nodes["root"] ?? root).add(node_taillight_right_30);
  nodes["taillight-right"] = node_taillight_right_30;
  const mesh_taillight_right_30Geometry = endpoint_taillight_right_30
    ? new THREE.CylinderGeometry(endpoint_taillight_right_30.endRadius, endpoint_taillight_right_30.baseRadius, endpoint_taillight_right_30.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_taillight_right_30 = new THREE.Mesh(
    mesh_taillight_right_30Geometry,
    materialMap["mat-taillight-lens"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_taillight_right_30.name = "Right Taillight Cluster";
  if (endpoint_taillight_right_30) {
    mesh_taillight_right_30.position.copy(endpoint_taillight_right_30.midpoint);
    mesh_taillight_right_30.quaternion.copy(endpoint_taillight_right_30.quaternion);
  }
  mesh_taillight_right_30.castShadow = options.castShadow ?? true;
  mesh_taillight_right_30.receiveShadow = options.receiveShadow ?? true;
  mesh_taillight_right_30.userData.sculptComponent = {"id": "taillight-right", "name": "Right Taillight Cluster", "level": "meso", "role": "taillight", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "taillight-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["three-quarter-rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.14, "height": 0.3, "depth": 0.05}, "transform": {"position": [0.78, 0.75, -1.97], "rotation": [0, 0, 0], "scale": [0.14, 0.3, 0.05]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-taillight-lens"}}, "material": "mat-taillight-lens", "materialLayers": ["mat-taillight-lens"], "deformations": [], "joints": [], "seams": [{"id": "taillight-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["three-quarter-rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_taillight_right_30.add(mesh_taillight_right_30);
  meshes["taillight-right"] = mesh_taillight_right_30;
  colliders["taillight-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_taillight_right_30);

  const attachment_window_rear_quarter_left_31 = {"parentId": null, "parentSocket": "window-rear-quarter-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_window_rear_quarter_left_31 = makeAttachmentEndpoint(attachment_window_rear_quarter_left_31);
  const node_window_rear_quarter_left_31 = new THREE.Group();
  node_window_rear_quarter_left_31.name = "Left Rear-Quarter Window__pivot";
  if (endpoint_window_rear_quarter_left_31) {
    node_window_rear_quarter_left_31.position.copy(endpoint_window_rear_quarter_left_31.start);
    node_window_rear_quarter_left_31.rotation.set(0, 0, 0);
    node_window_rear_quarter_left_31.scale.set(1, 1, 1);
  } else {
    node_window_rear_quarter_left_31.position.set(-0.775, 1.55, -0.6);
    node_window_rear_quarter_left_31.rotation.set(0.0, 0.0, 0.0);
    node_window_rear_quarter_left_31.scale.set(0.03, 0.28, 0.55);
  }
  node_window_rear_quarter_left_31.userData.sculptComponent = {"id": "window-rear-quarter-left", "name": "Left Rear-Quarter Window", "level": "meso", "role": "glass-panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "window-rear-quarter-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.03, "height": 0.28, "depth": 0.55}, "transform": {"position": [-0.775, 1.55, -0.6], "rotation": [0, 0, 0], "scale": [0.03, 0.28, 0.55]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}}, "material": "mat-glass-tint", "materialLayers": ["mat-glass-tint"], "deformations": [], "joints": [], "seams": [{"id": "window-rear-quarter-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_window_rear_quarter_left_31.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}};
  (nodes["root"] ?? root).add(node_window_rear_quarter_left_31);
  nodes["window-rear-quarter-left"] = node_window_rear_quarter_left_31;
  const mesh_window_rear_quarter_left_31Geometry = endpoint_window_rear_quarter_left_31
    ? new THREE.CylinderGeometry(endpoint_window_rear_quarter_left_31.endRadius, endpoint_window_rear_quarter_left_31.baseRadius, endpoint_window_rear_quarter_left_31.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_window_rear_quarter_left_31 = new THREE.Mesh(
    mesh_window_rear_quarter_left_31Geometry,
    materialMap["mat-glass-tint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_window_rear_quarter_left_31.name = "Left Rear-Quarter Window";
  if (endpoint_window_rear_quarter_left_31) {
    mesh_window_rear_quarter_left_31.position.copy(endpoint_window_rear_quarter_left_31.midpoint);
    mesh_window_rear_quarter_left_31.quaternion.copy(endpoint_window_rear_quarter_left_31.quaternion);
  }
  mesh_window_rear_quarter_left_31.castShadow = options.castShadow ?? true;
  mesh_window_rear_quarter_left_31.receiveShadow = options.receiveShadow ?? true;
  mesh_window_rear_quarter_left_31.userData.sculptComponent = {"id": "window-rear-quarter-left", "name": "Left Rear-Quarter Window", "level": "meso", "role": "glass-panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "window-rear-quarter-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.03, "height": 0.28, "depth": 0.55}, "transform": {"position": [-0.775, 1.55, -0.6], "rotation": [0, 0, 0], "scale": [0.03, 0.28, 0.55]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}}, "material": "mat-glass-tint", "materialLayers": ["mat-glass-tint"], "deformations": [], "joints": [], "seams": [{"id": "window-rear-quarter-left-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "structural-pass"};
  node_window_rear_quarter_left_31.add(mesh_window_rear_quarter_left_31);
  meshes["window-rear-quarter-left"] = mesh_window_rear_quarter_left_31;
  colliders["window-rear-quarter-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_window_rear_quarter_left_31);

  const attachment_window_rear_quarter_right_32 = {"parentId": null, "parentSocket": "window-rear-quarter-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]};
  const endpoint_window_rear_quarter_right_32 = makeAttachmentEndpoint(attachment_window_rear_quarter_right_32);
  const node_window_rear_quarter_right_32 = new THREE.Group();
  node_window_rear_quarter_right_32.name = "Right Rear-Quarter Window__pivot";
  if (endpoint_window_rear_quarter_right_32) {
    node_window_rear_quarter_right_32.position.copy(endpoint_window_rear_quarter_right_32.start);
    node_window_rear_quarter_right_32.rotation.set(0, 0, 0);
    node_window_rear_quarter_right_32.scale.set(1, 1, 1);
  } else {
    node_window_rear_quarter_right_32.position.set(0.775, 1.55, -0.6);
    node_window_rear_quarter_right_32.rotation.set(0.0, 0.0, 0.0);
    node_window_rear_quarter_right_32.scale.set(0.03, 0.28, 0.55);
  }
  node_window_rear_quarter_right_32.userData.sculptComponent = {"id": "window-rear-quarter-right", "name": "Right Rear-Quarter Window", "level": "meso", "role": "glass-panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "window-rear-quarter-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.03, "height": 0.28, "depth": 0.55}, "transform": {"position": [0.775, 1.55, -0.6], "rotation": [0, 0, 0], "scale": [0.03, 0.28, 0.55]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}}, "material": "mat-glass-tint", "materialLayers": ["mat-glass-tint"], "deformations": [], "joints": [], "seams": [{"id": "window-rear-quarter-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_window_rear_quarter_right_32.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}};
  (nodes["root"] ?? root).add(node_window_rear_quarter_right_32);
  nodes["window-rear-quarter-right"] = node_window_rear_quarter_right_32;
  const mesh_window_rear_quarter_right_32Geometry = endpoint_window_rear_quarter_right_32
    ? new THREE.CylinderGeometry(endpoint_window_rear_quarter_right_32.endRadius, endpoint_window_rear_quarter_right_32.baseRadius, endpoint_window_rear_quarter_right_32.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh_window_rear_quarter_right_32 = new THREE.Mesh(
    mesh_window_rear_quarter_right_32Geometry,
    materialMap["mat-glass-tint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_window_rear_quarter_right_32.name = "Right Rear-Quarter Window";
  if (endpoint_window_rear_quarter_right_32) {
    mesh_window_rear_quarter_right_32.position.copy(endpoint_window_rear_quarter_right_32.midpoint);
    mesh_window_rear_quarter_right_32.quaternion.copy(endpoint_window_rear_quarter_right_32.quaternion);
  }
  mesh_window_rear_quarter_right_32.castShadow = options.castShadow ?? true;
  mesh_window_rear_quarter_right_32.receiveShadow = options.receiveShadow ?? true;
  mesh_window_rear_quarter_right_32.userData.sculptComponent = {"id": "window-rear-quarter-right", "name": "Right Rear-Quarter Window", "level": "meso", "role": "glass-panel", "importance": 0.7, "confidence": 0.75, "primitive": "box", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "window-rear-quarter-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "bolted-panel", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "width": 0.03, "height": 0.28, "depth": 0.55}, "transform": {"position": [0.775, 1.55, -0.6], "rotation": [0, 0, 0], "scale": [0.03, 0.28, 0.55]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-glass-tint"}}, "material": "mat-glass-tint", "materialLayers": ["mat-glass-tint"], "deformations": [], "joints": [], "seams": [{"id": "window-rear-quarter-right-seam", "parentRef": "root", "kind": "panel-line"}], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "structural-pass"};
  node_window_rear_quarter_right_32.add(mesh_window_rear_quarter_right_32);
  meshes["window-rear-quarter-right"] = mesh_window_rear_quarter_right_32;
  colliders["window-rear-quarter-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_window_rear_quarter_right_32);

  const attachment_rollcage_brace_left_33 = {"parentId": null, "parentSocket": "rollcage-brace-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]};
  const endpoint_rollcage_brace_left_33 = makeAttachmentEndpoint(attachment_rollcage_brace_left_33);
  const node_rollcage_brace_left_33 = new THREE.Group();
  node_rollcage_brace_left_33.name = "Roll-Cage X-Brace (Left, seen through glass)__pivot";
  if (endpoint_rollcage_brace_left_33) {
    node_rollcage_brace_left_33.position.copy(endpoint_rollcage_brace_left_33.start);
    node_rollcage_brace_left_33.rotation.set(0, 0, 0);
    node_rollcage_brace_left_33.scale.set(1, 1, 1);
  } else {
    node_rollcage_brace_left_33.position.set(-0.775, 1.55, -0.6);
    node_rollcage_brace_left_33.rotation.set(0.0, 0.0, 0.9);
    node_rollcage_brace_left_33.scale.set(0.03, 0.55, 0.03);
  }
  node_rollcage_brace_left_33.userData.sculptComponent = {"id": "rollcage-brace-left", "name": "Roll-Cage X-Brace (Left, seen through glass)", "level": "micro", "role": "support", "importance": 0.4, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rollcage-brace-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.015, "length": 0.55, "width": 0.03, "height": 0.55, "depth": 0.03}, "transform": {"position": [-0.775, 1.55, -0.6], "rotation": [0, 0, 0.9], "scale": [0.03, 0.55, 0.03]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-rollcage-metal"}}, "material": "mat-rollcage-metal", "materialLayers": ["mat-rollcage-metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "form-refinement"};
  node_rollcage_brace_left_33.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-rollcage-metal"}};
  (nodes["root"] ?? root).add(node_rollcage_brace_left_33);
  nodes["rollcage-brace-left"] = node_rollcage_brace_left_33;
  const mesh_rollcage_brace_left_33Geometry = endpoint_rollcage_brace_left_33
    ? new THREE.CylinderGeometry(endpoint_rollcage_brace_left_33.endRadius, endpoint_rollcage_brace_left_33.baseRadius, endpoint_rollcage_brace_left_33.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_rollcage_brace_left_33 = new THREE.Mesh(
    mesh_rollcage_brace_left_33Geometry,
    materialMap["mat-rollcage-metal"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rollcage_brace_left_33.name = "Roll-Cage X-Brace (Left, seen through glass)";
  if (endpoint_rollcage_brace_left_33) {
    mesh_rollcage_brace_left_33.position.copy(endpoint_rollcage_brace_left_33.midpoint);
    mesh_rollcage_brace_left_33.quaternion.copy(endpoint_rollcage_brace_left_33.quaternion);
  }
  mesh_rollcage_brace_left_33.castShadow = options.castShadow ?? true;
  mesh_rollcage_brace_left_33.receiveShadow = options.receiveShadow ?? true;
  mesh_rollcage_brace_left_33.userData.sculptComponent = {"id": "rollcage-brace-left", "name": "Roll-Cage X-Brace (Left, seen through glass)", "level": "micro", "role": "support", "importance": 0.4, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rollcage-brace-left-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["side-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.015, "length": 0.55, "width": 0.03, "height": 0.55, "depth": 0.03}, "transform": {"position": [-0.775, 1.55, -0.6], "rotation": [0, 0, 0.9], "scale": [0.03, 0.55, 0.03]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-rollcage-metal"}}, "material": "mat-rollcage-metal", "materialLayers": ["mat-rollcage-metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["side-view"], "details": [], "fidelityTier": "form-refinement"};
  node_rollcage_brace_left_33.add(mesh_rollcage_brace_left_33);
  meshes["rollcage-brace-left"] = mesh_rollcage_brace_left_33;
  colliders["rollcage-brace-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_rollcage_brace_left_33);

  const attachment_rollcage_brace_right_34 = {"parentId": null, "parentSocket": "rollcage-brace-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]};
  const endpoint_rollcage_brace_right_34 = makeAttachmentEndpoint(attachment_rollcage_brace_right_34);
  const node_rollcage_brace_right_34 = new THREE.Group();
  node_rollcage_brace_right_34.name = "Roll-Cage X-Brace (Right, seen through glass)__pivot";
  if (endpoint_rollcage_brace_right_34) {
    node_rollcage_brace_right_34.position.copy(endpoint_rollcage_brace_right_34.start);
    node_rollcage_brace_right_34.rotation.set(0, 0, 0);
    node_rollcage_brace_right_34.scale.set(1, 1, 1);
  } else {
    node_rollcage_brace_right_34.position.set(0.775, 1.55, -0.6);
    node_rollcage_brace_right_34.rotation.set(0.0, 0.0, -0.9);
    node_rollcage_brace_right_34.scale.set(0.03, 0.55, 0.03);
  }
  node_rollcage_brace_right_34.userData.sculptComponent = {"id": "rollcage-brace-right", "name": "Roll-Cage X-Brace (Right, seen through glass)", "level": "micro", "role": "support", "importance": 0.4, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rollcage-brace-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.015, "length": 0.55, "width": 0.03, "height": 0.55, "depth": 0.03}, "transform": {"position": [0.775, 1.55, -0.6], "rotation": [0, 0, -0.9], "scale": [0.03, 0.55, 0.03]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-rollcage-metal"}}, "material": "mat-rollcage-metal", "materialLayers": ["mat-rollcage-metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "form-refinement"};
  node_rollcage_brace_right_34.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-rollcage-metal"}};
  (nodes["root"] ?? root).add(node_rollcage_brace_right_34);
  nodes["rollcage-brace-right"] = node_rollcage_brace_right_34;
  const mesh_rollcage_brace_right_34Geometry = endpoint_rollcage_brace_right_34
    ? new THREE.CylinderGeometry(endpoint_rollcage_brace_right_34.endRadius, endpoint_rollcage_brace_right_34.baseRadius, endpoint_rollcage_brace_right_34.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
  const mesh_rollcage_brace_right_34 = new THREE.Mesh(
    mesh_rollcage_brace_right_34Geometry,
    materialMap["mat-rollcage-metal"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rollcage_brace_right_34.name = "Roll-Cage X-Brace (Right, seen through glass)";
  if (endpoint_rollcage_brace_right_34) {
    mesh_rollcage_brace_right_34.position.copy(endpoint_rollcage_brace_right_34.midpoint);
    mesh_rollcage_brace_right_34.quaternion.copy(endpoint_rollcage_brace_right_34.quaternion);
  }
  mesh_rollcage_brace_right_34.castShadow = options.castShadow ?? true;
  mesh_rollcage_brace_right_34.receiveShadow = options.receiveShadow ?? true;
  mesh_rollcage_brace_right_34.userData.sculptComponent = {"id": "rollcage-brace-right", "name": "Roll-Cage X-Brace (Right, seen through glass)", "level": "micro", "role": "support", "importance": 0.4, "confidence": 0.75, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "low-poly game-ready blockout with bevel-ready hard-surface edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.008, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates, panel-block projection", "normalStrategy": "vertex normals from generated geometry, weighted at hard edges"}, "parent": null, "attachment": {"parentId": null, "parentSocket": "rollcage-brace-right-mount", "localStart": [0.0, 0.0, 0.0], "localEnd": [0.0, 0.0, 0.0], "contactType": "axle-pivot", "embedDepth": 0.01, "gapTolerance": 0.005, "evidenceRefs": ["rear-view"]}, "dimensions": {"units": "meters", "confidence": 0.7, "radius": 0.015, "length": 0.55, "width": 0.03, "height": 0.55, "depth": 0.03}, "transform": {"position": [0.775, 1.55, -0.6], "rotation": [0, 0, -0.9], "scale": [0.03, 0.55, 0.03]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body-shell", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "mat-rollcage-metal"}}, "material": "mat-rollcage-metal", "materialLayers": ["mat-rollcage-metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.55, "microRoughness": 0.2, "bumpAmplitude": 0.02, "normalPattern": "panel-grain", "displacementPattern": "none", "occlusionPattern": "seam and cavity darkening", "edgeWearPattern": "light edge wear on bevel crests", "notes": ""}, "evidenceRefs": ["rear-view"], "details": [], "fidelityTier": "form-refinement"};
  node_rollcage_brace_right_34.add(mesh_rollcage_brace_right_34);
  meshes["rollcage-brace-right"] = mesh_rollcage_brace_right_34;
  colliders["rollcage-brace-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified proxy for runtime physics, not the visual mesh."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_rollcage_brace_right_34);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "scripts/extract_reference_pbr.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createOffroadSUV2005LookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Offroad SUV 2005 look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = ["key light: warm-white directional (0xfff3dd) from upper-front-left (-4,6,5), intensity 2.6, matches the reference's soft studio key", "fill light: near-neutral white directional (0xf0f2f5) from upper-front-right (5,3,3), intensity 0.9, lifts shadow side without color-biasing dark matte materials", "rim/environment light: hemisphere sky/ground (0xe7edf1 / 0x2a241c, intensity 0.55) plus a low-intensity blue directional rim (0x6f9fc9, intensity 0.25) from behind for the reference's cool studio backdrop feel, kept low enough that near-black matte materials still read as black rather than navy", "exposure: ACESFilmic tone mapping, exposure 1.3, background solid #2a4258 blue-gray matching the reference studio backdrop", "contact shadow: PCFSoftShadowMap ground-contact shadow via a ShadowMaterial plane under all 4 wheels and the spare-tire overhang"];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "scripts/extract_reference_pbr.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}
