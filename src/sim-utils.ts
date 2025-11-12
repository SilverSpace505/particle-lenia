import type { Particle } from './state';

function bell(x: number, m: number, s: number) {
  const t = (x - m) / s;
  return Math.exp(-(t * t));
}

function bellS(x: number, m: number, s: number) {
  const b = bell(x, m, s);
  return b * ((-2 * (x - m)) / (s * s));
}

function growth(near: number, m: number, s: number) {
  return bell(near, m, s);
}

function growthS(near: number, m: number, s: number) {
  return bellS(near, m, s);
}

export function getForce(
  x: number,
  y: number,
  c1: number,
  r: number,
  chunkSize: number,
  channels: number,
  chunks: Record<string, Particle[]>[],
  rings: number[][],
  m: number[][][],
  s: number[][][],
  mul: number[][][],
  gm: number[],
  gs: number[],
  totals: { force: number },
) {
  const cxmin = Math.floor((x - r) / chunkSize);
  const cymin = Math.floor((y - r) / chunkSize);
  const cxmax = Math.floor((x + r) / chunkSize);
  const cymax = Math.floor((y + r) / chunkSize);
  // let t = 0;
  let U = 0;
  const dir: [number, number] = [0, 0];

  const avoid: [number, number] = [0, 0];

  for (let c2 = 0; c2 < channels; c2++) {
    for (let cx = cxmin; cx <= cxmax; cx++) {
      for (let cy = cymin; cy <= cymax; cy++) {
        const c = cx + ',' + cy;
        if (c in chunks[c2]) {
          for (const particle of chunks[c2][c]) {
            const dx = particle[0] - x;
            const dy = particle[1] - y;
            const d = Math.sqrt(dx ** 2 + dy ** 2);
            if (d <= r && d > 0) {
              let k = 0;
              let dk = 0;

              for (let i = 0; i < rings[c1][c2]; i++) {
                k +=
                  (bell(d / r, m[c1][c2][i], s[c1][c2][i]) / rings[c1][c2]) *
                  mul[c1][c2][i];
                dk +=
                  (bellS(d / r, m[c1][c2][i], s[c1][c2][i]) / rings[c1][c2]) *
                  mul[c1][c2][i];
              }

              U += k;
              const invd = 1 / d;
              const scale = (dk / r) * invd;
              dir[0] += dx * scale;
              dir[1] += dy * scale;

              if (d <= 0.025) {
                avoid[0] += dx * (0.025 / d) * 1000;
                avoid[1] += dy * (0.025 / d) * 1000;
              }
            }
          }
        }
      }
    }
  }

  totals.force += U;

  const gSlope = growthS(U / 50, gm[c1], gs[c1]);
  const fx = gSlope * dir[0] + avoid[0];
  const fy = gSlope * dir[1] + avoid[1];

  return [fx, fy];
}

export function tsc(
  x: number,
  y: number,
  cx: number,
  cy: number,
  cz: number,
  canvas: HTMLCanvasElement,
) {
  const a = canvas.width / canvas.height;
  return [((x + cx) / a) * cz + 0.5, (y - cy) * cz + 0.5];
}

export function fsc(
  x: number,
  y: number,
  cx: number,
  cy: number,
  cz: number,
  canvas: HTMLCanvasElement,
) {
  const a = canvas.width / canvas.height;

  return [((x - 0.5) / cz) * a - cx, 1 - (1 - y - 0.5) / cz - cy];
}

export function renderGrowth(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  channels: number,
  channelColours: [number, number, number][],
  gm: number[],
  gs: number[],
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (ctx) {
    for (let c = 0; c < channels; c++) {
      ctx.beginPath();
      const res = 100;
      for (let i = 0; i < res; i++) {
        const x = 10 + (i / res) * (canvas.width - 20);
        const y =
          10 + (1 - growth(i / res, gm[c], gs[c])) * (canvas.height - 20);
        if (i == 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgb(${channelColours[c][0] * 255}, ${
        channelColours[c][1] * 255
      }, ${channelColours[c][2] * 255})`;
      ctx.stroke();
    }
  }
}

export function renderKernel() {
  return;
}
