// Live 3D space behind the site: a particle astronaut at the centre, a ring of dust and rocks
// orbiting it, stars and nebula behind. Reads window.SPACE (scroll, spin, cursor) every frame.
//
// Astronaut model: "Astronaut" by Poly by Google, CC-BY 3.0 (via modelviewer.dev shared assets).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const S = window.SPACE;
const wrap = document.getElementById('orbitbg');
const canvas = document.getElementById('space');
const mobile = innerWidth < 860;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  wrap.classList.add('nogl');
  throw e;
}
const pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 500);

const TEAL = new THREE.Color('#5fe6d6');
const BLUE = new THREE.Color('#3d6bff');
const VIOLET = new THREE.Color('#8a6ae8');
const PINK = new THREE.Color('#f0a6dc');        // light pink from the loading screen
const ROSE = new THREE.Color('#e76bc8');
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const uPixel = { value: pixelRatio * innerHeight / 900 };
const uTime = { value: 0 };
const uMouse = { value: new THREE.Vector3(99, 99, 99) };
const uPush = { value: 0 };
const uExplode = { value: 0 };   // 0 → 1 as the exit plays: the astronaut bursts, the ring flings outward
const uTravel = { value: 0 };    // distance flown through the starfield during the warp

function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const softDot = /* glsl */`
  varying vec3 vC; varying float vA;
  void main() {
    float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, 0., d); a *= a;
    gl_FragColor = vec4(vC * a * vA, 1.);
  }`;

/* ---------- stars ---------- */
{
  const N = mobile ? 3500 : 7000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), rnd = new Float32Array(N);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    v.randomDirection().multiplyScalar(rand(90, 200));
    pos.set([v.x, v.y, v.z], i * 3);
    const k = Math.random();
    c.set(k < .78 ? 0xffffff : k < .86 ? TEAL : k < .94 ? PINK : VIOLET);
    col.set([c.r, c.g, c.b], i * 3);
    rnd[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime, uPixel, uTravel, uExplode }, ...additive,
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aRand; uniform float uTime, uPixel, uTravel, uExplode;
      varying vec3 vC; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        if (uTravel > 0.) mv.z = -mod(-mv.z - uTravel, 230.) - .5;   // stars rush past during the warp
        gl_Position = projectionMatrix * mv;
        gl_PointSize = mix(1.2, 4.2, pow(aRand, 7.)) * uPixel * (1. + uExplode * 60. / max(-mv.z, 1.));
        vA = .3 + .7 * (.5 + .5 * sin(uTime * (.4 + aRand * 1.8) + aRand * 90.));
        vC = aColor * .9;
      }`,
    fragmentShader: softDot,
  })));
}

/* ---------- nebula: soft coloured light far behind ---------- */
const nebula = new THREE.Group();
scene.add(nebula);
[
  [TEAL, -48, 14, -95, 120, .2], [BLUE, 40, -12, -110, 150, .22], [VIOLET, 10, 26, -120, 140, .2],
  [ROSE, -30, -30, -90, 110, .13], [TEAL, 60, 30, -130, 120, .1], [PINK, 55, -28, -100, 100, .12],
].forEach(([color, x, y, z, size, op]) => {
  const tex = glowTexture([[0, `rgba(${color.r * 255 | 0},${color.g * 255 | 0},${color.b * 255 | 0},1)`], [.4, 'rgba(40,40,90,.35)'], [1, 'rgba(0,0,0,0)']]);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, opacity: op, ...additive }));
  sp.position.set(x, y, z); sp.scale.setScalar(size); sp.userData.op = op;
  nebula.add(sp);
});

/* ---------- the ring: dust, rocks, orbit lines and a moon, orbiting the centre ---------- */
const ring = new THREE.Group();
ring.rotation.set(.3, 0, -.16);
scene.add(ring);
const uOrbit = { value: 0 };
{
  const N = mobile ? 26000 : 52000;
  const r = new Float32Array(N), th = new Float32Array(N), y = new Float32Array(N), rnd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const band = Math.random() < .58;
    r[i] = band ? 3.3 + Math.abs(gauss()) * .55 : rand(2.4, 9.5);
    th[i] = Math.random() * Math.PI * 2;
    y[i] = gauss() * .045 * Math.pow(r[i], .7);
    rnd[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
  g.setAttribute('aTh', new THREE.BufferAttribute(th, 1));
  g.setAttribute('aY', new THREE.BufferAttribute(y, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime, uPixel, uOrbit, uMouse, uPush, uExplode, uTeal: { value: TEAL }, uBlue: { value: BLUE }, uViolet: { value: VIOLET }, uPink: { value: PINK } },
    ...additive,
    vertexShader: /* glsl */`
      attribute float aR, aTh, aY, aRand;
      uniform float uTime, uPixel, uOrbit, uPush, uExplode; uniform vec3 uMouse, uTeal, uBlue, uViolet, uPink;
      varying vec3 vC; varying float vA;
      void main() {
        float th = aTh + uOrbit * (3.4 / pow(aR, 1.5));          // inner orbits move faster
        float e = uExplode * uExplode, rr = aR * (1. + e * (2. + aRand * 3.));
        vec4 w = modelMatrix * vec4(cos(th) * rr, aY * (1. + e * 30.), sin(th) * rr, 1.);
        vec3 d = w.xyz - uMouse; float dist = length(d);
        w.xyz += normalize(d + vec3(1e-4)) * uPush * exp(-dist * dist * 1.3) * .7;
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        float side = .5 + .5 * cos(th - 3.14159);               // the left side of the ring is lit
        vec3 c = mix(uViolet, uBlue, smoothstep(0., .55, side));
        c = mix(c, uTeal, smoothstep(.55, 1., side));
        c = mix(c, uPink, (1. - smoothstep(.0, .4, side)) * .65);   // the far side of the ring glows pink
        if (aRand > .86 && aRand <= .93) c = mix(c, uPink, .6);
        float band = exp(-pow((aR - 3.45) / .5, 2.));
        float b = .18 + band * 1.25 * (.35 + .65 * side);
        if (aRand > .93) { c = mix(c, vec3(1.), .7); b *= 1.5; }
        vC = c * b;
        vA = .55 + .45 * sin(uTime * 1.3 + aRand * 80.);
        gl_PointSize = mix(1., 2.8, pow(aRand, 4.)) * uPixel * (11. / -mv.z);
      }`,
    fragmentShader: softDot,
  }));
  pts.frustumCulled = false;
  ring.add(pts);

  [4.6, 5.6, 6.8, 8.2].forEach((rad, i) => {
    const pts = new THREE.EllipseCurve(0, 0, rad, rad).getSpacedPoints(256).map(p => new THREE.Vector3(p.x, 0, p.y));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xa9b8ff, opacity: .16 - i * .025, ...additive }));
    ring.add(line);
  });
}
const moon = new THREE.Mesh(new THREE.SphereGeometry(.12, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0xd8deef, roughness: .7, emissive: 0x223044, emissiveIntensity: .4 }));
ring.add(moon);

// rocks drifting in the band
const ROCKS = mobile ? 90 : 180;
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
{
  const p = rockGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rand(.75, 1.2), p.getY(i) * rand(.7, 1.15), p.getZ(i) * rand(.75, 1.2));
  rockGeo.computeVertexNormals();
}
const rocks = new THREE.InstancedMesh(rockGeo,
  new THREE.MeshStandardMaterial({ color: 0x1c2131, roughness: .85, metalness: .15, flatShading: true }), ROCKS);
const rockData = Array.from({ length: ROCKS }, () => ({
  r: Math.random() < .75 ? 3.3 + Math.abs(gauss()) * .7 : rand(4.2, 7.5),
  th: Math.random() * Math.PI * 2, y: gauss() * .1, s: rand(.018, .085) * (Math.random() < .08 ? 2 : 1),
  axis: new THREE.Vector3().randomDirection(), spin: rand(.2, 1.2),
}));
ring.add(rocks);

/* ---------- lights ---------- */
const coreLight = new THREE.PointLight(0x9ef0e6, 26, 0, 2);
scene.add(coreLight);
scene.add(new THREE.HemisphereLight(0x6a78ff, 0x05050c, .35));
const rim = new THREE.DirectionalLight(0xd99ad8, 1.1); rim.position.set(6, 3, -4); scene.add(rim);

/* ---------- the centre: a glowing particle astronaut ---------- */
const hero = new THREE.Group();
scene.add(hero);
const halo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture([[0, 'rgba(180,245,240,.9)'], [.25, 'rgba(150,170,240,.35)'], [.55, 'rgba(240,166,220,.14)'], [1, 'rgba(0,0,0,0)']]),
  opacity: .2, ...additive,
}));
halo.scale.setScalar(6);
hero.add(halo);

function particleBody(positions, normals) {
  const N = positions.length / 3;
  const rnd = new Float32Array(N * 3);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('aNormal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime, uPixel, uMouse, uPush, uExplode, uTeal: { value: TEAL }, uViolet: { value: VIOLET }, uPink: { value: PINK } },
    ...additive,
    vertexShader: /* glsl */`
      attribute vec3 aNormal, aRand;
      uniform float uTime, uPixel, uPush, uExplode; uniform vec3 uMouse, uTeal, uViolet, uPink;
      varying vec3 vC; varying float vA;
      void main() {
        vec3 p = position;
        // a few particles keep peeling off the surface and drifting away
        float drift = step(.86, aRand.x) * fract(uTime * (.05 + aRand.y * .08) + aRand.z);
        p += aNormal * drift * (.5 + aRand.y * .9) + vec3(0., drift * .35, 0.);
        // gentle shimmer along the surface
        p += aNormal * sin(uTime * 1.4 + aRand.z * 40. + p.y * 4.) * .012;
        // exit: the body bursts into stardust that streams outward and swirls
        float ex = uExplode * uExplode;
        vec3 dir = normalize(aNormal + (aRand - .5) * 1.6);
        p += dir * ex * (2.5 + aRand.x * 10.);
        float sw = ex * (1.5 + aRand.y * 2.);
        p.xz = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p.xz;
        vec4 w = modelMatrix * vec4(p, 1.);
        // the cursor scatters the body
        vec3 d = w.xyz - uMouse; float dist = length(d);
        float f = uPush * exp(-dist * dist * 2.4);
        w.xyz += normalize(d + vec3(1e-4)) * f * 1.1 + (aRand - .5) * f * .9;
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        vec3 n = normalize(normalMatrix * aNormal);
        float fres = 1. - abs(dot(n, normalize(-mv.xyz)));
        float h = clamp(position.y * .32 + .5 + (aRand.y - .5) * .25, 0., 1.);
        vec3 c = mix(uPink, uViolet, smoothstep(.0, .45, h));     // pink at the feet, violet, then teal at the helmet
        c = mix(c, uTeal, smoothstep(.45, 1., h));
        if (aRand.z > .9) c = mix(c, vec3(1.), .75);
        vC = c * (.24 + fres * .7) * (1. - drift * .8);
        vC *= 1. + uExplode * 1.1;
        vA = (.6 + .4 * sin(uTime * 1.7 + aRand.z * 70.)) * (1. - smoothstep(.7, 1., uExplode));
        gl_PointSize = mix(.9, 2.6, pow(aRand.y, 3.)) * uPixel * (11. / -mv.z) * (1. + drift + uExplode * 1.5);
      }`,
    fragmentShader: softDot,
  }));
  pts.frustumCulled = false;
  return pts;
}

function orbFallback() {                     // used only if the model can't load
  const N = 22000, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.randomDirection();
    nor.set([v.x, v.y, v.z], i * 3);
    v.multiplyScalar(1.15 + gauss() * .03);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  hero.add(particleBody(pos, nor));
}

new GLTFLoader().load('assets/astronaut.glb', gltf => {
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const flat = new THREE.BufferGeometry();
    const src = g.index ? g.toNonIndexed() : g;
    flat.setAttribute('position', src.attributes.position);
    if (!src.attributes.normal) src.computeVertexNormals();
    flat.setAttribute('normal', src.attributes.normal);
    parts.push(flat);
  });
  const merged = mergeGeometries(parts);
  merged.computeBoundingBox();
  const box = merged.boundingBox, size = new THREE.Vector3(), centre = new THREE.Vector3();
  box.getSize(size); box.getCenter(centre);
  const k = 3.1 / size.y;                                    // astronaut ~3.1 units tall
  merged.translate(-centre.x, -centre.y, -centre.z).scale(k, k, k);

  const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();
  const N = mobile ? 32000 : 60000;
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    sampler.sample(p, n);
    pos.set([p.x, p.y, p.z], i * 3); nor.set([n.x, n.y, n.z], i * 3);
  }
  hero.add(particleBody(pos, nor));
}, undefined, orbFallback);

/* ---------- post: bloom gives the particles their glow ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .6, .5, .22);
composer.addPass(bloom);

// cursor ripples + glitch: moving the cursor sends ripples through space, fast moves tear and split the colours
const MAX_RIPPLES = 12;
const ripplePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: innerWidth / innerHeight },
    uMouse: { value: new THREE.Vector2(.5, .6) }, uSpeed: { value: 0 },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -10, 0)) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAspect, uSpeed; uniform vec2 uMouse;
    uniform vec4 uRipples[${MAX_RIPPLES}];
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    void main() {
      vec2 uv = vUv, off = vec2(0.); float ring = 0.;
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = uRipples[i];                       // xy position, z start time, w strength
        float age = uTime - r.z;
        if (age < 0. || age > 1.) continue;
        vec2 d = uv - r.xy; d.x *= uAspect;
        float dist = length(d), rad = age * (.14 + r.w * .08);
        float w = exp(-pow((dist - rad) * 42., 2.)) * (1. - age) * r.w;
        off += normalize(d + 1e-5) / vec2(uAspect, 1.) * w * .008;
        ring += w;
      }
      vec2 md = uv - uMouse; md.x *= uAspect;
      float g = uSpeed * exp(-dot(md, md) * 70.);
      float frame = floor(uTime * 24.), slice = floor(uv.y * 54.);
      if (hash(vec2(slice, frame)) > .86) off.x += (hash(vec2(slice * 1.7, frame)) - .5) * .045 * g;
      float ca = .0012 * ring + .004 * g;
      vec2 dir = normalize(md + 1e-5) / vec2(uAspect, 1.);
      gl_FragColor = vec4(
        texture2D(tDiffuse, uv + off + dir * ca).r,
        texture2D(tDiffuse, uv + off).g,
        texture2D(tDiffuse, uv + off - dir * ca).b, 1.);
    }`,
});
composer.addPass(ripplePass);
composer.addPass(new OutputPass());

let rippleIdx = 0, lastRipple = new THREE.Vector2(-1, -1), cursorSpeed = 0;
const cursorUv = () => new THREE.Vector2(S.mx * .5 + .5, S.my * .5 + .5);
function addRipple(at, strength) {
  ripplePass.uniforms.uRipples.value[rippleIdx].set(at.x, at.y, uTime.value, strength);
  rippleIdx = (rippleIdx + 1) % MAX_RIPPLES;
}
addEventListener('pointerdown', () => { if (S.active) addRipple(cursorUv(), 1.5); });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  uPixel.value = pixelRatio * innerHeight / 900;
  ripplePass.uniforms.uAspect.value = innerWidth / innerHeight;
}
addEventListener('resize', resize);

/* ---------- frame loop ---------- */
const clock = new THREE.Clock();
const ray = new THREE.Raycaster(), plane = new THREE.Plane(), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
const target = new THREE.Vector3(), camDir = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
let lastMx = 0, lastMy = 0, push = 0, idle = 0, darkFrames = 0;
const smoothstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

function frame() {
  requestAnimationFrame(frame);
  if (!S.active) return;
  const dt = Math.min(clock.getDelta(), .05);
  const t = clock.elapsedTime;
  uTime.value = t;
  idle += dt;

  // orbit: always turning, faster while scrolling
  uOrbit.value += S.spin * 6 * dt;
  rockData.forEach((d, i) => {
    const th = d.th + uOrbit.value * (3.4 / Math.pow(d.r, 1.5)), fl = 1 + uExplode.value * uExplode.value * 3.5;
    q.setFromAxisAngle(d.axis, t * d.spin);
    m4.compose(target.set(Math.cos(th) * d.r * fl, d.y * fl * 4, Math.sin(th) * d.r * fl), q, camDir.setScalar(d.s));
    rocks.setMatrixAt(i, m4);
  });
  rocks.instanceMatrix.needsUpdate = true;
  const mth = 1.1 + uOrbit.value * (3.4 / Math.pow(5.6, 1.5));
  const mfl = 1 + uExplode.value * uExplode.value * 3;
  moon.position.set(Math.cos(mth) * 5.6 * mfl, 0, Math.sin(mth) * 5.6 * mfl);

  // the astronaut floats and slowly turns, leaning towards the cursor
  hero.position.y = Math.sin(t * .6) * .08;
  hero.rotation.y += ((-.35 + Math.sin(t * .15) * .45 + S.mx * .35) - hero.rotation.y) * .03;
  hero.rotation.x += ((-S.my * .12 + Math.sin(t * .4) * .04) - hero.rotation.x) * .03;
  hero.rotation.z = Math.sin(t * .3) * .05;

  // camera travels around the orbit as the page scrolls; on exit it dives through the ring
  const p = S.progress;
  const ex = S.exit, exE = ex * ex * (3 - 2 * ex);
  uExplode.value = exE;
  uTravel.value += dt * exE * exE * 320;
  if (ex <= 0) uTravel.value = 0;
  uOrbit.value += dt * exE * 4;
  const ang = p * 1.5 + idle * .015 + S.mx * .06;
  const radius = ((mobile ? 15.5 : 12.5) - p * 1.4) * (1 - exE * .82);
  camera.position.set(Math.sin(ang) * radius, (.9 + p * 1.1 + S.my * .3) * (1 - exE), Math.cos(ang) * radius);
  camera.lookAt(target.set(0, (mobile ? -2.6 : -2.05) * (1 - exE), 0));
  const fov = 42 + exE * 34;
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  nebula.rotation.z = p * .25 + t * .004;
  nebula.children.forEach(n => { n.material.opacity = n.userData.op * (1 - exE); });

  // cursor: a point on a plane through the centre, facing the camera
  ndc.set(S.mx, S.my);
  ray.setFromCamera(ndc, camera);
  camera.getWorldDirection(camDir);
  plane.setFromNormalAndCoplanarPoint(camDir, hero.position);
  if (ray.ray.intersectPlane(plane, hit)) uMouse.value.copy(hit);
  const moved = Math.hypot(S.mx - lastMx, S.my - lastMy) / Math.max(dt, .001);
  lastMx = S.mx; lastMy = S.my;
  push += (Math.min(.35 + moved * .25, 1.4) - push) * (moved > .05 ? .15 : .04);
  uPush.value = push;

  // ripples trail the cursor; speed drives the glitch
  const cu = cursorUv();
  cursorSpeed += (Math.min(moved * .35, 1) - cursorSpeed) * (moved > .05 ? .25 : .06);
  if (lastRipple.x < 0) lastRipple.copy(cu);
  const gap = Math.hypot((cu.x - lastRipple.x) * camera.aspect, cu.y - lastRipple.y);
  if (gap > .07) { addRipple(cu, .35 + Math.min(cursorSpeed, 1) * .5); lastRipple.copy(cu); }
  ripplePass.uniforms.uTime.value = t;
  ripplePass.uniforms.uMouse.value.copy(cu);
  ripplePass.uniforms.uSpeed.value = cursorSpeed;

  const surge = Math.sin(Math.PI * Math.min(1, exE * 1.15));
  coreLight.intensity = (24 + Math.sin(t * 1.3) * 4) * (1 + surge * 2);
  halo.material.opacity = (.17 + Math.sin(t * 1.3) * .04) * (1 + surge * 3) * (1 - exE);
  bloom.strength = .6 + surge * .85;
  renderer.toneMappingExposure = S.intro * 1.05 * (1 - smoothstep(.72, 1, ex));
  if (ex >= 1 && darkFrames > 2) return;               // fully black: stop drawing until we scroll back
  darkFrames = ex >= 1 ? darkFrames + 1 : 0;
  composer.render();
}
renderer.compile(scene, camera);
frame();
