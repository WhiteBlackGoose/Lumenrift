// Lightweight particle system. All positions in tile units.

export enum PK {
  Spark, // streak along velocity, additive
  Glow, // soft additive blob
  Smoke, // dark, normal blending, drawn under the lighting
  Ring, // expanding stroked ring, additive
  Text, // floating text
  Shard, // small rotating quad, additive
  Ember, // tiny rising glowing dot
}

export interface Particle {
  kind: PK;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  drag: number;
  grav: number;
  rot: number;
  text?: string;
}

const MAX = 2500;

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { kind: PK; x: number; y: number }) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({
      vx: 0,
      vy: 0,
      life: 0.5,
      max: p.life ?? 0.5,
      size: 0.1,
      grow: 0,
      color: '#fff',
      drag: 0,
      grav: 0,
      rot: Math.random() * 6.28,
      ...p,
    } as Particle);
  }

  burst(
    x: number,
    y: number,
    n: number,
    o: { kind: PK; color: string; speed: number; life: number; size: number; spread?: number; drag?: number; grav?: number; grow?: number; dir?: number },
  ) {
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2;
      const sp = o.speed * (0.35 + Math.random() * 0.65);
      const life = o.life * (0.6 + Math.random() * 0.4);
      this.add({
        kind: o.kind,
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: o.size * (0.6 + Math.random() * 0.6),
        color: o.color,
        drag: o.drag ?? 2,
        grav: o.grav ?? 0,
        grow: o.grow ?? 0,
      });
    }
  }

  text(x: number, y: number, text: string, color: string, size = 0.36) {
    this.add({ kind: PK.Text, x, y, vy: -0.9, life: 1.1, max: 1.1, size, color, text, drag: 1.5 });
  }

  update(dt: number) {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += dt * 4;
      l[w++] = p;
    }
    l.length = w;
  }

  /** Draw particles that live under the darkness (smoke). */
  drawUnder(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      if (p.kind !== PK.Smoke) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = k * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Draw glowing particles (caller sets 'lighter'). */
  drawOver(ctx: CanvasRenderingContext2D, glow: (color: string) => HTMLCanvasElement) {
    for (const p of this.list) {
      const k = p.life / p.max;
      switch (p.kind) {
        case PK.Spark: {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.stroke();
          break;
        }
        case PK.Glow: {
          ctx.globalAlpha = k * k;
          const s = p.size * 2;
          ctx.drawImage(glow(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Ember: {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          const s = p.size;
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          break;
        }
        case PK.Ring: {
          ctx.globalAlpha = k * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.08 * k + 0.02;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case PK.Shard: {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Draw floating texts in screen space (ctx untransformed apart from DPR). */
  drawText(ctx: CanvasRenderingContext2D, sx: (x: number) => number, sy: (y: number) => number, scale: number) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.list) {
      if (p.kind !== PK.Text) continue;
      const k = p.life / p.max;
      const px = Math.max(11, p.size * scale);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `700 ${px.toFixed(1)}px Cinzel, Georgia, serif`;
      ctx.lineWidth = px * 0.22;
      ctx.strokeStyle = 'rgba(5,6,16,0.85)';
      ctx.strokeText(p.text!, sx(p.x), sy(p.y));
      ctx.fillStyle = p.color;
      ctx.fillText(p.text!, sx(p.x), sy(p.y));
    }
    ctx.globalAlpha = 1;
  }
}
