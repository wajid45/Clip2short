import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";

/**
 * Hero backdrop: a sunset horizon. A wide arc of light sits just below the fold (the edge of a
 * planet at dusk), and slow, domain-warped light drifts above it in the brand's sunset colours,
 * the same gradient as the call to action. The pointer nudges the horizon; it is drawn at
 * half resolution (it is all soft gradients) and only animates while on screen.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uMouse;
  uniform float uDark;
  varying vec2 vUv;

  const vec3 C1 = vec3(0.212, 0.369, 0.812); // dusk blue   #365ecf
  const vec3 C2 = vec3(0.518, 0.286, 0.780); // violet      #8449c7
  const vec3 C3 = vec3(0.886, 0.259, 0.753); // magenta     #e242c0
  const vec3 C4 = vec3(0.992, 0.357, 0.588); // pink        #fd5b96
  const vec3 C5 = vec3(0.996, 0.525, 0.290); // orange      #fe864a
  const vec3 C6 = vec3(1.000, 0.655, 0.231); // gold        #ffa73b

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }
  vec3 ramp(float x) {
    x = clamp(x, 0.0, 1.0) * 5.0;
    if (x < 1.0) return mix(C1, C2, x);
    if (x < 2.0) return mix(C2, C3, x - 1.0);
    if (x < 3.0) return mix(C3, C4, x - 2.0);
    if (x < 4.0) return mix(C4, C5, x - 3.0);
    return mix(C5, C6, x - 4.0);
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y; // centred, height = 1
    float t = uTime * 0.05;
    vec2 m = (uMouse - 0.5) * vec2(0.18, 0.08);

    // Flowing light (domain-warped noise).
    vec2 q = vec2(fbm(p * 1.3 + vec2(t, -t)), fbm(p * 1.3 + vec2(5.2 - t, 1.3 + t)));
    vec2 r = vec2(fbm(p * 1.7 + 2.2 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p * 1.7 + 2.2 * q + vec2(8.3, 2.8) - t));
    float f = fbm(p * 1.5 + 2.4 * r);

    // The horizon: a huge ellipse whose top edge sits near the bottom of the hero.
    vec2 hp = (p - vec2(m.x, -1.32 + m.y)) * vec2(0.55, 1.0);
    float d = length(hp) - 0.98;               // < 0 inside the planet
    float rim = exp(-abs(d) * 26.0);           // the bright edge
    float halo = exp(-max(d, 0.0) * 3.2);      // light spilling up into the sky
    float inside = smoothstep(0.0, -0.04, d);  // the planet body

    // Colour runs across the sky like a sunset: blue at the far left, gold at the right of the arc.
    float hue = 0.12 + (p.x / (uRes.x / uRes.y)) * 0.9 + 0.35 + (f - 0.5) * 0.55;
    vec3 sky = ramp(hue);
    vec3 edge = mix(ramp(hue + 0.15), vec3(1.0, 0.93, 0.82), 0.35);

    // Keep the middle calm for the headline; the light lives low and toward the sides.
    float vertical = smoothstep(0.55, -0.45, p.y);
    float sides = smoothstep(0.15, 0.95, abs(p.x) / (uRes.x / uRes.y) * 2.0);
    float clouds = smoothstep(0.42, 0.9, f) * (0.35 + 0.65 * max(vertical, sides * 0.6));

    float a = clamp(halo * 0.55 * vertical + clouds * 0.55 + rim * 1.1, 0.0, 1.0);
    vec3 col = mix(sky, edge, clamp(rim * 1.2, 0.0, 1.0));

    // The planet body: deep, slightly lit from its rim.
    vec3 body = uDark > 0.5 ? vec3(0.03, 0.03, 0.05) : vec3(0.985, 0.975, 0.97);
    col = mix(col, body + ramp(hue) * exp(d * 9.0) * 0.18, inside * (1.0 - rim));
    a = max(a, inside * (uDark > 0.5 ? 1.0 : 0.0));

    // Fine grain so the gradient never bands.
    float g = (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.035;
    a = clamp(a + g * a, 0.0, 1.0);

    a *= uDark > 0.5 ? 1.0 : 0.78;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
  }
`;

function isDarkTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t === "dark";
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function mountAurora(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
  // Soft gradients: half resolution is indistinguishable and far cheaper.
  const scale = Math.min(window.devicePixelRatio, 2) * 0.5;
  renderer.setPixelRatio(scale);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 8 },
    uRes: { value: new Vector2(1, 1) },
    uMouse: { value: new Vector2(0.5, 0.5) },
    uDark: { value: isDarkTheme() ? 1 : 0 },
  };
  const material = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false });
  const geometry = new PlaneGeometry(2, 2);
  scene.add(new Mesh(geometry, material));

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w * scale, h * scale);
    if (opts.reducedMotion) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const applyTheme = () => {
    uniforms.uDark.value = isDarkTheme() ? 1 : 0;
    if (opts.reducedMotion) renderer.render(scene, camera);
  };
  const mo = new MutationObserver(applyTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", applyTheme);

  let mx = 0.5,
    my = 0.5;
  const onMove = (e: PointerEvent) => {
    mx = e.clientX / window.innerWidth;
    my = 1 - e.clientY / window.innerHeight;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let visible = true;
  let raf = 0;
  let last = performance.now();
  const tick = () => {
    if (!visible || document.hidden) {
      raf = 0;
      return;
    }
    const now = performance.now();
    uniforms.uTime.value += Math.min(0.05, (now - last) / 1000);
    last = now;
    const mu = uniforms.uMouse.value;
    mu.set(mu.x + (mx - mu.x) * 0.04, mu.y + (my - mu.y) * 0.04);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (opts.reducedMotion) {
      renderer.render(scene, camera);
      return;
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  });
  io.observe(canvas);
  const onVis = () => !document.hidden && start();
  document.addEventListener("visibilitychange", onVis);
  start();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    mo.disconnect();
    mq.removeEventListener("change", applyTheme);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("visibilitychange", onVis);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
