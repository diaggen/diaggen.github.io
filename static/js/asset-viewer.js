import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.querySelector('#asset-canvas');
const tabs = document.querySelector('#asset-tabs');
const title = document.querySelector('#asset-title');
const description = document.querySelector('#asset-description');
const status = document.querySelector('#asset-status');
const modeInputs = [...document.querySelectorAll('input[name="asset-view-mode"]')];
const partLegend = document.querySelector('#asset-part-legend');
const resetCameraButton = document.querySelector('#asset-reset-camera');

if (host && tabs) {
  startViewer().catch((error) => {
    if (status) {
      status.dataset.state = 'error';
      status.textContent = `Viewer unavailable: ${error.message}`;
    }
    console.error('Asset viewer:', error);
  });
}

async function startViewer() {
  const response = await fetch('./static/assets/manifest.json');
  if (!response.ok) throw new Error(`Asset catalog could not be loaded (${response.status})`);
  const catalog = await response.json();
  const assets = Array.isArray(catalog) ? catalog : catalog.assets;
  if (!Array.isArray(assets) || !assets.length) throw new Error('Asset catalog is empty');

  const canvas = host instanceof HTMLCanvasElement ? host : document.createElement('canvas');
  if (canvas !== host) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.append(canvas);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const camera = new THREE.PerspectiveCamera(36, 1, 0.001, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  // The white stage is deliberately lit, not an unlit background plane: its
  // shadow is cast by the same key light that shapes the object.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    // A shadow-only receiver is visually white against the white scene, while
    // still showing the real light's soft contact shadow without a gray edge.
    new THREE.ShadowMaterial({ color: 0x42474d, opacity: 0.32 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dbe1, 1.5));
  const key = new THREE.DirectionalLight(0xfff8ee, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00003;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe3ecff, 0.85);
  scene.add(fill);

  const loader = new GLTFLoader();
  const cache = new Map();
  let activeKey = null;
  let activeEntry = null;
  let pendingController = null;
  let requestId = 0;
  let defaultCamera = null;

  const existingTabs = [...tabs.querySelectorAll('[data-asset]')];
  for (const [index, asset] of assets.entries()) {
    const button = existingTabs.find((item) => item.dataset.asset === asset.id) || document.createElement('button');
    if (!button.isConnected) {
      button.type = 'button';
      button.className = 'asset-tab';
      button.textContent = asset.label || asset.id;
      tabs.append(button);
    }
    button.dataset.asset = asset.id;
    button.id ||= `asset-tab-${asset.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'asset-panel');
    button.addEventListener('click', () => selectAsset(asset.id));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + assets.length) % assets.length;
      tabs.querySelector(`[data-asset="${assets[next].id}"]`)?.focus();
      selectAsset(assets[next].id);
    });
    tabs.append(button);
  }
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Interactive asset selection');

  for (const input of modeInputs) {
    input.addEventListener('change', () => {
      if (input.checked && currentAssetId) selectAsset(currentAssetId);
    });
  }
  resetCameraButton?.addEventListener('click', resetCamera);

  let currentAssetId = null;

  function selectedMode() {
    return modeInputs.find((input) => input.checked)?.value || 'surface';
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas === host ? host.parentElement : host);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  await selectAsset(assets[0].id);

  window.addEventListener('beforeunload', () => {
    pendingController?.abort();
    resizeObserver.disconnect();
    for (const entry of cache.values()) disposeEntry(entry);
    controls.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
    renderer.dispose();
  }, { once: true });

  function resize() {
    const bounds = canvas === host ? host.getBoundingClientRect() : host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    if (width === renderer.domElement.width && height === renderer.domElement.height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (activeEntry) fitCamera(activeEntry, true);
  }

  async function selectAsset(id) {
    const asset = assets.find((candidate) => candidate.id === id);
    if (!asset) return;
    const switchingModeForSameAsset = currentAssetId === id && !!activeEntry;
    currentAssetId = id;
    for (const input of modeInputs) {
      input.disabled = (input.value === 'source' && !asset.sourceGlb)
        || (input.value === 'segmentation' && !asset.segmentationGlb);
    }
    if (modeInputs.find((input) => input.checked)?.disabled) {
      modeInputs.find((input) => input.value === 'surface').checked = true;
    }
    const mode = selectedMode();
    const renderKind = mode === 'source' || mode === 'segmentation' ? mode : 'final';
    const keyName = `${id}:${renderKind}`;
    for (const button of tabs.children) {
      const selected = button.dataset.asset === id;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    document.querySelector('#asset-panel')?.setAttribute('aria-labelledby', `asset-tab-${id}`);
    if (title) title.textContent = asset.label || asset.id;
    if (description) description.textContent = asset.description || '';
    if (partLegend) {
      partLegend.hidden = mode !== 'segmentation';
      partLegend.replaceChildren();
      if (mode === 'segmentation') {
        for (const part of asset.parts || []) {
          const item = document.createElement('span');
          item.className = 'asset-part-legend-item';
          const swatch = document.createElement('span');
          swatch.className = 'asset-part-legend-swatch';
          swatch.style.setProperty('--part-color', part.color);
          swatch.setAttribute('aria-hidden', 'true');
          item.append(swatch, document.createTextNode(part.name));
          partLegend.append(item);
        }
      }
    }
    if (activeKey === keyName) {
      if (activeEntry) updateModePresentation(activeEntry, asset, mode);
      return;
    }
    activeKey = keyName;
    const serial = ++requestId;
    pendingController?.abort();
    pendingController = null;
    if (status) {
      status.dataset.state = 'loading';
      status.textContent = `Loading ${asset.label || asset.id}…`;
    }

    if (activeEntry) {
      scene.remove(activeEntry.group);
      activeEntry = null;
    }

    try {
      let entry = cache.get(keyName);
      if (!entry) {
        const controller = new AbortController();
        pendingController = controller;
        const glbUrl = renderKind === 'source' ? asset.sourceGlb
          : renderKind === 'segmentation' ? asset.segmentationGlb : asset.glb;
        const [glbResponse, meshResponse] = await Promise.all([
          fetch(glbUrl, { signal: controller.signal }),
          renderKind === 'final' ? fetch(asset.mesh, { signal: controller.signal }) : Promise.resolve(null),
        ]);
        if (!glbResponse.ok || (meshResponse && !meshResponse.ok)) throw new Error('One or more model files could not be loaded');
        const [glbData, meshText] = await Promise.all([glbResponse.arrayBuffer(), meshResponse?.text()]);
        if (serial !== requestId) return;
        const gltf = await loader.parseAsync(glbData, new URL('.', new URL(glbUrl, location.href)).href);
        if (serial !== requestId) {
          disposeObject(gltf.scene);
          return;
        }
        const tetMesh = meshText ? parseMeditMesh(meshText) : null;
        entry = createEntry(gltf.scene, tetMesh, asset, renderer, renderKind);
        cache.set(keyName, entry);
        // Keep recently visited models instant to revisit, while bounding GPU memory.
        while (cache.size > 3) {
          const [oldId, oldEntry] = cache.entries().next().value;
          cache.delete(oldId);
          if (oldEntry !== entry) disposeEntry(oldEntry);
        }
      } else {
        cache.delete(keyName);
        cache.set(keyName, entry);
      }

      if (serial !== requestId) return;
      pendingController = null;
      activeEntry = entry;
      scene.add(entry.group);
      configureStage(entry, asset);
      fitCamera(entry, switchingModeForSameAsset);
      updateModePresentation(entry, asset, selectedMode());
    } catch (error) {
      if (error.name === 'AbortError' || serial !== requestId) return;
      activeKey = null;
      if (status) {
        status.dataset.state = 'error';
        status.textContent = `Could not load ${asset.label || asset.id}: ${error.message}`;
      }
      console.error(`Asset viewer (${id}):`, error);
    }
  }

  function updateModePresentation(entry, asset, mode) {
    if (entry.edges) entry.edges.visible = mode === 'tets';
    // Show the new mode before announcing it as ready, including on cached switches.
    renderer.render(scene, camera);
    if (!status) return;
    status.dataset.state = 'ready';
    if (mode === 'source') {
      status.textContent = 'Source-detail render · not the final tet boundary · drag to rotate · scroll to zoom';
    } else if (mode === 'segmentation') {
      status.textContent = `${(asset.parts || []).length} labeled parts · final tet-boundary segmentation · drag to rotate · scroll to zoom`;
    } else {
      const boundary = mode === 'tets' ? 'tet boundary edges' : 'exact textured tet boundary';
      status.textContent = `${entry.tetCount.toLocaleString()} tetrahedra · ${boundary} · drag to rotate · scroll to zoom`;
    }
  }

  function configureStage(entry, asset) {
    const size = entry.bounds.getSize(new THREE.Vector3());
    const diameter = Math.max(size.x, size.y, size.z);
    floor.scale.setScalar(diameter * 7);
    floor.position.y = -Math.max(diameter * 0.001, 0.00005);

    key.position.set(diameter * -2.5, diameter * 4.3, diameter * 3.2);
    key.target.position.set(0, size.y * 0.43, 0);
    key.shadow.camera.left = -diameter * 2.4;
    key.shadow.camera.right = diameter * 2.4;
    key.shadow.camera.top = diameter * 2.4;
    key.shadow.camera.bottom = -diameter * 2.4;
    key.shadow.camera.near = diameter * 0.1;
    key.shadow.camera.far = diameter * 11;
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.normalBias = diameter * 0.01;
    fill.position.set(diameter * 2.5, diameter * 1.7, diameter * -2.5);
    if (asset.display?.light) {
      const [x, y, z] = asset.display.light;
      key.position.set(x * diameter, y * diameter, z * diameter);
    }
  }

  function fitCamera(entry, retainOrientation = false) {
    const size = entry.bounds.getSize(new THREE.Vector3());
    const center = new THREE.Vector3(0, size.y * 0.48, 0);
    const radius = entry.bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const heightDistance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const widthDistance = heightDistance / camera.aspect;
    const zoom = Number(entry.asset.display?.zoom) || 1;
    const distance = Math.max(heightDistance, widthDistance) * 1.15 / zoom;
    const view = entry.asset.display?.camera || [1.6, 0.85, 2.0];
    const direction = retainOrientation && defaultCamera
      ? camera.position.clone().sub(controls.target).normalize()
      : new THREE.Vector3(...view).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 1000, 0.00001);
    camera.far = distance * 25;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = distance * 0.25;
    controls.maxDistance = distance * 5;
    controls.update();
    defaultCamera = { position: camera.position.clone(), target: center.clone() };
  }

  function resetCamera() {
    if (!activeEntry) return;
    fitCamera(activeEntry);
  }
}

function createEntry(visual, tetMesh, asset, renderer, renderKind) {
  const group = new THREE.Group();
  if (renderKind === 'source' && asset.sourceScale) visual.scale.multiplyScalar(asset.sourceScale);
  visual.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material?.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (material && tetMesh) {
        // Nudge the filled triangles behind the coincident physics edges.
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
      }
    }
  });
  group.add(visual);

  let edges = null;
  if (tetMesh) {
    const edgePositions = extractBoundaryEdges(tetMesh);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
      color: 0x344a69,
      transparent: true,
      opacity: 0.7,
      depthTest: true,
      depthWrite: false,
    }));
    edges.renderOrder = 2;
    edges.visible = false;
    group.add(edges);
  }

  const rotation = asset.display?.rotationDeg || [0, 0, 0];
  group.rotation.set(...rotation.map(THREE.MathUtils.degToRad));
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const center = bounds.getCenter(new THREE.Vector3());
  group.position.set(-center.x, -bounds.min.y, -center.z);
  group.updateMatrixWorld(true);
  const stageBounds = new THREE.Box3().setFromObject(visual);

  return { group, edges, bounds: stageBounds, asset, tetCount: tetMesh ? tetMesh.tets.length / 4 : 0 };
}

function parseMeditMesh(text) {
  const lines = text.split(/\r?\n/);
  let vertices = null;
  let tets = null;
  for (let line = 0; line < lines.length; line++) {
    const section = lines[line].trim();
    if (section !== 'Vertices' && section !== 'Tetrahedra') continue;
    const count = Number(lines[++line].trim());
    if (!Number.isInteger(count) || count < 0) throw new Error(`Invalid ${section} count`);
    const values = section === 'Vertices' ? new Float32Array(count * 3) : new Uint32Array(count * 4);
    const width = section === 'Vertices' ? 3 : 4;
    for (let row = 0; row < count; row++) {
      const parts = lines[++line].trim().split(/\s+/);
      if (parts.length < width) throw new Error(`Truncated ${section} section`);
      for (let column = 0; column < width; column++) {
        const value = Number(parts[column]);
        if (!Number.isFinite(value)) throw new Error(`Invalid ${section} coordinate/index`);
        values[row * width + column] = section === 'Tetrahedra' ? value - 1 : value;
      }
    }
    if (section === 'Vertices') vertices = values;
    else tets = values;
  }
  if (!vertices || !tets) throw new Error('Expected Vertices and Tetrahedra in .mesh');
  return { vertices, tets };
}

function extractBoundaryEdges({ vertices, tets }) {
  const faceCounts = new Map();
  for (let i = 0; i < tets.length; i += 4) {
    const a = tets[i], b = tets[i + 1], c = tets[i + 2], d = tets[i + 3];
    for (const [x, y, z] of [[a, b, c], [a, b, d], [a, c, d], [b, c, d]]) {
      const key = [x, y, z].sort((p, q) => p - q).join(',');
      const face = faceCounts.get(key);
      if (face) face.count++;
      else faceCounts.set(key, { count: 1, indices: [x, y, z] });
    }
  }
  const edgeKeys = new Set();
  const positions = [];
  for (const face of faceCounts.values()) {
    if (face.count !== 1) continue;
    const [a, b, c] = face.indices;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const low = Math.min(x, y), high = Math.max(x, y);
      const key = `${low},${high}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      positions.push(
        vertices[low * 3], vertices[low * 3 + 1], vertices[low * 3 + 2],
        vertices[high * 3], vertices[high * 3 + 1], vertices[high * 3 + 2],
      );
    }
  }
  return new Float32Array(positions);
}

function disposeEntry(entry) {
  entry.group.removeFromParent();
  disposeObject(entry.group);
}

function disposeObject(root) {
  const textures = new Set();
  root.traverse((child) => {
    child.geometry?.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}
