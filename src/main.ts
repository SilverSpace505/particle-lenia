import { bindMouse, keys, mouse } from './keys';
import utils from './utils';
import {
  gpuTimes,
  ready,
  render,
  setChunkParticles,
  setParams,
  setSim,
  setup,
} from './wgpu';

import './saveload';

declare global {
  interface Window {
    saves: string[];
    longest: { ticks: number; save: string }[];
    loadedData: unknown;
    loadSave: (save: string) => void;
    loadJSONFile: () => void;
    downloadObject: (exportObj: unknown, exportName: string) => void;
  }
}

const saves: string[] = [];
window.saves = saves;

const longest: { ticks: number; save: string }[] = [];
window.longest = longest;

window.loadSave = (save) => {
  resetSim();
  loadSim(save);

  particles = [];
  for (let c = 0; c < channels; c++) {
    particles.push([]);
  }

  saveInput.value = save;
  setSim(m, s, mul, rings, gm, gs);
  renderKernel();
  renderGrowth();

  startTest();
};

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const statDiv = document.getElementById('stats') as HTMLDivElement;

bindMouse(canvas);

const displayNames = [
  'fps',
  'tps',
  'ticktime',
  'cputime',
  'gputime',
  'particles',
  'chunks',
  'pixels',
  'simTime',
  'allTime',
  'tests',
  'force',
  'velocity',
  'longest',
  'saves',
] as const;
type DisplayName = (typeof displayNames)[number];

const displaysE: Record<string, HTMLParagraphElement> = {};

for (const name of displayNames) {
  const element = document.createElement('p');
  statDiv.appendChild(element);
  displaysE[name] = element;
}

const displays: Record<DisplayName, HTMLParagraphElement> = displaysE;

displays.fps.textContent = 'FPS: ';
displays.tps.textContent = 'TPS: ';

let allTicks = 0;
let tests = 0;
let simTime = 0;

// const testTime = 100 * 5;

let speed = 0.0000001 * 10;
let friction = 0.9;

let gridScale = 3;
const gridSize = 200;

let showParticles = true;
let showChunks = false;

let timewarp = false;

let fpsc = 0;
let tpsc = 0;

let mc = -1;

// const bounds: [number, number, number, number] = [-0.5, -0.5, 0.5, 0.5];

const gpucanvas = document.createElement('canvas');
gpucanvas.width = canvas.width / gridScale;
gpucanvas.height = canvas.height / gridScale;
const gpuctx = gpucanvas.getContext('webgpu');

const saveInput = document.getElementById('save') as HTMLInputElement;
const loadBtn = document.getElementById('load') as HTMLButtonElement;

const grid: number[] = [];

let search = false;

let channels = 5;

const channelColours: [number, number, number][] = [];
for (let i = 0; i < channels; i++) {
  const c = utils.hslaToRgba(i / channels, 1, 0.5, 1);
  channelColours.push([c[0], c[1], c[2]]);
}

const ringsAmt = 3;

let rings: number[][] = [];

const particleAmt: number[] = [0, 0, 0];

let r = 0.2;

let m: number[][][] = [];
let s: number[][][] = [];
let mul: number[][][] = [];
let gm: number[] = [];
let gs: number[] = [];

function resetSim() {
  m = [];
  s = [];
  mul = [];
  rings = [];
  for (let c1 = 0; c1 < channels; c1++) {
    m.push([]);
    s.push([]);
    mul.push([]);
    rings.push([]);
    for (let c2 = 0; c2 < channels; c2++) {
      m[c1].push([]);
      s[c1].push([]);
      mul[c1].push([]);
      rings[c1].push(ringsAmt);
      for (let i = 0; i < rings[c1][c2]; i++) {
        const nm = Math.random() * 0.8;
        m[c1][c2].push(nm);
        s[c1][c2].push((Math.random() * Math.min(1 - nm, nm)) / 2);
        mul[c1][c2].push((Math.random() * 2 - 1) * 2);
      }
    }
  }

  gm = [];
  gs = [];
  for (let i = 0; i < channels; i++) {
    const m = Math.random() * 0.9 + 0.05;
    gm.push(m);
    gs.push(Math.min(m / 2, (1 - m) / 2, Math.random() * 0.1));
  }
}

function startTest() {
  // for (let i = 0; i < 100; i++) {
  //   particles[Math.floor(Math.random() * channels)].push([
  //     (Math.random() - 0.5) ** 3 / 2,
  //     (Math.random() - 0.5) ** 3 / 2,
  //     (Math.random() * 2 - 1) / 1000,
  //     (Math.random() * 2 - 1) / 1000,
  //   ]);
  // }

  let left = 200;
  const amt = Math.ceil(Math.random() * 10);
  for (let i = 0; i < amt; i++) {
    if (left <= 0) continue;
    const amt2 = Math.min(left, Math.ceil(Math.random() * left));

    const x = Math.random() - 0.5;
    const y = Math.random() - 0.5;

    for (let j = 0; j < amt2; j++) {
      particles[Math.floor(Math.random() * channels)].push([
        x + (Math.random() - 0.5) ** 3 / 4,
        y + (Math.random() - 0.5) ** 3 / 4,
        (Math.random() * 2 - 1) / 1000,
        (Math.random() * 2 - 1) / 1000,
      ]);
      left--;
    }
  }
}

resetSim();

if (gpuctx) setup(gpuctx, channels, m, s, mul, rings, channelColours, gm, gs);

const camera = { x: 0, y: 0, zoom: 0.75 };
const tcamera = { x: 0, y: 0, zoom: 0.75 };

type Particle = [number, number, number, number];

const tickTimes: number[] = [];
const cpuTimes: number[] = [];

let chunkSize = r * 2;
let chunks: Record<string, Particle[]>[] = [];
for (let c = 0; c < channels; c++) {
  chunks.push({});
}

let particles: Particle[][] = [];
for (let c = 0; c < channels; c++) {
  particles.push([]);
  for (let i = 0; i < particleAmt[c]; i++) {
    particles[c].push([Math.random(), Math.random(), 0, 0]);
  }
}

startTest();

function bell(x: number, m: number, s: number) {
  const t = (x - m) / s;
  return Math.exp(-(t * t));
}

function bellS(x: number, m: number, s: number) {
  const b = bell(x, m, s);
  return b * ((-2 * (x - m)) / (s * s));
}

const kcanvas = document.getElementById('kernel') as HTMLCanvasElement;
const kctx = kcanvas.getContext('2d');

function renderKernel() {
  if (!kctx) return;
  return;
}

renderKernel();

for (let x = 0; x < gridSize; x++) {
  for (let y = 0; y < gridSize; y++) {
    grid.push(Math.random());
  }
}

// function tsc(x: number, y: number, cx: number, cy: number, cz: number) {
//   const a = canvas.width / canvas.height;
//   return [((x + cx - 0.5 * a) * cz + 0.5 * a) / a, (y - cy - 0.5) * cz + 0.5];
// }

function tsc(x: number, y: number, cx: number, cy: number, cz: number) {
  const a = canvas.width / canvas.height;
  return [((x + cx) / a) * cz + 0.5, (y - cy) * cz + 0.5];

  // return [((x + cx - 0.5 * a) * cz + 0.5 * a) / a, (y - cy - 0.5) * cz + 0.5];
}

function fsc(x: number, y: number, cx: number, cy: number, cz: number) {
  const a = canvas.width / canvas.height;

  return [((x - 0.5) / cz) * a - cx, 1 - (1 - y - 0.5) / cz - cy];
  // return [((x - 0.5) / cz) * a - cx - x, (y - 0.5) / cz + cy + y];
  // return [(x * a - 0.5 * a) / cz + 0.5 * a - cx, (y - 0.5) / cz - cy + 0.5];
}

function growth(near: number, m: number, s: number) {
  return bell(near, m, s);
}

function growthS(near: number, m: number, s: number) {
  return bellS(near, m, s);
}

const gcanvas = document.getElementById('growth') as HTMLCanvasElement;
const gctx = gcanvas.getContext('2d');

function renderGrowth() {
  gctx?.clearRect(0, 0, gcanvas.width, gcanvas.height);
  if (gctx) {
    for (let c = 0; c < channels; c++) {
      gctx.beginPath();
      const res = 100;
      for (let i = 0; i < res; i++) {
        const x = 10 + (i / res) * (gcanvas.width - 20);
        const y =
          10 + (1 - growth(i / res, gm[c], gs[c])) * (gcanvas.height - 20);
        if (i == 0) {
          gctx.moveTo(x, y);
        } else {
          gctx.lineTo(x, y);
        }
      }
      gctx.lineCap = 'round';
      gctx.lineWidth = 5;
      gctx.strokeStyle = `rgb(${channelColours[c][0] * 255}, ${
        channelColours[c][1] * 255
      }, ${channelColours[c][2] * 255})`;
      gctx.stroke();
    }
  }
}

renderGrowth();

function saveSim() {
  return JSON.stringify({
    m,
    s,
    mul,
    rings,
    gm,
    gs,
    speed,
    friction,
    r,
    channels,
    v: 1,
  });
}

function loadSim(save: string) {
  const loaded = JSON.parse(save);
  m = loaded.m;
  s = loaded.s;
  mul = loaded.mul;
  rings = loaded.rings;
  gm = loaded.gm;
  gs = loaded.gs;
  if (loaded.speed) speed = loaded.speed;
  if (loaded.friciton) friction = loaded.friction;
  if (loaded.r) {
    r = loaded.r;
    chunkSize = r * 2;
  }
  if (loaded.channels) channels = loaded.channels;
  renderKernel();
  renderGrowth();
  setSim(m, s, mul, rings, gm, gs);
}

declare global {
  interface Window {
    saveSim: () => string;
    loadSim: (save: string) => void;
  }
}

window.saveSim = saveSim;
window.loadSim = loadSim;

loadBtn.onclick = () => {
  particles = [];
  for (let c = 0; c < channels; c++) {
    particles.push([]);
    for (let i = 0; i < particleAmt[c]; i++) {
      particles[c].push([Math.random(), Math.random(), 0, 0]);
    }
  }
  loadSim(saveInput.value);
  saveInput.value = saveSim();
};

saveInput.value = saveSim();

let totalForce = 0;

function getForce(x: number, y: number, c1: number) {
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

  totalForce += U;

  const gSlope = growthS(U / 50, gm[c1], gs[c1]);
  const fx = gSlope * dir[0] + avoid[0];
  const fy = gSlope * dir[1] + avoid[1];

  return [fx, fy];
}

function tick() {
  const start = performance.now();

  allTicks++;
  simTime++;
  tpsc++;

  if (mouse.down) {
    if (!keys.KeyX) {
      const mp = fsc(
        mouse.x / canvas.width,
        mouse.y / canvas.height,
        camera.x,
        camera.y,
        camera.zoom,
      );
      particles[mc == -1 ? Math.floor(Math.random() * channels) : mc].push([
        mp[0],
        1 - mp[1],
        (Math.random() * 2 - 1) / 1000,
        (Math.random() * 2 - 1) / 1000,
      ]);
    } else {
      const mp = fsc(
        mouse.x / canvas.width,
        mouse.y / canvas.height,
        camera.x,
        camera.y,
        camera.zoom,
      );
      if (mc == -1) {
        for (let c = 0; c < channels; c++) {
          for (let i = 0; i < particles[c].length; i++) {
            const d = Math.sqrt(
              (mp[0] - particles[c][i][0]) ** 2 +
                (1 - mp[1] - particles[c][i][1]) ** 2,
            );
            if (d < r / 2) {
              particles[c].splice(i, 1);
              i--;
            }
          }
        }
      } else {
        for (let i = 0; i < particles[mc].length; i++) {
          const d = Math.sqrt(
            (mp[0] - particles[mc][i][0]) ** 2 +
              (1 - mp[1] - particles[mc][i][1]) ** 2,
          );
          if (d < r / 2) {
            particles[mc].splice(i, 1);
            i--;
          }
        }
      }
    }
  }

  chunks = [];
  for (let c = 0; c < channels; c++) {
    chunks[c] = {};
    for (const particle of particles[c]) {
      const cx = Math.floor(particle[0] / chunkSize);
      const cy = Math.floor(particle[1] / chunkSize);
      const ch = cx + ',' + cy;
      if (ch in chunks[c]) {
        chunks[c][ch].push(particle);
      } else {
        chunks[c][ch] = [particle];
      }
    }
  }

  totalForce = 0;

  let totalV = 0;

  for (let c = 0; c < channels; c++) {
    for (const particle of particles[c]) {
      const force = getForce(particle[0], particle[1], c);

      particle[2] -= force[0] * speed;
      particle[3] -= force[1] * speed;

      // particle[2] -= particle[0] / 10000;
      // particle[3] -= particle[1] / 10000;

      particle[2] *= friction;
      particle[3] *= friction;
    }
  }

  for (let c = 0; c < channels; c++) {
    for (const particle of particles[c]) {
      totalV += particle[2] ** 2 + particle[3] ** 2;
      particle[0] += particle[2];
      particle[1] += particle[3];
      // if (particle[0] < bounds[0]) particle[0] = bounds[2];
      // if (particle[0] > bounds[2]) particle[0] = bounds[0];
      // if (particle[1] < bounds[1]) particle[1] = bounds[3];
      // if (particle[1] > bounds[3]) particle[1] = bounds[1];
    }
  }

  displays.force.textContent = `Force: ${Math.round(totalForce)}`;
  displays.velocity.textContent = `Velocity: ${Math.round(totalV * 100000)}`;
  displays.simTime.textContent = `Sim Ticks: ${simTime}`;
  displays.allTime.textContent = `All Ticks: ${allTicks}`;

  const stopTime = 100 * 60 * 30;
  const goalTime = 100 * 60 * 5;

  if ((totalV < 0.002 / 2 / 5 / 5 || simTime >= stopTime) && search) {
    if (simTime >= goalTime) {
      saves.push(saveSim());
      displays.saves.textContent = `Saves: ${saves.length}`;
    }

    if (longest.length < 100 || simTime > longest[longest.length - 1].ticks) {
      longest.push({ ticks: simTime, save: saveSim() });
      longest.sort((a, b) => b.ticks - a.ticks);
      if (longest.length > 100) longest.pop();
      displays.longest.textContent = `Longest: ${longest[0].ticks}`;
    }

    simTime = 0;
    resetSim();

    tests++;
    displays.tests.textContent = `Tests: ${tests}`;

    particles = [];
    for (let c = 0; c < channels; c++) {
      particles.push([]);
    }

    startTest();

    saveInput.value = saveSim();
    setSim(m, s, mul, rings, gm, gs);
    renderKernel();
    renderGrowth();
  }

  tickTimes.push(performance.now() - start);
  if (tickTimes.length > 100) tickTimes.splice(0, 1);
}

const tickrate = 100;
let accumulator = 0;

function renderGrid() {
  if (!ctx) return;
  ctx.globalAlpha = 1;
  ctx.drawImage(
    gpucanvas,
    0,
    0,
    gpucanvas.width,
    gpucanvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  ctx.globalAlpha = 1;

  if (showParticles) {
    for (let c = 0; c < channels; c++) {
      ctx.beginPath();
      for (const particle of particles[c]) {
        const p = tsc(
          particle[0],
          particle[1],
          camera.x,
          camera.y,
          camera.zoom,
        );
        ctx.moveTo(p[0] * canvas.width, (1 - p[1]) * canvas.height);
        ctx.arc(
          p[0] * canvas.width,
          (1 - p[1]) * canvas.height,
          5 * camera.zoom,
          0,
          Math.PI * 2,
        );
      }

      ctx.fillStyle = `rgb(${channelColours[c][0] * 255}, ${
        channelColours[c][1] * 255
      }, ${channelColours[c][2] * 255})`;
      ctx.fill();
    }
  }

  if (showChunks) {
    ctx.globalCompositeOperation = 'lighten';
    for (let c = 0; c < channels; c++) {
      ctx.beginPath();
      for (const chunk in chunks[c]) {
        const coords = chunk.split(',');
        const x = parseInt(coords[0]);
        const y = parseInt(coords[1]) + 1;

        const p = tsc(
          x * chunkSize,
          y * chunkSize,
          camera.x,
          camera.y,
          camera.zoom,
        );

        ctx.rect(
          p[0] * canvas.width,
          (1 - p[1]) * canvas.height,
          chunkSize * camera.zoom * canvas.height,
          chunkSize * camera.zoom * canvas.height,
        );
      }

      ctx.strokeStyle = `rgb(${channelColours[c][0] * 255}, ${
        channelColours[c][1] * 255
      }, ${channelColours[c][2] * 255})`;
      ctx.lineWidth = 5 * camera.zoom;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function update(timestamp: number) {
  requestAnimationFrame(update);

  fpsc++;

  utils.getDelta(timestamp);
  if (!ready.v) return;

  const start = performance.now();

  accumulator = utils.constantTick(
    tick,
    timewarp ? Infinity : tickrate,
    accumulator,
  );
  if (timewarp) accumulator = 0;

  setChunkParticles(chunks);

  const speed = 0.75 / tcamera.zoom;

  if (keys.KeyW) {
    tcamera.y += utils.delta * speed;
  }
  if (keys.KeyS) {
    tcamera.y -= utils.delta * speed;
  }
  if (keys.KeyA) {
    tcamera.x += utils.delta * speed;
  }
  if (keys.KeyD) {
    tcamera.x -= utils.delta * speed;
  }

  if (keys.Minus) {
    tcamera.zoom *= 1 - utils.delta;
  }
  if (keys.Equal) {
    tcamera.zoom *= 1 + utils.delta;
  }

  camera.x = utils.lerp5(camera.x, tcamera.x, utils.delta * 15);
  camera.y = utils.lerp5(camera.y, tcamera.y, utils.delta * 15);
  camera.zoom = utils.lerp5(camera.zoom, tcamera.zoom, utils.delta * 15);

  setParams(camera, chunkSize, channels, r, canvas.width / canvas.height);

  if (gpuctx) render(gpuctx);

  renderGrid();

  cpuTimes.push(performance.now() - start);
  if (cpuTimes.length > 100) cpuTimes.splice(0, 1);

  const avg = tickTimes.reduce((a, b) => a + b, 0) / tickTimes.length;

  displays.ticktime.textContent = `Tick time: ${
    Math.round(avg * 100) / 100
  }ms (TPS: ${Math.round(1000 / avg)})`;

  const cpuavg = cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length;

  displays.cputime.textContent = `CPU time: ${
    Math.round(cpuavg * 100) / 100
  }ms (FPS: ${Math.round(1000 / cpuavg)})`;

  if (gpuTimes.length > 0) {
    const gpuavg = gpuTimes.reduce((a, b) => a + b, 0) / gpuTimes.length;
    displays.gputime.textContent = `GPU time: ${
      Math.round(gpuavg * 100) / 100
    }ms (FPS: ${Math.round(1000 / gpuavg)})`;
  } else {
    displays.gputime.textContent = `GPU timing not supported :(`;
  }

  let total = 0;
  let totalChunks = 0;
  for (let c = 0; c < channels; c++) {
    total += particles[c].length;
    totalChunks += Object.keys(chunks[c]).length;
  }

  displays.particles.textContent = `Particles: ${total}`;
  displays.chunks.textContent = `Chunks: ${totalChunks}`;

  displays.pixels.textContent = `Grid Size: ${gpucanvas.width}x${
    gpucanvas.height
  } (${gpucanvas.width * gpucanvas.height}px)`;
}

requestAnimationFrame(update);

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.code == 'KeyT') timewarp = !timewarp;
  if (event.code == 'KeyQ') {
    search = !search;
    if (search) {
      timewarp = true;

      simTime = 0;
      resetSim();

      particles = [];
      for (let c = 0; c < channels; c++) {
        particles.push([]);
      }

      startTest();

      saveInput.value = saveSim();
      setSim(m, s, mul, rings, gm, gs);
      renderKernel();
      renderGrowth();
    }
  }
  if (event.code == 'Space') {
    showParticles = !showParticles;
  }
  if (event.code == 'KeyZ') {
    showChunks = !showChunks;
  }
  if (event.code == 'KeyR') {
    resetSim();

    particles = [];
    for (let c = 0; c < channels; c++) {
      particles.push([]);
      for (let i = 0; i < particleAmt[c]; i++) {
        particles[c].push([Math.random(), Math.random(), 0, 0]);
      }
    }

    saveInput.value = saveSim();
    setSim(m, s, mul, rings, gm, gs);
    renderKernel();
    renderGrowth();
  }
  if (event.code == 'KeyE') {
    resetSim();

    particles = [];
    for (let c = 0; c < channels; c++) {
      particles.push([]);
    }

    startTest();

    saveInput.value = saveSim();
    setSim(m, s, mul, rings, gm, gs);
    renderKernel();
    renderGrowth();
  }
  if (event.code.includes('Digit')) {
    const digit = parseInt(event.code[5]);
    if (digit <= channels) mc = digit - 1;
  }

  if (event.code == 'KeyF') {
    if (gridScale < 1) {
      gridScale += 1 / (1 / gridScale - 1);
    } else {
      gridScale += 1;
    }
    gpucanvas.width = canvas.width / gridScale;
    gpucanvas.height = canvas.height / gridScale;
  }

  if (event.code == 'KeyG') {
    if (gridScale <= 1) {
      gridScale = 1 / (1 / gridScale + 1);
    } else {
      gridScale -= 1;
    }
    gpucanvas.width = canvas.width / gridScale;
    gpucanvas.height = canvas.height / gridScale;
  }
});

setInterval(() => {
  displays.fps.textContent = `FPS: ${fpsc}`;
  displays.tps.textContent = `TPS: ${tpsc}`;
  fpsc = 0;
  tpsc = 0;
}, 1000);

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gpucanvas.width = canvas.width / gridScale;
  gpucanvas.height = canvas.height / gridScale;
});
