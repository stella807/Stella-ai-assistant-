import { followWarp } from "./warp.ts";

/** x, y, depth, hue for each particle, every value in 0..1. Depth 0 is far away, 1 is close. */
export function makeParticles(count: number, rand: () => number = Math.random): Float32Array {
  const out = new Float32Array(count * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rand();
    out[i + 1] = rand();
    // Squared so most are far and faint, a few are near and bright: that is what reads as depth.
    out[i + 2] = rand() ** 1.6;
    out[i + 3] = rand();
  }
  return out;
}

/** A phone gets fewer: the effect is the same, the battery lasts. */
export function particleCount(width: number, height: number): number {
  return Math.max(120, Math.min(1400, Math.round((width * height) / 650)));
}

const VERT = `
attribute vec4 aP; uniform float uTime, uScroll, uPx, uWarp, uTravel; uniform vec2 uPointer;
varying vec3 vCol; varying float vA;
void main(){
  float d = aP.z;
  float y = fract(aP.y + uScroll * mix(.04, .8, d) * .35 + uTime * .006 * (.3 + d));
  float x = aP.x + sin(uTime * .2 + aP.y * 20.) * .012 * d + uPointer.x * .04 * d;
  vec2 p = vec2(x, y) * 2. - 1.;
  p.y += uPointer.y * .04 * d;
  // A move through the site: every point streams out from the centre past the
  // camera, the near ones fastest, and is born again small in the middle.
  float s = fract(aP.w * 7.13 + aP.z * 3.1 + uTravel * (.6 + 1.4 * d));
  p *= mix(1., mix(.08, 2.6, s * s), uWarp);
  gl_Position = vec4(p, 0., 1.);
  gl_PointSize = (2. + 11. * d * d) * uPx * (1. + uWarp * 2.4 * d * s);
  vA = mix(.22, .9, d) * mix(smoothstep(0., .08, y) * smoothstep(1., .92, y), 1.4, uWarp);
  vec3 gold = vec3(.85, .70, .42), violet = vec3(.55, .42, .95), teal = vec3(.16, .70, .72);
  vCol = mix(mix(gold, violet, step(.4, aP.w)), teal, step(.75, aP.w));
}`;

const FRAG = `
precision mediump float; varying vec3 vCol; varying float vA; uniform float uLight;
void main(){
  float r = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .0, r); a *= a;
  gl_FragColor = vec4(vCol, a * vA * mix(1., .6, uLight));
}`;

/**
 * A field of soft glowing points behind the whole app. Near points slide past
 * faster than far ones as the page scrolls, and lean toward the pointer, which
 * is what gives the page depth. Loaded after the page is up; if the device has
 * no WebGL, or asks for less motion, the CSS atmosphere alone is left.
 */
export function startParticles(): void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1";
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const data = makeParticles(particleCount(window.innerWidth, window.innerHeight));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aP");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uTime = u("uTime"), uScroll = u("uScroll"), uPx = u("uPx"), uPointer = u("uPointer"), uLight = u("uLight");
  const uWarp = u("uWarp"), uTravel = u("uTravel");
  const warp = followWarp();
  let travel = 0, lastT = 0;

  document.body.prepend(canvas);
  document.documentElement.classList.add("webgl-on");

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.tx = e.clientX / window.innerWidth - 0.5;
    pointer.ty = 0.5 - e.clientY / window.innerHeight;
  }, { passive: true });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uPx, dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  const count = data.length / 4;
  const draw = (t: number) => {
    const light = document.documentElement.dataset.theme === "light";
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    if (light) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    pointer.x += (pointer.tx - pointer.x) * 0.06; pointer.y += (pointer.ty - pointer.y) * 0.06;
    gl.uniform1f(uTime, t / 1000);
    const { strength } = warp.read();
    travel += Math.min(0.05, (t - lastT) / 1000) * strength * 2.4;
    lastT = t;
    gl.uniform1f(uWarp, strength);
    gl.uniform1f(uTravel, travel);
    gl.uniform1f(uScroll, window.scrollY / Math.max(1, window.innerHeight));
    gl.uniform2f(uPointer, pointer.x, pointer.y);
    gl.uniform1f(uLight, light ? 1 : 0);
    gl.drawArrays(gl.POINTS, 0, count);
  };

  if (reduce) { draw(0); window.addEventListener("resize", () => draw(0)); return; }
  let raf = 0;
  const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(loop);
  };
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(loop);
}
