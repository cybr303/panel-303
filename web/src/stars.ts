// Subtle starfield on a canvas, behind everything. Static when reduced motion is requested.
export function startStars(c: HTMLCanvasElement) {
  const x = c.getContext("2d");
  if (!x) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars: { x: number; y: number; r: number; a: number; p: number }[] = [];
  let w = 0, h = 0;

  function size() {
    const d = devicePixelRatio || 1;
    w = innerWidth; h = innerHeight;
    c.width = w * d; c.height = h * d;
    x!.setTransform(d, 0, 0, d, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 5200) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.15, p: Math.random() * 6.28,
    }));
    draw(0);
  }
  function draw(t: number) {
    x!.clearRect(0, 0, w, h);
    const g = x!.createRadialGradient(w * 0.5, -80, 0, w * 0.5, -80, w * 0.9);
    g.addColorStop(0, "rgba(47,111,228,.16)");
    g.addColorStop(1, "rgba(47,111,228,0)");
    x!.fillStyle = g;
    x!.fillRect(0, 0, w, h);
    for (const s of stars) {
      const a = reduce ? s.a : s.a * (0.65 + 0.35 * Math.sin(t / 1400 + s.p));
      x!.fillStyle = `rgba(190,215,255,${a})`;
      x!.beginPath();
      x!.arc(s.x, s.y, s.r, 0, 6.283);
      x!.fill();
    }
  }
  size();
  addEventListener("resize", size);
  if (!reduce) {
    let last = 0;
    const loop = (t: number) => {
      // ~20 fps is plenty for twinkling and saves battery
      if (t - last > 50 && !document.hidden) { draw(t); last = t; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
