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
  type Particle,
} from './state';
import { Sim, type SimSave } from './sim';
import { fsc, renderGrowth, renderKernel, tsc } from './sim-utils';

import { socket } from './network';

declare global {
  interface Window {
    saves: string[];
    longest: { ticks: number; save: string }[];
    loadedData: unknown;
    capturedCreature: Particle[][];
    saveCreature: (creature: Particle[][]) => void;
    loadCreature: (save: string) => void;
    loadSave: (save: string) => void;
    loadJSONFile: () => void;
    downloadObject: (exportObj: unknown, exportName: string) => void;
    downloadCreature: (name: string) => void;
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

const captureBtn = document.getElementById('capture') as HTMLButtonElement;

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

  sim.tick(
    keys,
    { ...mouse, down: mouse.down && capturePhase == -1 },
    camera,
    canvas,
    displays,
    mc,
    interactRange,
  );

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

  if (ctx && capturePhase == 0) {
    ctx.beginPath();
    ctx.moveTo(mouse.x, mouse.y - 10);
    ctx.lineTo(mouse.x, mouse.y + 10);
    ctx.moveTo(mouse.x - 10, mouse.y);
    ctx.lineTo(mouse.x + 10, mouse.y);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  if (ctx && capturePhase == 1 && captureStart) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
    const start = tsc(
      captureStart[0],
      captureStart[1],
      camera.x,
      camera.y,
      camera.zoom,
      canvas,
    );
    const p1 = [start[0] * canvas.width, (1 - start[1]) * canvas.height];
    const p2 = [mouse.x, mouse.y];
    ctx.fillRect(
      Math.min(p1[0], p2[0]),
      Math.min(p1[1], p2[1]),
      Math.max(p1[0], p2[0]) - Math.min(p1[0], p2[0]),
      Math.max(p1[1], p2[1]) - Math.min(p1[1], p2[1]),
    );
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
      Math.min(p1[0], p2[0]),
      Math.min(p1[1], p2[1]),
      Math.max(p1[0], p2[0]) - Math.min(p1[0], p2[0]),
      Math.max(p1[1], p2[1]) - Math.min(p1[1], p2[1]),
    );
    ctx.setLineDash([]);
  }

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
  if (document.activeElement?.tagName == 'INPUT') return;

  if (event.code == 'KeyT') timewarp = !timewarp;
  if (event.code == 'KeyP') sim.paused = !sim.paused;
  if (event.code == 'KeyQ' && !keys.ShiftLeft && !keys.KeyX) {
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
  if (event.code == 'KeyE' && !keys.ShiftLeft && !keys.KeyX) {
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

let capturePhase = -1;
let captureStart: [number, number] | undefined;

captureBtn.onclick = () => {
  if (capturePhase == -1) {
    capturePhase = 0;
  } else if (capturePhase != 2) {
    capturePhase = -1;
  }
};

canvas.onmousedown = () => {
  if (capturePhase == 0) {
    capturePhase = 1;
    const mp = fsc(
      mouse.x / canvas.width,
      mouse.y / canvas.height,
      camera.x,
      camera.y,
      camera.zoom,
      canvas,
    );
    captureStart = [mp[0], 1 - mp[1]];
  } else if (capturePhase == 1 && captureStart) {
    captureBtn.classList.add('stable');
    capturePhase = 2;
    const mp = fsc(
      mouse.x / canvas.width,
      mouse.y / canvas.height,
      camera.x,
      camera.y,
      camera.zoom,
      canvas,
    );
    const particles = sim.getParticles(...captureStart, mp[0], 1 - mp[1], -1);
    let minx = Infinity;
    let miny = Infinity;
    for (const channel of particles) {
      for (const particle of channel) {
        minx = Math.min(minx, particle[0]);
        miny = Math.min(miny, particle[1]);
      }
    }
    for (const channel of particles) {
      for (const particle of channel) {
        particle[0] -= minx;
        particle[1] -= miny;
      }
    }

    window.capturedCreature = particles;
  }
};

canvas.onmouseup = () => {
  if (capturePhase == 3) capturePhase = -1;
};

window.saveCreature = (creature) => {
  console.log(JSON.stringify({ sim: sim.saveObj(), particles: creature }));
};

window.loadCreature = (save) => {
  const saves: { sim: SimSave; particles: Particle[][] } = JSON.parse(save);

  sim.reset();
  sim.loadObj(saves.sim);

  sim.clearParticles();

  saveInput.value = JSON.stringify(saves.sim);
  sim.setGPU();
  renderKernel();
  if (gctx)
    renderGrowth(gcanvas, gctx, sim.channels, channelColours, sim.gm, sim.gs);

  for (let c = 0; c < saves.particles.length; c++) {
    sim.particles[c].push(...saves.particles[c]);
  }
};

const cCopyBtn = document.getElementById('cCopyBtn') as HTMLButtonElement;

cCopyBtn.onclick = () => {
  if (capturePhase != 2) return;
  capturePhase = 3;
  captureBtn.classList.remove('stable');
  navigator.clipboard.writeText(
    JSON.stringify({ sim: sim.saveObj(), particles: window.capturedCreature }),
  );
};

const cCancelBtn = document.getElementById('cCancelBtn') as HTMLButtonElement;

cCancelBtn.onclick = () => {
  if (capturePhase != 2) return;
  capturePhase = 3;
  captureBtn.classList.remove('stable');
};

const cName = document.getElementById('cName') as HTMLInputElement;
const cUploadBtn = document.getElementById('cUploadBtn') as HTMLButtonElement;

cUploadBtn.onclick = () => {
  if (cName.value.length < 3) return;
  if (capturePhase != 2) return;
  capturePhase = 3;
  captureBtn.classList.remove('stable');

  socket.emit(
    'uploadC',
    cName.value,
    JSON.stringify({ sim: sim.saveObj(), particles: window.capturedCreature }),
  );

  cName.value = '';
};

window.downloadCreature = (name) => {
  socket.emit('downloadC', name, (creature: string) => {
    if (creature) {
      window.loadCreature(creature);
    }
  });
};
