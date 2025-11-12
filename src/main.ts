import { bindMouse, keys, mouse } from './keys';
import utils from './utils';
import {
  gpuTimes,
  ready,
  render,
  setChunkParticles,
  setParams,
  setup,
} from './wgpu';

import './saveload';
import {
  channelColours,
  channels,
  displayCategories,
  type DisplayName,
} from './state';
import { Sim } from './sim';
import { renderGrowth, renderKernel } from './sim-utils';

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
  sim.reset();
  sim.load(save);

  sim.clearParticles();

  saveInput.value = save;
  sim.setGPU();
  renderKernel();
  if (gctx)
    renderGrowth(gcanvas, gctx, sim.channels, channelColours, sim.gm, sim.gs);

  sim.startTest();
};

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const statDiv = document.getElementById('stats') as HTMLDivElement;

bindMouse(canvas);

const displaysE: Record<string, HTMLParagraphElement> = {};

for (const category in displayCategories) {
  const categoryE = document.createElement('div');
  categoryE.classList.add('category');
  const title = document.createElement('span');
  title.textContent = category;
  categoryE.appendChild(title);
  const displays = document.createElement('div');
  categoryE.appendChild(displays);
  for (const name of displayCategories[category]) {
    const element = document.createElement('p');
    displays.appendChild(element);
    displaysE[name] = element;
  }
  displays.appendChild(document.createElement('div'));

  statDiv.appendChild(categoryE);

  let visible = false;
  categoryE.onclick = () => {
    visible = !visible;
    if (visible) {
      categoryE.classList.add('expand');
    } else {
      categoryE.classList.remove('expand');
    }
  };

  // if (category == 'General') {
  //   title.textContent = '';
  //   categoryE.classList.add('expand');
  //   visible = true;
  // }
}

const displays: Record<DisplayName, HTMLParagraphElement> = displaysE;

displays.fps.textContent = 'FPS: ';
displays.tps.textContent = 'TPS: ';

const sim = new Sim(channels, 0.2, 3);

// const testTime = 100 * 5;

let interactRange = 0.5;
// let showInteract = 0;

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

sim.reset();

if (gpuctx)
  setup(
    gpuctx,
    sim.channels,
    sim.m,
    sim.s,
    sim.mul,
    sim.rings,
    channelColours,
    sim.gm,
    sim.gs,
  );

const camera = { x: 0, y: 0, zoom: 0.75 };
const tcamera = { x: 0, y: 0, zoom: 0.75 };

const tickTimes: number[] = [];
const cpuTimes: number[] = [];

sim.startTest();

// const kcanvas = document.getElementById('kernel') as HTMLCanvasElement;
// const kctx = kcanvas.getContext('2d');

renderKernel();

for (let x = 0; x < gridSize; x++) {
  for (let y = 0; y < gridSize; y++) {
    grid.push(Math.random());
  }
}

const gcanvas = document.getElementById('growth') as HTMLCanvasElement;
const gctx = gcanvas.getContext('2d');

if (gctx)
  renderGrowth(gcanvas, gctx, sim.channels, channelColours, sim.gm, sim.gs);

loadBtn.onclick = () => {
  sim.clearParticles();
  sim.load(saveInput.value);
  saveInput.value = sim.save();
};

saveInput.value = sim.save();

function tick() {
  const start = performance.now();

  sim.tick(keys, mouse, camera, canvas, displays, mc, interactRange);

  tpsc++;

  tickTimes.push(performance.now() - start);
  if (tickTimes.length > 100) tickTimes.splice(0, 1);
}

const tickrate = 100;
let accumulator = 0;

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

  setChunkParticles(sim.chunks);

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

  // showInteract -= utils.delta;

  if (keys.KeyE) {
    interactRange *= 1 + utils.delta;
    // showInteract = 0.5;
  }
  if (keys.KeyQ) {
    interactRange *= 1 - utils.delta;
    // showInteract = 0.5;
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

  setParams(
    camera,
    sim.chunkSize,
    sim.channels,
    sim.r,
    canvas.width / canvas.height,
  );

  if (gpuctx) render(gpuctx);

  if (ctx)
    sim.render(
      canvas,
      ctx,
      gpucanvas,
      showParticles,
      showChunks,
      camera,
      channelColours,
      keys.ShiftLeft || keys.KeyX,
      mouse,
      interactRange,
    );

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
  for (let c = 0; c < sim.channels; c++) {
    total += sim.particles[c].length;
    totalChunks += Object.keys(sim.chunks[c]).length;
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
  if (event.code == 'KeyP') sim.paused = !sim.paused;
  if (event.code == 'KeyQ' && !keys.ShiftLeft) {
    sim.search = !sim.search;
    if (sim.search) {
      timewarp = true;

      sim.simTime = 0;
      sim.reset();

      sim.clearParticles();

      sim.startTest();

      saveInput.value = sim.save();
      sim.setGPU();
      renderKernel();
      if (gctx)
        renderGrowth(
          gcanvas,
          gctx,
          sim.channels,
          channelColours,
          sim.gm,
          sim.gs,
        );
    }
  }
  if (event.code == 'Space') {
    showParticles = !showParticles;
  }
  if (event.code == 'KeyZ') {
    showChunks = !showChunks;
  }
  if (event.code == 'KeyR') {
    sim.reset();

    sim.clearParticles();

    saveInput.value = sim.save();
    sim.setGPU();
    renderKernel();
    if (gctx)
      renderGrowth(gcanvas, gctx, sim.channels, channelColours, sim.gm, sim.gs);
  }
  if (event.code == 'KeyE' && !keys.ShiftLeft) {
    sim.reset();

    sim.clearParticles();

    sim.startTest();

    saveInput.value = sim.save();
    sim.setGPU();
    renderKernel();
    if (gctx)
      renderGrowth(gcanvas, gctx, sim.channels, channelColours, sim.gm, sim.gs);
  }
  if (event.code.includes('Digit')) {
    const digit = parseInt(event.code[5]);
    if (digit <= sim.channels) mc = digit - 1;
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

sim.onUpdate = () => {
  saveInput.value = sim.save();
  renderKernel();
  if (gctx)
    renderGrowth(gcanvas, gctx, sim.channels, channelColours, sim.gm, sim.gs);
};
