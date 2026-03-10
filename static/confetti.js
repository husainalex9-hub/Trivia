const Confetti = {
  canvas: null,
  ctx: null,
  particles: [],
  running: false,
  animFrame: null,

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  start() {
    if (!this.canvas) return;
    this.particles = [];
    this.running = true;

    const colors = ["#667eea", "#f093fb", "#4facfe", "#43e97b", "#f6d365", "#a18cd1", "#ffd700", "#f5576c", "#00f2fe"];

    // Create 150 particles
    for (let i = 0; i < 150; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * -this.canvas.height,
        w: 5 + Math.random() * 7,
        h: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 4,
        rotation: Math.random() * 360,
        spin: (Math.random() - 0.5) * 10,
      });
    }

    this.animate();

    // Auto-stop after 5 seconds
    setTimeout(() => this.stop(), 5000);
  },

  animate() {
    if (!this.running) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles = this.particles.filter(p => p.y < this.canvas.height + 20);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.rotation += p.spin;

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animFrame = requestAnimationFrame(() => this.animate());
    } else {
      this.stop();
    }
  },

  stop() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },
};
