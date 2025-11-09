
struct Params {
    camera: vec3<f32>,
    chunkSize: f32,
    channels: f32,
    r: f32,
    aspectRatio: f32,
}

struct SimS {
    v1: vec4<u32>,
    v2: u32
}

struct ChunkHash {
    c: i32,
    x: i32,
    y: i32,
    i: i32,
}

@group(0) @binding(0) var<uniform> params: Params;

@group(0) @binding(1) var<storage, read> sim: array<f32>;
@group(0) @binding(2) var<uniform> simS: SimS;
@group(0) @binding(3) var<storage, read> channelColours: array<vec3<f32>>;

@group(0) @binding(4) var<storage, read> chunks: array<f32>;
@group(0) @binding(5) var<storage, read> chunkHashes: array<ChunkHash>;


struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>
}

fn fsc(x: f32, y: f32, cx: f32, cy: f32, cz: f32, a: f32) -> vec2<f32> {
    return vec2f(((x - 0.5) / cz) * a - cx, ((y - 0.5) / cz) - cy);
}

fn bell(x: f32, m: f32, s: f32) -> f32 {
    let t = (x - m) / s;
    return exp(-(t * t));
}

// fn bell(x: f32, m: f32, s: f32) -> f32 {
//     return exp((pow((x - m) / s, 2.0) * -1.0) / 2.0);
// }

fn growth(near: f32, m: f32, s: f32) -> f32 {
    return bell(near, m, s);
}

fn hash3i(k: vec3<i32>) -> u32 {
    var x: u32 = bitcast<u32>(k.x) * 0x9E3779B1u;
    var y: u32 = bitcast<u32>(k.y) * 0x85EBCA6Bu;
    var z: u32 = bitcast<u32>(k.z) * 0xC2B2AE35u;

    var h: u32 = x ^ y ^ z;

    h ^= h >> 16u;
    h *= 0x7FEB352Du;
    h ^= h >> 15u;
    h *= 0x846CA68Bu;
    h ^= h >> 16u;

    return h;
}

fn findChunk(c: f32, x: f32, y: f32) -> vec2<u32> {
    let hashesLength = arrayLength(&chunkHashes) - 1u;

    var i = hash3i(vec3i(i32(c), i32(x), i32(y))) & hashesLength;
    var tries = 0u;

    while tries < 20u {

        if chunkHashes[i].c == 0x7FFFFFFF {
            return vec2u(0xFFFFFFFFu, 0xFFFFFFFFu);
        }


        if i32(c) == chunkHashes[i].c && i32(x) == chunkHashes[i].x && i32(y) == chunkHashes[i].y {
            return vec2u(u32(chunkHashes[i].i + 1), u32(chunks[chunkHashes[i].i]));
        }

        i = (i + 1u) & hashesLength;
        tries++;
    }

    return vec2u(0xFFFFFFFFu, 0xFFFFFFFFu);
}

// fn getNear(x: f32, y: f32, c1: u32) -> f32 {
//     let sO = simS.v1.x;
//     let dO = simS.v1.y + sO;
//     let rO = simS.v1.z + dO;

//     let channels = u32(params.channels);

//     let rs = params.r * params.r;
//     let cxmin = i32(floor((x - params.r) / params.chunkSize));
//     let cymin = i32(floor((y - params.r) / params.chunkSize));
//     let cxmax = i32(floor((x + params.r) / params.chunkSize));
//     let cymax = i32(floor((y + params.r) / params.chunkSize));
//     var near = 0.0;
//     for (var c2 = 0u; c2 < channels; c2++) {
//         for (var cx = cxmin; cx <= cxmax; cx++) {
//             for (var cy = cymin; cy <= cymax; cy++) {
//                 let c = findChunk(f32(c2), f32(cx), f32(cy));
//                 if c.x != 0xFFFFFFFFu {
//                     for (var i = 0u; i < c.y; i++) {
//                         let d = pow(x - chunks[c.x + i * 4u], 2.0) + pow(y - chunks[c.x + i * 4u + 1u], 2.0);
//                         if d <= rs {
//                             let rd = sqrt(d);
//                             var vmax = 0.0;
//                             let rings = u32(sim[rO + c1 * channels + c2]);
//                             for (var j = 0u; j < rings; j++) {
//                                 let k = c1 * channels * rings + c2 * rings + j;
//                                 vmax += bell(rd / params.r, sim[k], sim[sO + k]) / sim[dO + k];
//                             }
//                             near += vmax;
//                         }
//                     }
//                 }
//             }
//         }
//     }

//     return near;
// }

fn getNear(x: f32, y: f32, c1: u32) -> f32 {
    let sO = simS.v1.x;
    let mO = simS.v1.y + sO;
    let rO = simS.v1.z + mO;

    let channels = u32(params.channels);

    let rs = params.r * params.r;
    let cxmin = i32(floor((x - params.r) / params.chunkSize));
    let cymin = i32(floor((y - params.r) / params.chunkSize));
    let cxmax = i32(floor((x + params.r) / params.chunkSize));
    let cymax = i32(floor((y + params.r) / params.chunkSize));
    var near = 0.0;

    var U = 0.0;

    for (var c2 = 0u; c2 < channels; c2++) {
        for (var cx = cxmin; cx <= cxmax; cx++) {
            for (var cy = cymin; cy <= cymax; cy++) {
                let c = findChunk(f32(c2), f32(cx), f32(cy));
                if c.x != 0xFFFFFFFFu {
                    for (var i = 0u; i < c.y; i++) {
                        let dx = x - chunks[c.x + i * 4u];
                        let dy = y - chunks[c.x + i * 4u + 1u];
                        let d = pow(dx, 2.0) + pow(dy, 2.0);
                        if d <= rs {
                            let rd = sqrt(d);
                            var vmax = 0.0;
                            let rings = u32(sim[rO + c1 * channels + c2]);
                            var k = 0.0;
                            for (var j = 0u; j < rings; j++) {
                                let k2 = c1 * channels * rings + c2 * rings + j;
                                k += (bell(rd / params.r, sim[k2], sim[sO + k2])) / f32(rings) * sim[mO + k2];
                            }
                            U += k;
                            // near += vmax;
                        }
                    }
                }
            }
        }
    }

    return U;
}

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    var o: VSOut;
    let p = pos[vid];
    o.pos = vec4(p, 0.0, 1.0);

    o.uv = p * 0.5 + vec2(0.5, 0.5);
    return o;
}

    @fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
    let p = fsc(in.uv.x, in.uv.y, params.camera.x, params.camera.y, params.camera.z, params.aspectRatio);
    let x = p.x;
    let y = p.y;

    var colour = vec3f(0.0);

    let gmO = simS.v1.x + simS.v1.y + simS.v1.z + simS.v1.w;
    let gsO = gmO + simS.v2;

    for (var channel = 0u; channel < u32(params.channels); channel++) {
        let g = clamp(growth(getNear(x, y, channel) / 50.0, sim[gmO + channel], sim[gsO + channel]), 0.0, 1.0);
        // let g = getNear(x, y, channel) * 50.0;

        colour += channelColours[channel] * g;
    }

    // let cell = floor(in.uv * params.grid);
    // let isDark = u32(cell.x) + u32(cell.y);
    // let c0 = vec3(0.1, 0.1, 0.1);
    // let c1 = vec3(0.9, 0.9, 0.9);
    // let color = select(c1, c0, (isDark & 1u) == 1u);
    return vec4(colour, 1.0);
}
