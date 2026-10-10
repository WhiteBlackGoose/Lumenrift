// A hunting falcon (Falcon Roost), seen from above in flight. World coords, 1 unit = 1 tile.

const TAU = Math.PI * 2;

export function drawFalcon(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, t: number): void {
  const a = Math.atan2(vy, vx);
  const flap = Math.sin(t * 18 + x * 3 + y * 5);
  ctx.save();
  // soft shadow on the ground below and behind
  ctx.fillStyle = 'rgba(20,15,5,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 0.12, y + 0.36, 0.16, 0.06, 0, 0, TAU);
  ctx.fill();

  ctx.translate(x, y);
  ctx.rotate(a);
  const S = 0.225; // half wingspan ≈ 0.45 tiles across
  ctx.scale(S, S);
  ctx.lineJoin = 'round';
  const span = 0.75 + 0.25 * flap;
  const sweep = -0.15 - 0.2 * flap;

  // tail
  ctx.fillStyle = '#7a5428';
  ctx.beginPath();
  ctx.moveTo(-0.35, -0.12);
  ctx.lineTo(-0.85, -0.22);
  ctx.lineTo(-0.9, 0);
  ctx.lineTo(-0.85, 0.22);
  ctx.lineTo(-0.35, 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(35,20,5,0.9)';
  ctx.lineWidth = 0.07;
  ctx.stroke();

  // wings
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#a8763a';
    ctx.beginPath();
    ctx.moveTo(0.2, s * 0.12);
    ctx.quadraticCurveTo(0.25, s * span * 0.7, sweep, s * span * 1.0);
    ctx.lineTo(sweep - 0.18, s * span * 0.92);
    ctx.quadraticCurveTo(-0.2, s * span * 0.5, -0.25, s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // dark barred tips
    ctx.strokeStyle = 'rgba(50,30,10,0.8)';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (let k = 1; k <= 3; k++) {
      const f = 0.45 + k * 0.15;
      ctx.moveTo(0.12 - f * 0.1 + sweep * f * 0.3, s * span * f * 0.9);
      ctx.lineTo(-0.12 - f * 0.15 + sweep * f * 0.3, s * span * f * 0.85);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(35,20,5,0.9)';
    ctx.lineWidth = 0.07;
  }

  // body
  ctx.fillStyle = '#c8924a';
  ctx.beginPath();
  ctx.ellipse(-0.02, 0, 0.42, 0.17, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.6)';
  ctx.beginPath();
  ctx.ellipse(0.05, -0.05, 0.22, 0.06, 0, 0, TAU);
  ctx.fill();
  // head + beak
  ctx.fillStyle = '#5a3a1a';
  ctx.beginPath();
  ctx.arc(0.42, 0, 0.13, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd04a';
  ctx.beginPath();
  ctx.moveTo(0.52, -0.05);
  ctx.lineTo(0.66, 0);
  ctx.lineTo(0.52, 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
