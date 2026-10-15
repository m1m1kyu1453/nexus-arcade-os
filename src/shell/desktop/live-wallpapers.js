// @ts-check
// Live wallpapers drawn on a 2D canvas. Each takes the theme colors and returns
// { draw(t, dt), resize(w, h), pointer(x, y) }. `draw` with dt = 0 renders a still frame
// (used for reduced motion / battery saver).

/**
 * @typedef {object} Live
 * @property {(t: number, dt: number) => void} draw
 * @property {(w: number, h: number) => void} resize
 * @property {(x: number, y: number) => void} [pointer]
 */

/** @typedef {{ accent: string, accent2: string, bg: string }} Palette */

/** @param {string} hex @param {number} a */
const rgba = (hex, a) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Deterministic random so still frames look the same each time. @param {number} seed */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** @type {Record<string, (ctx: CanvasRenderingContext2D, p: Palette) => Live>} */
export const LIVE_WALLPAPERS = {
  particles(ctx, p) {
    /** @type {{ x: number, y: number, vx: number, vy: number }[]} */
    let pts = [];
    let w = 0;
    let h = 0;
    let mouse = { x: -1e4, y: -1e4 };
    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
        const r = rng(7);
        const count = Math.max(24, Math.min(140, Math.round((w * h) / 11000)));
        pts = Array.from({ length: count }, () => ({
          x: r() * w,
          y: r() * h,
          vx: (r() - 0.5) * 0.3,
          vy: (r() - 0.5) * 0.3,
        }));
      },
      pointer(x, y) {
        mouse = { x, y };
      },
      draw(_t, dt) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
        const step = dt / 16;
        for (const q of pts) {
          q.x += q.vx * step;
          q.y += q.vy * step;
          if (q.x < 0 || q.x > w) q.vx *= -1;
          if (q.y < 0 || q.y > h) q.vy *= -1;
          // Gentle pull towards the cursor.
          const dx = mouse.x - q.x;
          const dy = mouse.y - q.y;
          const d = Math.hypot(dx, dy);
          if (d < 180 && d > 1) {
            q.x += (dx / d) * 0.25 * step;
            q.y += (dy / d) * 0.25 * step;
          }
        }
        const max = 130;
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          for (let j = i + 1; j < pts.length; j++) {
            const b = pts[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < max) {
              ctx.strokeStyle = rgba(p.accent, 0.35 * (1 - d / max));
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
          if (dm < 180) {
            ctx.strokeStyle = rgba(p.accent2, 0.5 * (1 - dm / 180));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
          ctx.fillStyle = rgba(p.accent, 0.85);
          ctx.beginPath();
          ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  },

  aurora(ctx, p) {
    let w = 0;
    let h = 0;
    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
      },
      draw(t) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const time = t / 9000;
        const bands = [p.accent, p.accent2, p.accent];
        bands.forEach((color, i) => {
          const g = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.8);
          g.addColorStop(0, rgba(color, 0));
          g.addColorStop(0.5, rgba(color, 0.22));
          g.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 16) {
            const y =
              h * (0.35 + i * 0.08) +
              Math.sin(x / (220 + i * 60) + time * (1 + i * 0.4)) * h * 0.08 +
              Math.sin(x / 90 + time * 2.3 + i) * h * 0.02;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },

  synthwave(ctx, p) {
    let w = 0;
    let h = 0;
    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
      },
      draw(t) {
        const horizon = h * 0.55;
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, p.bg);
        sky.addColorStop(1, rgba(p.accent2, 0.35));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, horizon);
        // Sun with horizontal cuts.
        const r = Math.min(w, h) * 0.18;
        const sun = ctx.createLinearGradient(0, horizon - r * 2, 0, horizon);
        sun.addColorStop(0, '#ffd166');
        sun.addColorStop(1, p.accent2);
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(w / 2, horizon, r * 1.2, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = p.bg;
        for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 - r * 1.3, horizon - r * 0.12 * (i * 1.6 + 1), r * 2.6, 2 + i);
        // Ground and scrolling perspective grid.
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, horizon, w, h - horizon);
        ctx.strokeStyle = rgba(p.accent, 0.75);
        ctx.lineWidth = 1.2;
        ctx.shadowColor = p.accent;
        ctx.shadowBlur = 8;
        const offset = (t / 1600) % 1;
        for (let i = 0; i < 18; i++) {
          const z = (i + offset) / 18;
          const y = horizon + (h - horizon) * z * z;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let i = -20; i <= 20; i++) {
          ctx.beginPath();
          ctx.moveTo(w / 2 + i * 6, horizon);
          ctx.lineTo(w / 2 + i * (w / 14), h);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      },
    };
  },

  matrix(ctx, p) {
    let w = 0;
    let h = 0;
    const size = 16;
    /** @type {number[]} */
    let drops = [];
    const glyphs = 'アカサタナハマヤラワ0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃ';
    const r = rng(3);
    let acc = 0;
    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
        drops = Array.from({ length: Math.ceil(w / size) }, () => Math.floor(r() * (h / size)));
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
      },
      draw(_t, dt) {
        acc += dt;
        if (dt && acc < 50) return; // ~20 steps per second
        acc = 0;
        ctx.fillStyle = rgba(p.bg, dt ? 0.12 : 1);
        ctx.fillRect(0, 0, w, h);
        ctx.font = `${size}px "JetBrains Mono Variable", monospace`;
        const steps = dt ? 1 : 30;
        for (let s = 0; s < steps; s++) {
          drops.forEach((y, i) => {
            ctx.fillStyle = r() > 0.97 ? '#ffffff' : rgba(p.accent, 0.85);
            ctx.fillText(glyphs[Math.floor(r() * glyphs.length)], i * size, y * size);
            drops[i] = y * size > h && r() > 0.975 ? 0 : y + 1;
          });
        }
      },
    };
  },

  starfield(ctx, p) {
    let w = 0;
    let h = 0;
    /** @type {{ x: number, y: number, z: number }[]} */
    let stars = [];
    const r = rng(11);
    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
        stars = Array.from({ length: 420 }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: r() }));
      },
      draw(_t, dt) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
        const speed = dt * 0.00012;
        for (const s of stars) {
          s.z -= speed;
          if (s.z <= 0.01) {
            s.x = r() * 2 - 1;
            s.y = r() * 2 - 1;
            s.z = 1;
          }
          const sx = w / 2 + (s.x / s.z) * w * 0.5;
          const sy = h / 2 + (s.y / s.z) * h * 0.5;
          if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
          const size = (1 - s.z) * 2.4;
          ctx.fillStyle = s.z < 0.3 ? rgba(p.accent, 1 - s.z) : rgba('#ffffff', 1 - s.z);
          ctx.fillRect(sx, sy, size, size);
        }
      },
    };
  },

  fluid(ctx, p) {
    let w = 0;
    let h = 0;
    const blobs = [p.accent, p.accent2, p.accent, p.accent2];
    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
      },
      draw(t) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
        const time = t / 14000;
        blobs.forEach((color, i) => {
          const x = w * (0.5 + 0.38 * Math.sin(time * (0.7 + i * 0.23) + i * 1.7));
          const y = h * (0.5 + 0.36 * Math.cos(time * (0.5 + i * 0.31) + i));
          const r = Math.max(w, h) * (0.35 + 0.08 * Math.sin(time + i));
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(color, 0.32));
          g.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        });
      },
    };
  },
};

/** Built-in static gradient wallpapers (generated, no image files). */
export const GRADIENTS = /** @type {Record<string, string>} */ ({
  nebula:
    'radial-gradient(60% 80% at 20% 20%, #4c1d95 0%, transparent 60%), radial-gradient(60% 70% at 85% 80%, #0e7490 0%, transparent 60%), #05060d',
  sunset: 'linear-gradient(160deg, #1e1b4b 0%, #7e22ce 45%, #f97316 100%)',
  ocean:
    'radial-gradient(80% 60% at 50% 110%, #0ea5e9 0%, transparent 60%), linear-gradient(180deg, #020617 0%, #0c4a6e 100%)',
  mint: 'linear-gradient(135deg, #064e3b 0%, #10b981 55%, #a7f3d0 100%)',
  ember:
    'radial-gradient(70% 60% at 30% 70%, #b91c1c 0%, transparent 60%), radial-gradient(50% 50% at 75% 30%, #f59e0b 0%, transparent 60%), #0d0705',
  dawn: 'linear-gradient(180deg, #e0f2fe 0%, #fbcfe8 55%, #fde68a 100%)',
  paper: 'radial-gradient(120% 90% at 50% 0%, #fffdf8 0%, #f0e9dc 70%, #e7dece 100%)',
  graphite: 'linear-gradient(145deg, #111827 0%, #1f2937 50%, #0b0f19 100%)',
});
