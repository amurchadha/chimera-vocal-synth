/**
 * Wireframe instruments in 3D (the duet page's 808 and drum kit), drawn with the heads' glowing
 * beams (beams3d.ts) and copied into each panel's own 2D canvas, where the readouts and the glow
 * pass go on top, as on the 3D heads.
 *
 * WebGL contexts are scarce: Chrome keeps about 16 live and then drops the oldest, and every 3D
 * head holds its own. So the instrument panels share ONE renderer: a panel renders its stage into
 * the shared canvas's lower-left corner and copies that into its 2D canvas at once, in the same
 * task, before any other panel draws. The page opens one context per head plus one in all.
 *
 * A panel redraws only when its time (or size) changes, and draws each frame from the time alone,
 * so a frame captured on its own is the frame a live replay shows.
 */
import * as THREE from "three";
import { Beams, Poly, type Beam3Opts } from "./beams3d.ts";
import { Glow } from "./vector.ts";
import { V, mix } from "../colors.ts";

export type V3 = readonly [number, number, number];

// ------------------------------------------------------------------ the one shared renderer

interface Shared {
  gl: THREE.WebGLRenderer;
  users: number;
  /** the shared canvas's size, CSS px (it only grows) */
  w: number;
  h: number;
  dpr: number;
}
let shared: Shared | null = null;

/** Take a share of the instruments' renderer (made on first use); false if WebGL is unavailable. */
export function acquireGL(): boolean {
  if (!shared) {
    let gl: THREE.WebGLRenderer;
    try {
      gl = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      return false;
    }
    // the palette's sRGB values go straight through, as on the 2D screens and the heads
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    gl.setClearColor(0x000000, 1);
    shared = { gl, users: 0, w: 0, h: 0, dpr: 1 };
  }
  shared.users++;
  return true;
}

/** Give the share back; the last one out frees the context now, not at garbage collection. */
export function releaseGL(): void {
  if (!shared || --shared.users > 0) return;
  shared.gl.dispose();
  shared.gl.forceContextLoss();
  shared = null;
}

/** Render a stage at w × h CSS px and copy it into ctx at device pixel (x, y), 1:1. */
function drawStage(stage: Stage, w: number, h: number, dpr: number, ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const s = shared;
  if (!s || w < 1 || h < 1) return;
  const gl = s.gl;
  if (s.dpr !== dpr) {
    s.dpr = dpr;
    gl.setPixelRatio(dpr);
  }
  // a little larger than asked, so the rounded viewport always fits in the rounded canvas
  if (w + 2 > s.w || h + 2 > s.h) {
    s.w = Math.max(s.w, Math.ceil(w) + 2);
    s.h = Math.max(s.h, Math.ceil(h) + 2);
    gl.setSize(s.w, s.h, false);
  }
  gl.setViewport(0, 0, w, h);
  gl.setScissor(0, 0, w, h);
  gl.setScissorTest(true);
  gl.render(stage.scene, stage.camera);
  const c = gl.domElement;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  // GL's lower-left corner is the image's bottom rows
  ctx.drawImage(c, 0, c.height - ph, pw, ph, x, y, pw, ph);
}

// ------------------------------------------------------------------ a stage: scene, camera, beams

/** One instrument's scene, its beams and a camera that frames it. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(22, 1, 1, 5000);
  readonly beams = new Beams();
  private readonly target = new THREE.Vector3();
  private dist = 100;
  private az = 0;
  private el = 0;
  private fitted = "";

  constructor() {
    this.scene.add(this.beams.group);
    this.scene.fog = new THREE.Fog(0x000000, 1, 2);
  }

  dispose(): void {
    this.beams.dispose();
  }

  /**
   * Aim from azimuth az (rad, from +z towards +x) and elevation el, the camera far enough back that
   * the points fill a w × h view less `margin` (a fraction of each half) and centred on them.
   * Worked out once per size (a stage always frames the same thing from the same side).
   */
  frame(pts: readonly V3[], w: number, h: number, az: number, el: number, margin = 0.08): void {
    const key = `${w}x${h}`;
    if (key === this.fitted) return;
    this.fitted = key;
    this.az = az;
    this.el = el;
    const cam = this.camera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right);
    const tv = Math.tan((cam.fov * Math.PI) / 360) * (1 - margin), th = tv * cam.aspect;
    const c = new THREE.Vector3();
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of pts) {
      lo.min(c.set(p[0], p[1], p[2]));
      hi.max(c);
    }
    c.addVectors(lo, hi).multiplyScalar(0.5);
    let D = 1, span = 0;
    const q = new THREE.Vector3();
    for (let it = 0; it < 6; it++) {
      D = 1;
      for (const p of pts) {
        q.set(p[0], p[1], p[2]).sub(c);
        const x = q.dot(right), y = q.dot(up), z = q.dot(d);
        D = Math.max(D, z + Math.abs(x) / th, z + Math.abs(y) / tv);
        span = Math.max(span, q.length());
      }
      // centre the projected extents
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        q.set(p[0], p[1], p[2]).sub(c);
        const z = D - q.dot(d);
        const x = q.dot(right) / z, y = q.dot(up) / z;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      c.addScaledVector(right, ((x0 + x1) / 2) * D).addScaledVector(up, ((y0 + y1) / 2) * D);
    }
    this.target.copy(c);
    this.dist = D;
    // dim with depth: full up to just in front of the middle, darker towards the back
    const fog = this.scene.fog as THREE.Fog;
    fog.near = D - 0.15 * span;
    fog.far = D + 2.4 * span;
    this.look();
  }

  /** place the camera on the framed view, turned by dAz (a slow sway shows the depth) */
  look(dAz = 0): void {
    const az = this.az + dAz, el = this.el;
    this.camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(this.dist).add(this.target);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}

// ------------------------------------------------------------------ a pen in a local frame

/** where a pen's polylines go: a stage's beams, or a bounds collector */
export interface Sink {
  poly(p: Poly, color: string, width: number, o?: Beam3Opts): void;
}

/** Polylines in a local frame (`m`: local → world), into a stage's beams. */
export class Pen {
  readonly m = new THREE.Matrix4();
  private readonly P = new Poly();
  constructor(private readonly B: Sink) {}

  /** a local point in world coordinates */
  world(x: number, y: number, z: number): [number, number, number] {
    const e = this.m.elements;
    return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
  }

  start(): this {
    this.P.reset();
    return this;
  }

  p(x: number, y: number, z: number): this {
    const e = this.m.elements;
    this.P.p(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    return this;
  }

  stroke(color: string, width: number, alpha = 1, hot = false, close = false): void {
    this.B.poly(this.P, color, width, { alpha, hot, close });
  }

  seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, alpha = 1): void {
    this.start().p(x0, y0, z0).p(x1, y1, z1).stroke(color, width, alpha);
  }

  /** a circle of radius r in the local xz plane at height y */
  circle(r: number, y: number, n: number, color: string, width: number, alpha = 1, hot = false): void {
    this.start();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      this.p(r * Math.cos(a), y, r * Math.sin(a));
    }
    this.stroke(color, width, alpha, hot, true);
  }
}

/** every other point a drawing makes, and every line's ends (to frame it) */
export function boundsOf(draw: (pen: Pen) => void): V3[] {
  const pts: V3[] = [];
  draw(new Pen({ poly: (P) => {
    for (let i = 0; i < P.n; i++) if (i % 2 === 0 || i === P.n - 1) pts.push([P.a[3 * i], P.a[3 * i + 1], P.a[3 * i + 2]]);
  } }));
  return pts;
}

/** a palette colour pulled towards amber (sound) by u, in a few steps (beams cache each colour) */
export function tint(base: string, u: number, to: string = V.amber): string {
  const k = Math.round(Math.max(0, Math.min(1, u)) * 8) / 8;
  return k === 0 ? base : mix(base, to, k);
}

// ------------------------------------------------------------------ a panel's loop

export interface PanelDraw {
  /** the panel's time; the frame is redrawn only when it (or the size) changes */
  key(): number;
  /** draw the frame at time t (key's value): ctx is cleared, in CSS px; `render(stage, x, y, w, h)` puts a stage there */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, render: ((stage: Stage, x: number, y: number, w: number, h: number) => void) | null): void;
}

/**
 * Run a panel on a 2D canvas: fit to its box (device pixel ratio capped at 1.5, like the heads),
 * redraw on each animation frame whose time differs, glow pass on top. `render` is null without
 * WebGL. Returns the cleanup, which disposes the stages and then gives the renderer back.
 */
export function runPanel(canvas: HTMLCanvasElement, stages: Stage[], p: PanelDraw): () => void {
  const ctx = canvas.getContext("2d")!;
  const glow = new Glow();
  const gl = acquireGL();
  let w = 0, h = 0, dpr = 1, last = NaN, dirty = true;
  const capDpr = () => Math.min(1.5, window.devicePixelRatio || 1);
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    dpr = capDpr();
    w = r.width;
    h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    dirty = true;
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  // labels drawn before the Hershey font arrived are redrawn in it
  void document.fonts?.ready.then(() => (dirty = true));
  // the stage is copied in device pixels, 1:1; everything else is drawn in CSS px
  const render = gl
    ? (stage: Stage, x: number, y: number, sw: number, sh: number) => {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawStage(stage, sw, sh, dpr, ctx, Math.round(x * dpr), Math.round(y * dpr));
        ctx.restore();
      }
    : null;
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (capDpr() !== dpr) fit();
    if (w <= 0 || h <= 0) return;
    const k = p.key();
    if (k === last && !dirty) return;
    last = k;
    dirty = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.draw(ctx, w, h, k, render);
    glow.apply(canvas, ctx, dpr);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    // the beams' buffers live in the shared context: free them there before it may go
    for (const st of stages) st.dispose();
    if (gl) releaseGL();
  };
}
