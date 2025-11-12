import utils from './utils';

export type Particle = [number, number, number, number];

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const displayNames = [
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
export type DisplayName = (typeof displayNames)[number];

export const displayCategories: Record<string, DisplayName[]> = {
  General: ['fps', 'tps'],
  Performance: ['ticktime', 'cputime', 'gputime'],
  Simulation: ['particles', 'chunks', 'pixels'],
  Tests: [
    'simTime',
    'allTime',
    'tests',
    'force',
    'velocity',
    'longest',
    'saves',
  ],
};

export const channels = 5;

export const channelColours: [number, number, number][] = [];
for (let i = 0; i < channels; i++) {
  const c = utils.hslaToRgba(i / channels, 1, 0.5, 1);
  channelColours.push([c[0], c[1], c[2]]);
}

const state = {
  totalForce: 0,
};

export default state;
