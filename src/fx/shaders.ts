import type { FamilyId } from '../model/types';

export const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
uniform vec2 u_res;
uniform vec4 u_rect; // x, y (top-left, css px), w, h
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x, 1.0 - a_pos.y);
  vec2 px = u_rect.xy + a_pos * u_rect.zw;
  vec2 clip = px / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

// Shared uniforms and noise helpers. v_uv.y is 0 at the bottom of the area, 1 at the top.
const COMMON = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_rect;
uniform float u_time;   // effect phase in seconds (integrated speed)
uniform float u_beat;   // 0..1 position inside the current beat
uniform float u_env;    // range envelope 0..1
uniform float u_xoff;   // px of the range already drawn in earlier systems
uniform float u_total;  // px width of the whole range across systems
uniform float u_p[8];
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform float u_seed;
uniform float u_dark;
uniform float u_flash;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.02 + 11.7;
    a *= 0.5;
  }
  return v;
}
// World coordinates in units of the area height, continuous across systems.
vec2 world() {
  return vec2((u_xoff + v_uv.x * u_rect.z) / u_rect.w, v_uv.y);
}
float feather() {
  float f = min(64.0, u_rect.z * 0.25);
  float x = v_uv.x * u_rect.z;
  float left = u_xoff < 0.5 ? smoothstep(0.0, f, x) : smoothstep(0.0, 10.0, x);
  float right = (u_xoff + u_rect.z) > u_total - 0.5 ? smoothstep(0.0, f, u_rect.z - x) : smoothstep(0.0, 10.0, u_rect.z - x);
  return left * right;
}
float vfeather(float e) {
  return smoothstep(0.0, e, v_uv.y) * smoothstep(1.0, 1.0 - e, v_uv.y);
}
`;

const OLAS = /* glsl */ `
// Layered, engraved-looking waves in the spirit of Hokusai: dark body, light
// streaks parallel to the crest, an inked outline and broken foam claws.
void main() {
  vec2 w = world();
  float A = u_p[0] * (0.35 + 0.65 * u_env);
  float F = u_p[1];
  float foam = u_p[4];
  float turb = u_p[5];
  float depth = u_p[6];
  float inten = u_p[7];
  float t = u_time;
  float y = w.y;

  vec3 deep = u_colA;
  vec3 light = mix(u_colA, u_colB, 0.55);
  vec4 col = vec4(0.0);

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float back = (3.0 - fi) / 3.0;              // 1 for the farthest layer
    float base = 0.16 + back * 0.22 * (0.4 + depth);
    float k = 1.0 + fi * 0.37;
    float sp = 0.6 + fi * 0.25;
    float x = w.x * F * k + u_seed * 0.013 + fi * 1.7;
    float h = base
      + A * 0.30 * (0.58 * sin(x + t * sp) + 0.27 * sin(x * 2.13 - t * sp * 1.31 + fi))
      + A * turb * 0.22 * (fbm(vec2(x * 0.9 + t * 0.35, fi * 3.1)) - 0.5) * 2.0;
    // Lean the crest forward so waves look like they curl.
    float slope = cos(x + t * sp) * A * 0.30 * 0.58 * F * k;
    float d = h - y;
    if (d < 0.0) {
      // Spray and claws just above the crest.
      float claw = smoothstep(0.0, 0.05 + 0.05 * A, -d);
      float n = noise(vec2(w.x * 46.0 + t * 0.8, y * 38.0 + fi * 7.0));
      float spray = (1.0 - claw) * step(0.8 - 0.12 * foam * A, n) * foam * step(0.25, A) * smoothstep(0.3, 1.0, slope + 0.3) * step(-d, 0.035);
      if (spray > 0.0) col = mix(col, vec4(u_colB, 1.0), spray * 0.9);
      continue;
    }
    vec3 body = mix(deep, light, smoothstep(0.55, 0.0, d) * 0.85);
    // Engraved streaks parallel to the crest.
    float streak = smoothstep(0.80, 0.97, sin(d * 70.0 + noise(vec2(w.x * 6.0, fi)) * 4.0 + slope * 2.0));
    body = mix(body, u_colB, streak * smoothstep(0.32, 0.03, d) * 0.55);
    // Foam band broken into claws.
    float fw = 0.015 + 0.055 * foam * (0.3 + A);
    float fn = noise(vec2(w.x * 28.0 - t * 0.6, d * 50.0 + fi * 5.0));
    float foamMask = smoothstep(fw, fw * 0.25, d) * smoothstep(0.25, 0.6, fn + 0.25 * foam);
    body = mix(body, u_colB, foamMask);
    // Inked outline on the crest.
    float outline = 1.0 - smoothstep(0.003, 0.008, d);
    body = mix(body, deep * 0.55, outline * 0.85);
    // Farther layers fade into the air.
    body = mix(body, mix(u_colB, light, 0.6), back * 0.22);
    col = vec4(body, 1.0);
  }
  float a = col.a * inten * u_env * feather() * smoothstep(0.0, 0.1, y);
  outColor = vec4(col.rgb * a, a);
}`;

const FUEGO = /* glsl */ `
// Flame tongues rising from the bottom of the area, with embers. The heat
// field is domain-warped noise shaped by a vertical falloff.
void main() {
  vec2 w = world();
  float height = u_p[0];
  float inten = u_p[1];
  float turb = u_p[2];
  float lean = u_p[3];
  float embers = u_p[5];
  float temp = u_p[6];
  float dens = u_p[7];
  float t = u_time;
  float y = w.y;
  float x = w.x - lean * y * 0.6;

  float H = 0.1 + 0.8 * height * (0.25 + 0.75 * u_env);
  float n1 = fbm(vec2(x * dens * 2.2 + u_seed * 0.01, y * 2.4 - t * 1.7));
  float n2 = fbm(vec2(x * dens * 4.6 + 3.1, y * 3.6 - t * 2.6));
  float tongues = 0.55 + 0.45 * sin(x * dens * 5.0 + n1 * 4.0 + sin(t * 0.7) * 0.6);
  float f = (1.0 - y / H) * (0.75 + 0.25 * tongues);
  f += (n1 - 0.5) * (0.6 + turb * 1.1) + (n2 - 0.5) * 0.45 * turb;
  f = clamp(f, 0.0, 1.0);

  float heat = smoothstep(0.1, 1.05, f);
  vec3 c0 = u_colA * 0.32;
  vec3 c1 = u_colA;
  vec3 c2 = u_colB;
  vec3 c3 = mix(u_colB, vec3(1.0), 0.7);
  float h2 = clamp(heat + (temp - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = h2 < 0.35 ? mix(c0, c1, h2 / 0.35) : h2 < 0.8 ? mix(c1, c2, (h2 - 0.35) / 0.45) : mix(c2, c3, (h2 - 0.8) / 0.2);
  float a = smoothstep(0.05, 0.4, f) * smoothstep(1.0, 0.72, y);

  // Embers drifting up out of the flames.
  vec2 g = vec2(w.x * 14.0, y * 9.0 - t * 1.4);
  vec2 cell = floor(g);
  vec2 fr = fract(g) - 0.5;
  float r = hash12(cell + u_seed);
  vec2 off = vec2(hash12(cell + 3.7), hash12(cell + 9.1)) - 0.5;
  float spark = step(1.0 - embers * 0.35, r) * smoothstep(0.08, 0.0, length(fr - off * 0.6));
  spark *= smoothstep(H * 1.6, H * 0.4, y) * (0.6 + 0.4 * sin(t * 9.0 + r * 30.0));
  col = mix(col, c3, spark);
  a = max(a, spark);

  // A soft glow at the base so the fire sits on the staff.
  float glow = smoothstep(0.45, 0.0, y) * 0.35 * (0.6 + 0.4 * noise(vec2(w.x * 3.0, t)));
  col = mix(c1, col, clamp(a + 0.0001, 0.0, 1.0));
  a = max(a, glow);

  a *= inten * u_env * feather();
  outColor = vec4(col * a, a);
}`;

const LUZ = /* glsl */ `
// Radial light with soft rays, an anamorphic streak and a faint lens ring.
void main() {
  vec2 w = world();
  float inten = u_p[0];
  float radius = u_p[1];
  float rays = u_p[2];
  float warm = u_p[4];
  float pulse = u_p[5];
  float pos = u_p[6];
  float flare = u_p[7];
  float t = u_time;

  vec2 c = vec2(pos * u_total / u_rect.w, 0.5);
  vec2 d = w - c;
  float r = length(d);
  float kick = exp(-u_beat * 5.0) * pulse;
  float R = radius * 0.85 * (1.0 + 0.25 * kick) * (0.6 + 0.4 * u_env);

  float core = exp(-r * r / (R * R * 0.18));
  float halo = exp(-r * r / (R * R)) * 0.65 + exp(-r / (R * 1.8)) * 0.25;
  float ang = atan(d.y, d.x);
  float shimmer = 0.6 + 0.4 * noise(vec2(ang * 3.0, t * 0.8));
  float ray = pow(abs(sin(ang * 7.0 + t * 0.5)), 16.0) * 0.6 + pow(abs(sin(ang * 12.0 - t * 0.35 + 1.3)), 28.0) * 0.4;
  ray *= rays * shimmer * exp(-r / (R * 1.6)) * smoothstep(0.0, R * 0.25, r);
  float streak = exp(-abs(d.y) * 55.0 / (0.5 + R)) * exp(-abs(d.x) / (R * 3.0)) * flare * 0.8;
  float ring = exp(-pow((r - R * 1.45) / (0.018 + R * 0.02), 2.0)) * flare * 0.22;

  float L = (core + halo + ray + streak + ring) * (0.8 + 0.2 * kick);
  vec3 tint = mix(u_colB, u_colA, warm);
  vec3 col = mix(tint, u_colB, clamp(core, 0.0, 1.0));
  float a = (1.0 - exp(-L * 1.3)) * inten * u_env * feather() * vfeather(0.3);
  // On dark stages light is additive; on paper it reads as a warm wash.
  outColor = vec4(col * a, a * (1.0 - 0.55 * u_dark));
}`;

const NUBES = /* glsl */ `
// Domain-warped cloud field, darker cores for storms, optional lightning.
void main() {
  vec2 w = world();
  float dens = u_p[0];
  float darkness = u_p[2];
  float soft = u_p[3];
  float bolts = u_p[4];
  float scale = u_p[6];
  float inten = u_p[7];
  float t = u_time;

  vec2 q = vec2(w.x * scale * 0.8 + t * 0.12, w.y * scale * 1.1);
  vec2 warp = vec2(fbm(q * 0.9 + vec2(0.0, t * 0.03) + u_seed * 0.01), fbm(q * 0.9 + 5.2));
  float f = fbm(q + warp * 1.4);
  float lo = 0.72 - dens * 0.55;
  float c = smoothstep(lo, lo + 0.06 + 0.42 * soft, f);
  float top = fbm(q + warp * 1.4 + vec2(0.0, -0.08));
  float lit = clamp((f - top) * 6.0 + 0.5, 0.0, 1.0);

  vec3 shadow = mix(u_colA * 0.82, vec3(0.13, 0.14, 0.18), darkness);
  vec3 body = mix(shadow, u_colA, lit * (1.0 - darkness * 0.6));
  body = mix(body, u_colB, 0.12 * (1.0 - w.y));

  // Lightning: deterministic per phase window, disabled when flashes are off.
  float win = t * 0.35 + u_seed * 0.001;
  float k = floor(win);
  float fl = 0.0;
  if (bolts > 0.0 && u_flash > 0.5 && hash12(vec2(k, 1.7)) < bolts * 0.85) {
    fl = exp(-fract(win) * 12.0) * (0.7 + 0.3 * step(0.5, fract(fract(win) * 9.0)));
    float bx = hash12(vec2(k, 4.2)) * u_total / u_rect.w;
    float jag = (fbm(vec2(w.y * 7.0, k * 3.3)) - 0.5) * 0.35 + (noise(vec2(w.y * 30.0, k)) - 0.5) * 0.06;
    float bolt = exp(-abs(w.x - bx - jag) * 140.0) * fl * smoothstep(0.0, 0.5, w.y);
    body = mix(body, u_colB, clamp(bolt + fl * c * 0.7, 0.0, 1.0));
    c = max(c, bolt);
  }

  float a = c * inten * u_env * feather() * smoothstep(0.0, 0.3, w.y) * smoothstep(1.0, 0.75, w.y) * 0.92;
  outColor = vec4(body * a, a);
}`;

export const FRAG: Record<FamilyId, string> = {
  olas: COMMON + OLAS,
  fuego: COMMON + FUEGO,
  luz: COMMON + LUZ,
  nubes: COMMON + NUBES,
};
