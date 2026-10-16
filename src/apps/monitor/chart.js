// @ts-check
// A small live line chart on a canvas (FPS, frame time, memory). Colours come from the theme;
// it redraws on resize and keeps the last `capacity` samples.

/**
 * @param {{ label: string, max?: number, capacity?: number, color: () => string, format: (v: number) => string }} options
 */
export function createChart({ label, max, capacity = 60, color, format }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'nx-mon-chart';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  /** @type {number[]} */
  let samples = [];

  function draw() {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const top = Math.max(max ?? 0, ...samples, 1);
    // Grid lines at 25 %, 50 %, 75 %.
    const styles = getComputedStyle(canvas);
    g.strokeStyle = styles.getPropertyValue('--border') || 'rgba(128,128,128,0.3)';
    g.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75]) {
      g.beginPath();
      g.moveTo(0, Math.round(h * f) + 0.5);
      g.lineTo(w, Math.round(h * f) + 0.5);
      g.stroke();
    }
    if (samples.length < 2) return;
    const step = w / (capacity - 1);
    const x0 = w - (samples.length - 1) * step;
    const y = (/** @type {number} */ v) => h - 4 - (v / top) * (h - 8);
    const stroke = color();
    g.beginPath();
    samples.forEach((v, i) => (i ? g.lineTo(x0 + i * step, y(v)) : g.moveTo(x0, y(v))));
    g.strokeStyle = stroke;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();
    // Soft fill under the line.
    g.lineTo(w, h);
    g.lineTo(x0, h);
    g.closePath();
    g.globalAlpha = 0.15;
    g.fillStyle = stroke;
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = styles.getPropertyValue('--text-3') || '#888';
    g.font = '11px sans-serif';
    g.fillText(format(top), 4, 12);
  }

  return {
    el: canvas,
    /** @param {number} value */
    push(value) {
      samples = [...samples, value].slice(-capacity);
      canvas.setAttribute('aria-label', `${label}: ${format(value)}`);
      draw();
    },
    redraw: draw,
  };
}
