import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";

/**
 * The 3D backdrop: a field of points rolling like a waveform (the stream's audio, if you like),
 * with a wireframe 9:16 clip frame turning slowly above it, the Clip2Short mark in space.
 * The pointer sends a ripple through the field and leans the frame; scrolling turns it.
 *
 *   variant "hero"  sits on the page background (light or dark), points tinted with the brand.
 *   variant "dark"  is the always-dark feature band, brighter and additive.
 */

export interface WaveOptions {
  variant: "hero" | "dark";
  reducedMotion: boolean;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uAmp;
  uniform vec2 uMouse;
  attribute float aRand;
  varying float vH;
  varying float vFade;
  void main() {
    vec3 p = position;
    float t = uTime;
    float h = sin(p.x * 0.26 + t * 0.55) * 0.55
            + sin(p.z * 0.40 - t * 0.42) * 0.45
            + sin((p.x + p.z) * 0.15 + t * 0.28) * 0.75;
    float d = distance(p.xz, uMouse);
    h += sin(d * 1.1 - t * 2.4) * 0.45 * exp(-d * 0.16);
    p.y += h * uAmp;
    vH = h;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.55 + aRand * 0.7) * (20.0 / -mv.z);
    vFade = smoothstep(58.0, 14.0, -mv.z) * smoothstep(0.5, 4.0, -mv.z);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uOpacity;
  varying float vH;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.08, r);
    vec3 col = mix(uA, uB, smoothstep(-1.1, 1.3, vH));
    gl_FragColor = vec4(col, a * vFade * uOpacity);
  }
`;

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(v || fallback);
}

function isDarkTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t === "dark";
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

/** The clip frame: outer 9:16 box, sprocket rails with rungs down both sides, a play mark in the middle. */
function buildFrame(color: Color) {
  const group = new Group();
  const mat = new LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const W = 2.25,
    H = 4,
    D = 0.32;
  group.add(new LineSegments(new EdgesGeometry(new BoxGeometry(W, H, D)), mat));

  const pts: number[] = [];
  const seg = (a: number[], b: number[]) => pts.push(...a, ...b);
  const rail = W / 2 - 0.34;
  for (const z of [D / 2, -D / 2]) {
    for (const s of [-1, 1]) {
      seg([s * rail, -H / 2, z], [s * rail, H / 2, z]);
      for (let k = 1; k < 12; k++) {
        const y = -H / 2 + (k * H) / 12;
        seg([s * rail, y, z], [s * (W / 2), y, z]);
      }
    }
  }
  // Play mark, front face.
  const z = D / 2;
  seg([-0.32, -0.42, z], [0.42, 0, z]);
  seg([0.42, 0, z], [-0.32, 0.42, z]);
  seg([-0.32, 0.42, z], [-0.32, -0.42, z]);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  group.add(new LineSegments(g, mat));
  return { group, mat };
}

export function mountWave(canvas: HTMLCanvasElement, opts: WaveOptions) {
  const dark = opts.variant === "dark";
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, dark ? 5.5 : 4.2, 16);
  camera.lookAt(0, dark ? 0.5 : 1.2, 0);

  // Point field.
  const COLS = dark ? 220 : 190;
  const ROWS = dark ? 100 : 90;
  const SPACING = 0.42;
  const pos = new Float32Array(COLS * ROWS * 3);
  const rnd = new Float32Array(COLS * ROWS);
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      pos[n * 3] = (c - COLS / 2) * SPACING;
      pos[n * 3 + 1] = 0;
      pos[n * 3 + 2] = 9 - r * SPACING;
      rnd[n] = ((c * 73856093) ^ (r * 19349663)) % 1000 / 1000;
      n++;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("aRand", new Float32BufferAttribute(rnd, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: dark ? 2.6 : 2.3 },
    uAmp: { value: dark ? 1.25 : 0.95 },
    uMouse: { value: new Vector2(0, -6) },
    uA: { value: new Color() },
    uB: { value: new Color() },
    uOpacity: { value: 1 },
  };
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: dark ? AdditiveBlending : NormalBlending,
  });
  const field = new Points(geo, mat);
  field.position.y = dark ? -1.2 : -1.0;
  scene.add(field);

  const frame = buildFrame(new Color());
  frame.group.position.set(dark ? 5.2 : 0.4, dark ? 3.2 : 2.7, dark ? 0 : -1);
  frame.group.rotation.z = dark ? -0.42 : 0.38;
  frame.group.scale.setScalar(dark ? 1.15 : 1.7);
  scene.add(frame.group);

  const applyTheme = () => {
    const signal = cssColor("--color-signal", "#4a72e6");
    const vice = cssColor("--color-vice", "#2ad4d1");
    if (dark) {
      uniforms.uA.value.set("#5a1d6e");
      uniforms.uB.value.set("#ff7a2e");
      uniforms.uOpacity.value = 0.9;
      frame.mat.color.set("#ff8a3d");
    } else {
      const darkTheme = isDarkTheme();
      uniforms.uA.value.copy(signal);
      uniforms.uB.value.copy(vice);
      uniforms.uOpacity.value = darkTheme ? 0.85 : 0.75;
      frame.mat.color.copy(vice);
    }
  };
  applyTheme();

  // Size.
  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the frame in view on narrow screens.
    camera.position.z = w / h < 0.8 ? 22 : 16;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Pointer: leans the frame and drops a ripple where it points on the field.
  let mx = 0,
    my = 0,
    lmx = 0,
    lmy = 0;
  const onMove = (e: PointerEvent) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  // Theme switches recolour the scene.
  const mo = new MutationObserver(applyTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", applyTheme);

  // Only animate while on screen and the tab is visible.
  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  });
  io.observe(canvas);

  let raf = 0;
  let last = performance.now();
  let t = 0;
  const render = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    lmx += (mx - lmx) * 0.05;
    lmy += (my - lmy) * 0.05;
    const scrollTurn = window.scrollY / window.innerHeight;
    uniforms.uTime.value = t;
    uniforms.uMouse.value.set(lmx * 30, -lmy * 14 - 4);
    frame.group.rotation.y = t * 0.32 + scrollTurn * 1.6 + lmx * 0.6;
    frame.group.rotation.x = lmy * 0.35;
    frame.group.position.y = (dark ? 3.2 : 2.7) + Math.sin(t * 0.8) * 0.12;
    camera.position.x = lmx * 1.2;
    renderer.render(scene, camera);
  };
  const tick = () => {
    if (!visible || document.hidden) {
      raf = 0;
      return;
    }
    render();
    raf = requestAnimationFrame(tick);
  };
  function start() {
    if (opts.reducedMotion) {
      render();
      return;
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  const onVis = () => !document.hidden && start();
  document.addEventListener("visibilitychange", onVis);
  if (opts.reducedMotion) {
    t = 1.5;
    render();
    ro.disconnect();
    new ResizeObserver(() => {
      resize();
      render();
    }).observe(canvas);
  }
  start();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    mo.disconnect();
    mq.removeEventListener("change", applyTheme);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("visibilitychange", onVis);
    geo.dispose();
    mat.dispose();
    frame.mat.dispose();
    frame.group.traverse((o) => (o as LineSegments).geometry?.dispose());
    renderer.dispose();
  };
}
