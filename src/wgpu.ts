let adapter: GPUAdapter | null;
let device: GPUDevice;
let chunkBuffer: GPUBuffer;
let chunkHashBuffer: GPUBuffer;
let colourBuffer: GPUBuffer;
let paramsBuffer: GPUBuffer;
let renderPipeline: GPURenderPipeline;
let bindGroup: GPUBindGroup;
let querySet: GPUQuerySet;
let resolveBuffer: GPUBuffer;
let readbackBuffer: GPUBuffer;

let simBuffer: GPUBuffer;
let simSBuffer: GPUBuffer;

import renderShaders from './render.wgsl?raw';

export const ready = { v: false };

export const gpuTimes: number[] = [];

let canTimestamp = false;

const bufferLength = 16384;
const hashLength = 4096;

type Particle = [number, number, number, number];

export async function setup(
  ctx: GPUCanvasContext,
  channels: number,
  m: number[][][],
  s: number[][][],
  mul: number[][][],
  rings: number[][],
  channelColours: [number, number, number][],
  gm: number[],
  gs: number[],
) {
  if (!navigator.gpu) {
    throw Error('WebGPU not supported');
  }
  adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn't request WebGPU adapter.");
  }

  canTimestamp = adapter.features.has('timestamp-query');

  device = await adapter.requestDevice({
    requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
  });

  const format = navigator.gpu.getPreferredCanvasFormat();

  ctx.configure({ device, format, alphaMode: 'premultiplied' });

  chunkBuffer = device.createBuffer({
    size: bufferLength * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  chunkHashBuffer = device.createBuffer({
    size: hashLength * 4 * Int32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  colourBuffer = device.createBuffer({
    size: channels * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  paramsBuffer = device.createBuffer({
    size: (5 + 3) * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  //

  simBuffer = device.createBuffer({
    size:
      (m.flat(2).length +
        s.flat(2).length +
        mul.flat(2).length +
        rings.flat().length +
        gm.length +
        gs.length) *
      Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  simSBuffer = device.createBuffer({
    size: 8 * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  //

  const renderShader = device.createShaderModule({
    code: renderShaders,
  });

  renderPipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module: renderShader, entryPoint: 'vs' },
    fragment: { module: renderShader, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  bindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: simBuffer } },
      { binding: 2, resource: { buffer: simSBuffer } },
      { binding: 3, resource: { buffer: colourBuffer } },
      { binding: 4, resource: { buffer: chunkBuffer } },
      { binding: 5, resource: { buffer: chunkHashBuffer } },
    ],
  });

  const colourData = new Float32Array(channels * 4);
  for (let i = 0; i < channels; i++) {
    colourData[i * 4] = channelColours[i][0];
    colourData[i * 4 + 1] = channelColours[i][1];
    colourData[i * 4 + 2] = channelColours[i][2];
  }
  device.queue.writeBuffer(colourBuffer, 0, colourData);

  setSim(m, s, mul, rings, gm, gs);

  if (canTimestamp) {
    querySet = device.createQuerySet({
      type: 'timestamp',
      count: 2,
    });
    resolveBuffer = device.createBuffer({
      size: 2 * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    readbackBuffer = device.createBuffer({
      size: 2 * 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  ready.v = true;
}

export function setParams(
  camera: { x: number; y: number; zoom: number },
  chunkSize: number,
  channels: number,
  r: number,
  aspectRatio: number,
) {
  const data = new Float32Array([
    camera.x,
    -camera.y,
    camera.zoom,
    chunkSize,
    channels,
    r,
    aspectRatio,
    0,
  ]);
  device.queue.writeBuffer(paramsBuffer, 0, data);
}

export function setSim(
  m: number[][][],
  s: number[][][],
  mul: number[][][],
  rings: number[][],
  gm: number[],
  gs: number[],
) {
  const simdata = new Float32Array([
    ...m.flat(2),
    ...s.flat(2),
    ...mul.flat(2),
    ...rings.flat(),
    ...gm,
    ...gs,
  ]);
  device.queue.writeBuffer(simBuffer, 0, simdata);

  const simSdata = new Uint32Array([
    m.flat(2).length,
    s.flat(2).length,
    mul.flat(2).length,
    rings.flat().length,
    gm.length,
  ]);
  device.queue.writeBuffer(simSBuffer, 0, simSdata);
}

// const maxInChunk = 100;

function hash3i(k: [number, number, number]) {
  let x = (k[0] | 0) >>> 0;
  let y = (k[1] | 0) >>> 0;
  let z = (k[2] | 0) >>> 0;

  x = Math.imul(x, 0x9e3779b1) >>> 0;
  y = Math.imul(y, 0x85ebca6b) >>> 0;
  z = Math.imul(z, 0xc2b2ae35) >>> 0;

  let h = (x ^ y ^ z) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function setChunkParticles(chunks: Record<string, Particle[]>[]) {
  if (!ready.v) return;
  const bufferData = new Float32Array(bufferLength);
  const bufferDataHash = new Int32Array(hashLength * 4);
  bufferDataHash.fill(0x7fffffff);

  let i = 0;
  for (let ch = 0; ch < chunks.length; ch++) {
    for (const c in chunks[ch]) {
      const x = parseInt(c.split(',')[0]);
      const y = parseInt(c.split(',')[1]);
      let ci = hash3i([ch, x, y]) & (hashLength - 1);
      let tries = 0;
      while (bufferDataHash[ci * 4] != 0x7fffffff && tries < 20) {
        ci = (ci + 1) & (hashLength - 1);
        tries++;
      }

      if (tries == 20) continue;

      bufferDataHash[ci * 4] = ch;
      bufferDataHash[ci * 4 + 1] = x;
      bufferDataHash[ci * 4 + 2] = y;
      bufferDataHash[ci * 4 + 3] = i;

      bufferData[i] = chunks[ch][c].length;
      i++;
      for (let j = 0; j < chunks[ch][c].length; j++) {
        bufferData[i] = chunks[ch][c][j][0];
        bufferData[i + 1] = chunks[ch][c][j][1];
        bufferData[i + 2] = chunks[ch][c][j][2];
        bufferData[i + 3] = chunks[ch][c][j][3];
        i += 4;
      }
    }
  }

  device.queue.writeBuffer(chunkBuffer, 0, bufferData);
  device.queue.writeBuffer(chunkHashBuffer, 0, bufferDataHash);
}

export function render(ctx: GPUCanvasContext) {
  const encoder = device.createCommandEncoder();
  const view = ctx.getCurrentTexture().createView();

  const descriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: 'store',
      },
    ],
  };
  if (canTimestamp)
    descriptor.timestampWrites = {
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };

  const pass = encoder.beginRenderPass(descriptor);

  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();

  if (canTimestamp) {
    encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
    if (readbackBuffer.mapState == 'unmapped') {
      encoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, 16);
    }
  }

  device.queue.submit([encoder.finish()]);

  if (canTimestamp && readbackBuffer.mapState == 'unmapped') {
    readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
      const t = new BigInt64Array(readbackBuffer.getMappedRange());
      gpuTimes.push(Number(t[1] - t[0]) / 1000000);
      if (gpuTimes.length > 100) gpuTimes.splice(0, 1);
      readbackBuffer.unmap();
    });
  }
}
