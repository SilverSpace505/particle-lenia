import { fsc, getForce, tsc } from './sim-utils';
import type { Camera, DisplayName, Particle } from './state';
import { setSim } from './wgpu';

export class Sim {
  allTicks = 0;
  tests = 0;
  simTime = 0;
  totalForce = 0;
  r: number;
  chunkSize: number;
  particles: Particle[][];
  channels: number;
  chunks: Record<string, Particle[]>[];
  ringsAmt: number;

  search = false;
  paused = false;

  speed = 0.0000001 * 10;
  friction = 0.9;

  m: number[][][] = [];
  s: number[][][] = [];
  mul: number[][][] = [];
  gm: number[] = [];
  gs: number[] = [];
  rings: number[][] = [];

  constructor(channels: number, r: number, ringsAmt: number) {
    this.channels = channels;

    this.r = r;
    this.chunkSize = r / 2;
    this.ringsAmt = ringsAmt;

    this.chunks = [];
    for (let c = 0; c < this.channels; c++) {
      this.chunks.push({});
    }

    this.particles = [];
    for (let c = 0; c < this.channels; c++) {
      this.particles.push([]);
    }
  }
  handleInteraction(
    canvas: HTMLCanvasElement,
    camera: Camera,
    keys: Record<string, boolean>,
    mouse: { x: number; y: number; down: boolean },
    mc: number,
    interactRange: number,
  ) {
    if (!mouse.down) return;
    const mp = fsc(
      mouse.x / canvas.width,
      mouse.y / canvas.height,
      camera.x,
      camera.y,
      camera.zoom,
      canvas,
    );
    if (keys.ShiftLeft) {
      for (let c = 0; c < this.particles.length; c++) {
        if (mc != -1 && c != mc) continue;
        for (const particle of this.particles[c]) {
          const d = Math.sqrt(
            (mp[0] - particle[0]) ** 2 + (1 - mp[1] - particle[1]) ** 2,
          );
          if (d < interactRange * this.r) {
            particle[2] += ((mp[0] - particle[0]) / 50) * (keys.KeyX ? -1 : 1);
            particle[3] +=
              ((1 - mp[1] - particle[1]) / 50) * (keys.KeyX ? -1 : 1);
          }
        }
      }
    } else if (!keys.KeyX) {
      this.particles[
        mc == -1 ? Math.floor(Math.random() * this.channels) : mc
      ].push([
        mp[0],
        1 - mp[1],
        (Math.random() * 2 - 1) / 1000,
        (Math.random() * 2 - 1) / 1000,
      ]);
    } else {
      if (mc == -1) {
        for (let c = 0; c < this.channels; c++) {
          for (let i = 0; i < this.particles[c].length; i++) {
            const d = Math.sqrt(
              (mp[0] - this.particles[c][i][0]) ** 2 +
                (1 - mp[1] - this.particles[c][i][1]) ** 2,
            );
            if (d < interactRange * this.r) {
              this.particles[c].splice(i, 1);
              i--;
            }
          }
        }
      } else {
        for (let i = 0; i < this.particles[mc].length; i++) {
          const d = Math.sqrt(
            (mp[0] - this.particles[mc][i][0]) ** 2 +
              (1 - mp[1] - this.particles[mc][i][1]) ** 2,
          );
          if (d < interactRange * this.r) {
            this.particles[mc].splice(i, 1);
            i--;
          }
        }
      }
    }
  }
  constructChunks() {
    this.chunks = [];
    for (let c = 0; c < this.channels; c++) {
      this.chunks[c] = {};
      for (const particle of this.particles[c]) {
        const cx = Math.floor(particle[0] / this.chunkSize);
        const cy = Math.floor(particle[1] / this.chunkSize);
        const ch = cx + ',' + cy;
        if (ch in this.chunks[c]) {
          this.chunks[c][ch].push(particle);
        } else {
          this.chunks[c][ch] = [particle];
        }
      }
    }
  }
  applyForces(totals: { force: number }) {
    for (let c = 0; c < this.channels; c++) {
      for (const particle of this.particles[c]) {
        const force = getForce(
          particle[0],
          particle[1],
          c,
          this.r,
          this.chunkSize,
          this.channels,
          this.chunks,
          this.rings,
          this.m,
          this.s,
          this.mul,
          this.gm,
          this.gs,
          totals,
        );

        particle[2] -= force[0] * this.speed;
        particle[3] -= force[1] * this.speed;

        // particle[2] -= particle[0] / 10000;
        // particle[3] -= particle[1] / 10000;

        particle[2] *= this.friction;
        particle[3] *= this.friction;
      }
    }
  }
  moveParticles(totals: { velocity: number }) {
    for (let c = 0; c < this.channels; c++) {
      for (const particle of this.particles[c]) {
        totals.velocity += particle[2] ** 2 + particle[3] ** 2;
        particle[0] += particle[2];
        particle[1] += particle[3];
        // if (particle[0] < bounds[0]) particle[0] = bounds[2];
        // if (particle[0] > bounds[2]) particle[0] = bounds[0];
        // if (particle[1] < bounds[1]) particle[1] = bounds[3];
        // if (particle[1] > bounds[3]) particle[1] = bounds[1];
      }
    }
  }
  updateDisplays(
    displays: Record<DisplayName, HTMLParagraphElement>,
    totals: { force: number; velocity: number },
  ) {
    displays.force.textContent = `Force: ${Math.round(totals.force)}`;
    displays.velocity.textContent = `Velocity: ${Math.round(totals.velocity * 100000)}`;
    displays.simTime.textContent = `Sim Ticks: ${this.simTime}`;
    displays.allTime.textContent = `All Ticks: ${this.allTicks}`;
    displays.tests.textContent = `Tests: ${this.tests}`;
  }
  autoSearch(totals: { velocity: number }) {
    const stopTime = 100 * 60 * 30;
    const goalTime = 100 * 60 * 5;

    if (
      (totals.velocity < 0.002 / 2 / 5 / 5 / 5 || this.simTime >= stopTime) &&
      this.search
    ) {
      if (this.simTime >= goalTime) {
        // saves.push(saveSim());
        // displays.saves.textContent = `Saves: ${saves.length}`;
      }

      // if (longest.length < 100 || simTime > longest[longest.length - 1].ticks) {
      //   longest.push({ ticks: simTime, save: saveSim() });
      //   longest.sort((a, b) => b.ticks - a.ticks);
      //   if (longest.length > 100) longest.pop();
      //   displays.longest.textContent = `Longest: ${longest[0].ticks}`;
      // }

      this.simTime = 0;
      this.reset();

      this.tests++;

      this.particles = [];
      for (let c = 0; c < this.channels; c++) {
        this.particles.push([]);
      }

      this.startTest();

      this.setGPU();
      this.onUpdate();
    }
  }
  tick(
    keys: Record<string, boolean>,
    mouse: { x: number; y: number; down: boolean },
    camera: Camera,
    canvas: HTMLCanvasElement,
    displays: Record<DisplayName, HTMLParagraphElement>,
    mc: number,
    interactRange: number,
  ) {
    if (!this.paused) {
      this.allTicks++;
      this.simTime++;
    }

    this.handleInteraction(canvas, camera, keys, mouse, mc, interactRange);

    this.constructChunks();

    if (this.paused) return;

    const totals = { force: 0, velocity: 0 };

    this.applyForces(totals);

    this.moveParticles(totals);

    this.autoSearch(totals);

    this.updateDisplays(displays, totals);
  }
  setGPU() {
    setSim(this.m, this.s, this.mul, this.rings, this.gm, this.gs);
  }
  clearParticles() {
    this.particles = [];
    for (let c = 0; c < this.channels; c++) {
      this.particles.push([]);
    }
  }
  reset() {
    this.m = [];
    this.s = [];
    this.mul = [];
    this.rings = [];
    for (let c1 = 0; c1 < this.channels; c1++) {
      this.m.push([]);
      this.s.push([]);
      this.mul.push([]);
      this.rings.push([]);
      for (let c2 = 0; c2 < this.channels; c2++) {
        this.m[c1].push([]);
        this.s[c1].push([]);
        this.mul[c1].push([]);
        this.rings[c1].push(this.ringsAmt);
        for (let i = 0; i < this.rings[c1][c2]; i++) {
          const nm = Math.random() * 0.8;
          this.m[c1][c2].push(nm);
          this.s[c1][c2].push(Math.random() * Math.min(1 - nm, nm));
          this.mul[c1][c2].push((Math.random() * 2 - 1) ** 5 * 2);
        }
      }
    }

    this.gm = [];
    this.gs = [];
    for (let i = 0; i < this.channels; i++) {
      const m = Math.random() * 0.9 + 0.05;
      this.gm.push(m);
      this.gs.push(Math.min(m / 2, (1 - m) / 2, Math.random()));
    }
  }
  startTest() {
    let left = 200;
    const amt = Math.ceil(Math.random() * 10);
    for (let i = 0; i < amt; i++) {
      if (left <= 0) continue;
      const amt2 = Math.min(left, Math.ceil(Math.random() * left));

      const x = Math.random() - 0.5;
      const y = Math.random() - 0.5;

      for (let j = 0; j < amt2; j++) {
        this.particles[Math.floor(Math.random() * this.channels)].push([
          x + (Math.random() - 0.5) ** 3 / 4,
          y + (Math.random() - 0.5) ** 3 / 4,
          (Math.random() * 2 - 1) / 1000,
          (Math.random() * 2 - 1) / 1000,
        ]);
        left--;
      }
    }
  }
  renderBackground(
    ctx: CanvasRenderingContext2D,
    gpucanvas: HTMLCanvasElement,
    canvas: HTMLCanvasElement,
  ) {
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
  }
  renderParticles(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    channelColours: [number, number, number][],
  ) {
    for (let c = 0; c < this.channels; c++) {
      ctx.beginPath();
      for (const particle of this.particles[c]) {
        const p = tsc(
          particle[0],
          particle[1],
          camera.x,
          camera.y,
          camera.zoom,
          canvas,
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
  renderChunks(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    channelColours: [number, number, number][],
  ) {
    ctx.globalCompositeOperation = 'lighten';
    for (let c = 0; c < this.channels; c++) {
      ctx.beginPath();
      for (const chunk in this.chunks[c]) {
        const coords = chunk.split(',');
        const x = parseInt(coords[0]);
        const y = parseInt(coords[1]) + 1;

        const p = tsc(
          x * this.chunkSize,
          y * this.chunkSize,
          camera.x,
          camera.y,
          camera.zoom,
          canvas,
        );

        ctx.rect(
          p[0] * canvas.width,
          (1 - p[1]) * canvas.height,
          this.chunkSize * camera.zoom * canvas.height,
          this.chunkSize * camera.zoom * canvas.height,
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
  render(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    gpucanvas: HTMLCanvasElement,
    showParticles: boolean,
    showChunks: boolean,
    camera: Camera,
    channelColours: [number, number, number][],
    showInteraction: boolean,
    mouse: { x: number; y: number; down: boolean },
    interactRange: number,
  ) {
    if (!ctx) return;
    this.renderBackground(ctx, gpucanvas, canvas);

    if (showParticles)
      this.renderParticles(canvas, ctx, camera, channelColours);

    if (showChunks) this.renderChunks(canvas, ctx, camera, channelColours);

    if (showInteraction) {
      ctx.beginPath();
      ctx.arc(
        mouse.x,
        mouse.y,
        camera.zoom * canvas.height * interactRange * this.r,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 * camera.zoom;
      ctx.stroke();
    }
  }
  onUpdate() {}
  save() {
    return JSON.stringify({
      m: this.m,
      s: this.s,
      mul: this.mul,
      rings: this.rings,
      gm: this.gm,
      gs: this.gs,
      speed: this.speed,
      friction: this.friction,
      r: this.r,
      channels: this.channels,
      v: 1,
    });
  }
  load(save: string) {
    const loaded = JSON.parse(save);
    this.m = loaded.m;
    this.s = loaded.s;
    this.mul = loaded.mul;
    this.rings = loaded.rings;
    this.gm = loaded.gm;
    this.gs = loaded.gs;
    if (loaded.speed) this.speed = loaded.speed;
    if (loaded.friciton) this.friction = loaded.friction;
    if (loaded.r) {
      this.r = loaded.r;
      this.chunkSize = this.r * 2;
    }
    if (loaded.channels) this.channels = loaded.channels;
    this.onUpdate();
    this.setGPU();
  }
}
