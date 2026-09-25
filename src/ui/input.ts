import { Camera } from '../render/camera';

export interface InputHandler {
  cam: Camera;
  /** Mouse hover over a tile (null when leaving the canvas). */
  hover(x: number | null, y: number): void;
  /** Mouse click (desktop). */
  click(tx: number, ty: number): void;
  /** Finger tap (touch). */
  tap(tx: number, ty: number): void;
  /** Mouse drag with left button held while placing (for painting walls/traps). */
  paint(tx: number, ty: number): void;
  cancel(): void;
  isPlacing(): boolean;
  onTouchDetected(): void;
}

interface Ptr {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  button: number;
  type: string;
  moved: boolean;
}

/** Pointer/touch/wheel handling for the game canvas: select, place, paint, pan and pinch-zoom. */
export class Input {
  private ptrs = new Map<number, Ptr>();
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  private painting = false;
  private panning = false;
  private lastPaint = '';

  constructor(
    private canvas: HTMLCanvasElement,
    private h: InputHandler,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.h.hover(null, 0);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
        this.h.cam.zoomAt(e.offsetX, e.offsetY, f);
      },
      { passive: false },
    );
  }

  private tile(sx: number, sy: number) {
    const c = this.h.cam;
    return { x: Math.floor(c.toWorldX(sx)), y: Math.floor(c.toWorldY(sy)) };
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'touch') this.h.onTouchDetected();
    this.canvas.setPointerCapture(e.pointerId);
    const p: Ptr = { id: e.pointerId, x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, button: e.button, type: e.pointerType, moved: false };
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size >= 2) {
      for (const q of this.ptrs.values()) q.moved = true; // no taps from multi-touch
      this.seedPinch();
      this.painting = false;
      return;
    }
    if (p.type === 'mouse') {
      if (e.button === 2) {
        if (this.h.isPlacing()) {
          this.h.cancel();
          p.moved = true;
        } else this.panning = true;
      } else if (e.button === 1) {
        this.panning = true;
      } else if (e.button === 0 && this.h.isPlacing()) {
        const t = this.tile(p.x, p.y);
        this.h.click(t.x, t.y);
        this.painting = true;
        this.lastPaint = t.x + ',' + t.y;
        p.moved = true; // consumed
      }
    }
  }

  private seedPinch() {
    const [a, b] = [...this.ptrs.values()];
    if (!a || !b) return;
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private move(e: PointerEvent) {
    const p = this.ptrs.get(e.pointerId);
    if (e.pointerType === 'mouse') {
      const t = this.tile(e.offsetX, e.offsetY);
      this.h.hover(t.x, t.y);
    }
    if (!p) return;
    const dx = e.offsetX - p.x,
      dy = e.offsetY - p.y;
    p.x = e.offsetX;
    p.y = e.offsetY;

    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0) this.h.cam.zoomAt(mid.x, mid.y, d / this.pinchDist);
      this.h.cam.pan(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      this.pinchDist = d;
      this.pinchMid = mid;
      return;
    }

    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > (p.type === 'touch' ? 10 : 5)) p.moved = true;

    if (this.painting) {
      const t = this.tile(p.x, p.y);
      const k = t.x + ',' + t.y;
      if (k !== this.lastPaint) {
        // walk every tile between the last painted one and this one so fast drags leave no gaps
        const [lx, ly] = this.lastPaint.split(',').map(Number);
        let x = lx,
          y = ly;
        const dx = Math.abs(t.x - x),
          dy = -Math.abs(t.y - y);
        const sx = x < t.x ? 1 : -1,
          sy = y < t.y ? 1 : -1;
        let err = dx + dy;
        for (let n = 0; n < 200 && (x !== t.x || y !== t.y); n++) {
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y += sy;
          }
          this.h.paint(x, y);
        }
        this.lastPaint = k;
      }
      return;
    }
    if (this.panning || (p.moved && (p.type !== 'mouse' || p.button === 0))) {
      this.h.cam.pan(dx, dy);
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size >= 2) this.seedPinch();
    else this.pinchDist = 0;
    if (this.ptrs.size === 1) {
      // continue as a pan with the remaining finger, without a jump
      const r = [...this.ptrs.values()][0];
      r.moved = true;
    }
    if (this.ptrs.size === 0) {
      this.painting = false;
      this.panning = false;
    }
    if (!p || cancelled || p.moved) return;
    const t = this.tile(p.x, p.y);
    if (p.type === 'mouse') {
      if (p.button === 0) this.h.click(t.x, t.y);
    } else {
      this.h.tap(t.x, t.y);
    }
  }
}
