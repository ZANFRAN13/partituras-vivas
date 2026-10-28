import type { FamilyId } from '../model/types';
import { FRAG, VERT } from './shaders';

export interface FxDraw {
  family: FamilyId;
  rect: { x: number; y: number; w: number; h: number };
  xoff: number;
  total: number;
  time: number;
  beat: number;
  env: number;
  params: number[];
  colA: [number, number, number];
  colB: [number, number, number];
  seed: number;
}

interface Program {
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = ['u_res', 'u_rect', 'u_time', 'u_beat', 'u_env', 'u_xoff', 'u_total', 'u_p', 'u_colA', 'u_colB', 'u_seed', 'u_dark', 'u_flash'];

/** Draws every visible effect as a quad on one WebGL2 canvas, with premultiplied alpha. */
export class FxRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private programs = new Map<FamilyId, Program>();
  private vao: WebGLVertexArrayObject | null = null;
  lost = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
    });
    this.init();
  }

  get ok() {
    return !!this.gl && !this.lost;
  }

  private init() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;
    this.gl = gl;
    this.programs.clear();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;
  }

  private program(family: FamilyId): Program | null {
    const gl = this.gl;
    if (!gl) return null;
    const cached = this.programs.get(family);
    if (cached) return cached;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${family}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG[family]));
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`${family}: ${gl.getProgramInfoLog(prog)}`);
    const loc = Object.fromEntries(UNIFORMS.map((u) => [u, gl.getUniformLocation(prog, u)]));
    const p = { prog, loc };
    this.programs.set(family, p);
    return p;
  }

  resize(cssW: number, cssH: number, scale: number) {
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(draws: FxDraw[], cssW: number, cssH: number, opts: { dark: boolean; flash: boolean }) {
    const gl = this.gl;
    if (!gl || this.lost) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (draws.length === 0) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    for (const d of draws) {
      const p = this.program(d.family);
      if (!p) continue;
      gl.useProgram(p.prog);
      const L = p.loc;
      gl.uniform2f(L.u_res, cssW, cssH);
      gl.uniform4f(L.u_rect, d.rect.x, d.rect.y, d.rect.w, d.rect.h);
      gl.uniform1f(L.u_time, d.time);
      gl.uniform1f(L.u_beat, d.beat);
      gl.uniform1f(L.u_env, d.env);
      gl.uniform1f(L.u_xoff, d.xoff);
      gl.uniform1f(L.u_total, d.total);
      gl.uniform1fv(L.u_p, d.params);
      gl.uniform3f(L.u_colA, ...d.colA);
      gl.uniform3f(L.u_colB, ...d.colB);
      gl.uniform1f(L.u_seed, d.seed);
      gl.uniform1f(L.u_dark, opts.dark ? 1 : 0);
      gl.uniform1f(L.u_flash, opts.flash ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
