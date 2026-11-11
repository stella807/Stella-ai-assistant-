const VERT = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }`;
const FRAG = `
precision mediump float;
uniform vec2 uRes, uPointer; uniform float uTime, uScroll, uLight;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * n(p); p = p * 2.02 + vec2(1.7, 9.2); a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.) * 1.7;
  p.y += uScroll * .3; p += uPointer * .18;
  float t = uTime * .035;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 2.3 * q + t);
  vec3 c = mix(vec3(.30, .18, .66), vec3(.08, .56, .62), smoothstep(.3, .8, q.x));
  c = mix(c, vec3(.88, .68, .32), smoothstep(.55, .95, f) * .85);
  c = mix(c, vec3(1.), uLight * .5);
  float a = smoothstep(.32, .85, f) * mix(.34, .3, uLight);
  gl_FragColor = vec4(c, a);
}`;

/**
 * Slow liquid light behind the page: a few layers of noise folded into each
 * other, tinted violet, teal and gold. It is drawn very small and stretched by the
 * browser, which is what makes it soft and costs a phone almost nothing. If the
 * device still struggles, it times itself and switches the layer off.
 */
export function startFog(): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1";
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aP");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = U("uRes"), uTime = U("uTime"), uScroll = U("uScroll"), uPointer = U("uPointer"), uLight = U("uLight");

  document.body.prepend(canvas);
  document.documentElement.classList.add("fog-on");

  // Drawn at a quarter of the screen's size in each direction.
  const resize = () => {
    canvas.width = Math.max(2, Math.round(window.innerWidth / 4));
    canvas.height = Math.max(2, Math.round(window.innerHeight / 4));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => { pointer.tx = e.clientX / window.innerWidth - 0.5; pointer.ty = 0.5 - e.clientY / window.innerHeight; }, { passive: true });

  let raf = 0, last = 0, slow = 0, frames = 0;
  const loop = (t: number) => {
    // Average over 90 frames; if each takes over 30 ms the device is struggling, so stop.
    if (last) { slow += t - last; frames++; if (frames === 90) { if (slow / frames > 30) { stop(); return; } slow = 0; frames = 0; } }
    last = t;
    pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
    gl.uniform1f(uTime, t / 1000);
    gl.uniform1f(uScroll, window.scrollY / Math.max(1, window.innerHeight));
    gl.uniform2f(uPointer, pointer.x, pointer.y);
    gl.uniform1f(uLight, document.documentElement.dataset.theme === "light" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); canvas.remove(); document.documentElement.classList.remove("fog-on"); };
  document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); last = 0; if (!document.hidden && canvas.isConnected) raf = requestAnimationFrame(loop); });
  raf = requestAnimationFrame(loop);
}
