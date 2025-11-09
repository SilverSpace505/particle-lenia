export const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (event: KeyboardEvent) => {
  keys[event.code] = true;
});

window.addEventListener('keyup', (event: KeyboardEvent) => {
  delete keys[event.code];
});

export const mouse = { x: 0, y: 0, down: false };

export function bindMouse(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  canvas.addEventListener('pointerdown', (event: MouseEvent) => {
    mouse.down = true;
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerup', (event: MouseEvent) => {
    mouse.down = false;
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointermove', (event: MouseEvent) => {
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
}
