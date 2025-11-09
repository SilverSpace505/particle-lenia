interface TextShadow {
  top: number;
  bottom: number;
  left: number;
  right: number;
  multiply: number;
}

interface Defaults {
  avg: number;
  multiply: number;
}

interface Time {
  [key: string]: number[];
}

interface Times {
  [key: string]: Time;
}

interface TargetSize {
  x: number;
  y: number;
}

interface Vector2 {
  x: number;
  y: number;
}

class Utils {
  lastTime: number;
  delta: number;
  scale: number;
  resScale: number;

  textShadow: TextShadow;
  spacingMul: number;
  fontSizeMul: number;
  autoOutline: number;

  default: Defaults;

  times: Times;

  loaded3db: boolean;
  onLoaded3ds: (() => void)[];

  constructor() {
    this.lastTime = 0;
    this.delta = 0;
    this.scale = 1;
    this.resScale = typeof window != 'undefined' ? window.devicePixelRatio : 1;
    // future me do this

    this.textShadow = { top: 0, bottom: 0, left: 0, right: 0, multiply: 0.5 };
    this.spacingMul = 1;
    this.fontSizeMul = 1;
    this.autoOutline = 4.5;

    this.loaded3db = false;

    this.default = {
      avg: 1000,
      multiply: 100,
    };

    this.onLoaded3ds = [];

    this.times = {};
  }
  loaded3d() {
    for (const func of this.onLoaded3ds) {
      func();
    }
  }
  onLoaded3d(func: () => void) {
    this.onLoaded3ds.push(func);
  }
  getScale(canvas: HTMLCanvasElement, targetSize: TargetSize) {
    const scalex = canvas.width / targetSize.x;
    const scaley = canvas.height / targetSize.y;

    this.scale = Math.min(scalex, scaley);

    return this.scale;
  }
  getDelta(timestamp: number, max = 0.1) {
    this.delta = (timestamp - this.lastTime) / 1000;
    if (this.delta > max) this.delta = max;
    this.lastTime = timestamp;
    return this.delta;
  }
  lerp(start: number, end: number, multiply: number) {
    if (multiply > 1) multiply = 1;
    if (multiply < 0) multiply = 0;
    return start + (end - start) * multiply;
  }
  lerp5(start: number, end: number, step: number) {
    return this.lerpn(start, end, 0.5, step);
  }
  lerpn(start: number, end: number, multiply: number, step: number) {
    multiply = 1 - (1 - multiply) ** step;
    if (multiply > 1) multiply = 1;
    if (multiply < 0) multiply = 0;
    return start + (end - start) * multiply;
  }
  smul(v: number, mul: number, s: number) {
    if (v == 0) return 0;
    return mul ** (Math.log(Math.abs(v)) / Math.log(mul) + s) * Math.sign(v);
  }
  toStyle(r: number, g: number, b: number, a: number) {
    return `rgba(${[r * 255, g * 255, b * 255, a].join(',')})`;
  }
  insertAtIndex(originalString: string, index: number, stringToInsert: string) {
    return (
      originalString.slice(0, index) +
      stringToInsert +
      originalString.slice(index)
    );
  }
  removeAtIndex(originalString: string, index: number) {
    if (index < 0 || index >= originalString.length) {
      return originalString;
    }
    return originalString.slice(0, index) + originalString.slice(index + 1);
  }
  randomR(min: number, max: number) {
    const realMin = Math.min(min, max);
    const realMax = Math.max(min, max);

    return realMin + Math.random() * (realMax - realMin);
  }
  randr(min: number, max: number) {
    const realMin = Math.min(min, max);
    const realMax = Math.max(min, max);

    return realMin + Math.random() * (realMax - realMin);
  }
  to0to1(v: number, min: number, max: number) {
    return (v - min) / (max - min);
  }
  from0to1(v: number, min: number, max: number) {
    return min + v * (max - min);
  }
  safeDiv(value: number, div: number) {
    if (div == 0) {
      return 0;
    }
    return value / div;
  }
  hslaToRgba(h: number, s: number, l: number, a: number) {
    function hueToRgb(p: number, q: number, t: number) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hueToRgb(p, q, h + 1 / 3);
      g = hueToRgb(p, q, h);
      b = hueToRgb(p, q, h - 1 / 3);
    }

    return [r, g, b, a];
  }
  shadeColour(colour: number[], shade: number) {
    return [colour[0] * shade, colour[1] * shade, colour[2] * shade, colour[3]];
  }
  srand(seed: number) {
    seed = Math.abs(seed) * 0xfffffff;
    seed = (seed ^ (seed >>> 21)) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 35), seed | 1);
    seed = seed ^ (seed + Math.imul(seed ^ (seed >>> 11), seed | 61));
    seed = seed ^ (seed >>> 19);

    return (seed >>> 0) / 0xffffffff;
  }
  srandr(seed: number, min: number, max: number) {
    const realMin = Math.min(min, max);
    const realMax = Math.max(min, max);

    return realMin + this.srand(seed) * (realMax - realMin);
  }
  constantTick(
    tick: () => void,
    tickrate: number,
    accumulator: number,
    max = 1000 / 120,
  ) {
    const start = performance.now();
    accumulator += this.delta;
    while (accumulator > 1 / tickrate && performance.now() - start < max) {
      tick();
      accumulator -= 1 / tickrate;
    }
    return accumulator;
  }
  interpVar(
    current: number,
    last: number,
    tickrate: number,
    accumulator: number,
  ) {
    return this.lerp(last, current, accumulator / (1 / tickrate));
  }
  rotv2(vec: Vector2, rot: number) {
    const cosRot = Math.cos(rot);
    const sinRot = Math.sin(rot);

    return {
      x: vec.x * cosRot - vec.y * sinRot,
      y: vec.x * sinRot + vec.y * cosRot,
    };
  }
  nv2(x: number, y: number) {
    const length = Math.sqrt(x ** 2 + y ** 2);
    if (length > 0) {
      return [x / length, y / length];
    }
    return [0, 0];
  }
  addv3l(vec1: number[], vec2: number[]) {
    return [vec1[0] + vec2[0], vec1[1] + vec2[1], vec1[2] + vec2[2]];
  }
  mulv3l(vec1: number[], vec2: number[]) {
    return [vec1[0] * vec2[0], vec1[1] * vec2[1], vec1[2] * vec2[2]];
  }
  generateId(letters: number, numbers = true) {
    const lettersC = numbers
      ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHILKMNOPQRSTUVWXYZ0123456789'
      : 'abcdefghijklmnopqrstuvwxyzABCDEFGHILKMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < letters; i++) {
      id += lettersC[Math.floor(Math.random() * lettersC.length)];
    }
    return id;
  }
  startTime() {
    return performance.now();
  }
  addTime(start: number, group: string, name: string) {
    if (!(group in this.times)) this.times[group] = {};
    if (!(name in this.times[group])) this.times[group][name] = [];
    this.times[group][name].push((performance.now() - start) / 1000);
  }
  getTime(group: string, name: string) {
    if (!(group in this.times)) return 0;
    if (!(name in this.times[group])) return 0;
    while (this.times[group][name].length > this.default.avg) {
      this.times[group][name].splice(0, 1);
    }
    let sum = 0;
    for (let i = 0; i < this.times[group][name].length; i++) {
      sum += this.times[group][name][i];
    }
    return (sum / this.times[group][name].length) * this.default.multiply;
  }
  secondsToTime(secondsR: number) {
    const seconds = secondsR % 60;
    const minutes = Math.floor(secondsR / 60) % 60;
    const hours = Math.floor(secondsR / 60 / 60) % 24;
    const days = Math.floor(secondsR / 60 / 60 / 24);

    let str = '';

    if (days > 0) {
      str += days + ` Day${days != 1 ? 's' : ''}, `;
    }
    if (hours > 0) {
      str += hours + ` Hour${hours != 1 ? 's' : ''}, `;
    }
    if (minutes > 0) {
      str += minutes + ` Minute${minutes != 1 ? 's' : ''}, `;
    }
    if (seconds > 0) {
      str += seconds + ` Second${seconds != 1 ? 's' : ''}, `;
    }
    return str.substring(0, str.length - 2);
  }
  ticksToTime(ticks: number, tickrate: number) {
    return this.secondsToTime(Math.floor(ticks / tickrate));
  }
  loadModel(model: string, invertz: boolean) {
    const lines = model.split('\n');

    let line = 3;

    const loadedVertices = [];
    const loadedColours = [];
    const loadedNormals = [];
    const loadedUvs = [];

    const vertices: number[] = [];
    const faces: number[] = [];

    const colours: number[] = [];
    const normals: number[] = [];

    const uvs: number[] = [];

    while (line < lines.length) {
      const data = lines[line].split(' ');

      if (data[0] == 'v') {
        loadedVertices.push([
          parseFloat(data[1]),
          parseFloat(data[2]),
          parseFloat(data[3]) * (invertz ? 1 : -1),
        ]);
        loadedColours.push([
          data[4] ? parseFloat(data[4]) : 0.5,
          data[5] ? parseFloat(data[5]) : 0.5,
          data[6] ? parseFloat(data[6]) : 0.5,
          1,
        ]);
        // loadedColours.push([1, 1, 1, 1]);
      }

      if (data[0] == 'vn') {
        loadedNormals.push([
          parseFloat(data[1]),
          parseFloat(data[2]),
          parseFloat(data[3]) * (invertz ? -1 : 1),
        ]);
      }

      if (data[0] == 'vt') {
        loadedUvs.push([parseFloat(data[1]), parseFloat(data[2])]);
      }

      if (data[0] == 'f') {
        const indicies1 = data[invertz ? 3 : 1].split('/');
        const indicies2 = data[2].split('/');
        const indicies3 = data[invertz ? 1 : 3].split('/');

        vertices.push(
          ...loadedVertices[parseInt(indicies1[0]) - 1],
          ...loadedVertices[parseInt(indicies2[0]) - 1],
          ...loadedVertices[parseInt(indicies3[0]) - 1],
        );

        colours.push(
          ...loadedColours[parseInt(indicies1[0]) - 1],
          ...loadedColours[parseInt(indicies2[0]) - 1],
          ...loadedColours[parseInt(indicies3[0]) - 1],
        );

        normals.push(
          ...loadedNormals[parseInt(indicies1[2]) - 1],
          ...loadedNormals[parseInt(indicies2[2]) - 1],
          ...loadedNormals[parseInt(indicies3[2]) - 1],
        );

        if (loadedUvs.length > 0) {
          uvs.push(
            ...loadedUvs[parseInt(indicies1[1]) - 1],
            ...loadedUvs[parseInt(indicies2[1]) - 1],
            ...loadedUvs[parseInt(indicies3[1]) - 1],
          );
        }

        // const colouri = parseInt(indicies1);

        // colours.push(
        //   data[4] ? parseFloat(data[4]) : 0.5,
        //   data[5] ? parseFloat(data[5]) : 0.5,
        //   data[6] ? parseFloat(data[6]) : 0.5,
        //   1,
        // );

        faces.push(faces.length, faces.length + 1, faces.length + 2);
      }

      line++;
    }

    return { vertices, faces, colours, normals, uvs };
  }
  getEulerYXZ(matrix: number[]) {
    let yaw, roll, pitch;

    // Ensure proper handling for singularity (gimbal lock)
    // If M[6] (sin(roll)) is close to +/- 1, we have gimbal lock.
    const sy = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1]);
    const singular = sy < 1e-6; // Check if near singular

    if (!singular) {
      yaw = Math.atan2(-matrix[2], matrix[10]); // Y (Yaw)
      roll = Math.asin(matrix[6]); // X (Roll)
      pitch = Math.atan2(-matrix[4], matrix[5]); // Z (Pitch)
    } else {
      // Gimbal lock case: pitch is zero, just determine yaw and roll
      yaw = Math.atan2(matrix[9], matrix[5]); // Simplified Y (Yaw)
      roll = Math.asin(matrix[6]); // X (Roll)
      pitch = 0; // Z (Pitch)
    }

    return [yaw, roll, pitch]; // Returns [yaw, roll, pitch]
  }
  placeLine(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    size: number,
  ) {
    const pos = {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      z: (z1 + z2) / 2,
    };
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
    // const v = {
    //   x: x2 - x1,
    //   y: y2 - y1,
    //   z: z2 - z1
    // }
    const yangle = Math.atan2(-(x2 - x1), -(z2 - z1));

    const lengthxz = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const xangle = Math.atan2(y2 - y1, lengthxz);

    return {
      pos,
      size: { x: size, y: size, z: length },
      rot: { x: xangle, y: yangle, z: 0 },
    };
  }
  raycastHitBox(
    s: [number, number, number],
    d: [number, number, number],
    min: [number, number, number],
    max: [number, number, number],
    maxDistance: number,
  ) {
    const epsilon = 1e-6;

    let tmin = 0;
    let tmax = maxDistance;

    for (let dim = 0; dim < 3; dim++) {
      if (Math.abs(d[dim]) < epsilon) {
        if (s[dim] < min[dim] || s[dim] > max[dim]) {
          return false;
        }
        continue;
      }

      const invDir = 1 / d[dim];

      let t1 = (min[dim] - s[dim]) * invDir;
      let t2 = (max[dim] - s[dim]) * invDir;

      if (invDir < 0) {
        [t1, t2] = [t2, t1];
      }

      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);

      if (tmin > tmax || tmax < 0) {
        return false;
      }
    }

    return tmin < maxDistance;
  }
  raycastDistanceBox(
    s: [number, number, number],
    d: [number, number, number],
    min: [number, number, number],
    max: [number, number, number],
    maxDistance: number,
  ) {
    const epsilon = 1e-6;

    let tmin = 0;
    let tmax = maxDistance;

    for (let dim = 0; dim < 3; dim++) {
      if (Math.abs(d[dim]) < epsilon) {
        if (s[dim] < min[dim] || s[dim] > max[dim]) {
          return maxDistance;
        }
        continue;
      }
      const invDir = 1 / d[dim];

      let t1 = (min[dim] - s[dim]) * invDir;
      let t2 = (max[dim] - s[dim]) * invDir;

      if (t1 > t2) {
        [t1, t2] = [t2, t1];
      }

      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);

      if (tmin > tmax || tmax < 0) {
        return maxDistance;
      }
    }

    if (tmin < tmax && tmin < maxDistance) {
      return tmin;
    }

    return maxDistance;
  }
}

const utils = new Utils();

export default utils;
