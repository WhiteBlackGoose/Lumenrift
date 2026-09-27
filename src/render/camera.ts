import { MAP_H, MAP_W } from '../game/config';

/** Maps world (tile) coordinates to CSS pixels. Supports fit-to-view, zoom and pan. */
export class Camera {
  scale = 32; // CSS px per tile
  cx = MAP_W / 2; // world point at view centre
  cy = MAP_H / 2;
  viewW = 800;
  viewH = 600;
  insetTop = 0;
  insetBottom = 0;
  insetLeft = 0;
  fitScale = 32;
  fullFit = 32;
  shake = 0;
  shakeX = 0;
  shakeY = 0;

  resize(w: number, h: number, insetTop: number, insetBottom: number, insetLeft = 0) {
    const wasFit = Math.abs(this.scale - this.fitScale) < 0.01;
    this.viewW = w;
    this.viewH = h;
    this.insetTop = insetTop;
    this.insetBottom = insetBottom;
    this.insetLeft = insetLeft;
    const availH = Math.max(100, h - insetTop - insetBottom);
    const availW = Math.max(100, w - insetLeft);
    this.fitScale = this.fullFit = Math.min(availW / (MAP_W + 0.6), availH / (MAP_H + 0.6));
    // Portrait phones: fitting the whole (landscape) map makes it tiny; fill the height instead and let the player pan sideways.
    if (h > w * 1.2) this.fitScale = Math.max(this.fitScale, Math.min(availH / (MAP_H + 0.6), availW / (MAP_W * 0.45)));
    if (wasFit || this.scale < this.minScale) this.scale = this.fitScale;
    this.clamp();
  }

  get minScale() {
    return this.fullFit * 0.95;
  }
  get maxScale() {
    return Math.max(this.fitScale * 3.2, 64);
  }

  private get midX() {
    return this.insetLeft + (this.viewW - this.insetLeft) / 2;
  }

  private get midY() {
    return this.insetTop + (this.viewH - this.insetTop - this.insetBottom) / 2;
  }

  toScreenX(wx: number) {
    return (wx - this.cx) * this.scale + this.midX + this.shakeX;
  }
  toScreenY(wy: number) {
    return (wy - this.cy) * this.scale + this.midY + this.shakeY;
  }
  toWorldX(sx: number) {
    return (sx - this.midX - this.shakeX) / this.scale + this.cx;
  }
  toWorldY(sy: number) {
    return (sy - this.midY - this.shakeY) / this.scale + this.cy;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const wx = this.toWorldX(sx),
      wy = this.toWorldY(sy);
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    // keep the world point under the cursor fixed
    this.cx = wx - (sx - this.midX - this.shakeX) / this.scale;
    this.cy = wy - (sy - this.midY - this.shakeY) / this.scale;
    this.clamp();
  }

  pan(dxPx: number, dyPx: number) {
    this.cx -= dxPx / this.scale;
    this.cy -= dyPx / this.scale;
    this.clamp();
  }

  reset() {
    this.scale = this.fitScale;
    this.cx = MAP_W / 2;
    this.cy = MAP_H / 2;
  }

  private clamp() {
    const halfW = (this.viewW - this.insetLeft) / 2 / this.scale;
    const halfH = (this.viewH - this.insetTop - this.insetBottom) / 2 / this.scale;
    const clampAxis = (c: number, half: number, size: number) => {
      if (half * 2 >= size) return size / 2;
      return Math.max(half - 0.5, Math.min(size - half + 0.5, c));
    };
    this.cx = clampAxis(this.cx, halfW, MAP_W);
    this.cy = clampAxis(this.cy, halfH, MAP_H);
  }

  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt: number) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 10;
      this.shakeX = (Math.random() * 2 - 1) * s;
      this.shakeY = (Math.random() * 2 - 1) * s;
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }
}
