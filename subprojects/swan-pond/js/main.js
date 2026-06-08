const canvas = document.querySelector("#pondCanvas");
const ctx = canvas.getContext("2d");

const ASSET_ROOT = "assets/pond_game_assets";
const WORLD = { w: 1672, h: 941 };
const WATER_BOX = { x: 35, y: 50, w: 1085, h: 845 };

const SWANS = [
  { file: "dev_v3/sprites/swans/swan_01.png", cx: 811.5, cy: 187.5, angle: Math.PI, speed: 38, phase: 0 },
  { file: "dev_v3/sprites/swans/swan_02.png", cx: 882, cy: 294, angle: Math.PI + 0.08, speed: 41, phase: 1.7 },
  { file: "dev_v3/sprites/swans/swan_03.png", cx: 843, cy: 435, angle: Math.PI - 0.32, speed: 44, phase: 3.4 },
  { file: "dev_v3/sprites/swans/swan_04.png", cx: 912, cy: 424, angle: Math.PI + 0.22, speed: 47, phase: 5.1 },
];

const REEDS = [
  {
    file: "reeds_and_shadows/reeds/reed_01.png",
    shadowFile: "reeds_and_shadows/shadows/reed_01_shadow.png",
    x: 55,
    y: 42,
    w: 99,
    h: 124,
    shadowX: 104,
    shadowY: 132,
    shadowW: 32,
    shadowH: 16,
    originX: 0.42,
    originY: 0.98,
    amp: 3.8,
    phase: 0.2,
  },
  {
    file: "reeds_and_shadows/reeds/reed_02.png",
    shadowFile: "reeds_and_shadows/shadows/reed_02_shadow.png",
    x: 64,
    y: 605,
    w: 49,
    h: 95,
    shadowX: 71,
    shadowY: 630,
    shadowW: 27,
    shadowH: 37,
    originX: 0.36,
    originY: 0.98,
    amp: 3.2,
    phase: 1.4,
  },
  {
    file: "reeds_and_shadows/reeds/reed_03.png",
    shadowFile: "reeds_and_shadows/shadows/reed_03_shadow.png",
    x: 52,
    y: 724,
    w: 98,
    h: 169,
    shadowX: 69,
    shadowY: 724,
    shadowW: 57,
    shadowH: 152,
    originX: 0.36,
    originY: 0.98,
    amp: 4.1,
    phase: 2.3,
  },
  {
    file: "reeds_and_shadows/reeds/reed_04.png",
    shadowFile: "reeds_and_shadows/shadows/reed_04_shadow.png",
    x: 383,
    y: 796,
    w: 109,
    h: 105,
    shadowX: 380,
    shadowY: 814,
    shadowW: 114,
    shadowH: 70,
    originX: 0.44,
    originY: 0.98,
    amp: 3.4,
    phase: 3.2,
  },
  {
    file: "reeds_and_shadows/reeds/reed_05.png",
    shadowFile: "reeds_and_shadows/shadows/reed_05_shadow.png",
    x: 684,
    y: 793,
    w: 110,
    h: 109,
    shadowX: 697,
    shadowY: 818,
    shadowW: 86,
    shadowH: 64,
    originX: 0.46,
    originY: 0.98,
    amp: 3.1,
    phase: 4.4,
  },
];

let dpr = 1;
let view = { w: 0, h: 0, scale: 1, ox: 0, oy: 0 };
let last = performance.now();
let images = new Map();
let swans = [];
let ripples = [];
let backgroundImage = null;
let isReady = false;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function boot() {
  const files = new Set([
    "art_preserve/backgrounds/background_clean_base.png",
    ...SWANS.map((swan) => swan.file),
    ...REEDS.map((reed) => reed.file),
    ...REEDS.map((reed) => reed.shadowFile),
  ]);

  await Promise.all(
    [...files].map(async (file) => {
      images.set(file, await loadImage(`${ASSET_ROOT}/${file}`));
    }),
  );

  backgroundImage = images.get("art_preserve/backgrounds/background_clean_base.png");

  REEDS.forEach((reed) => {
    reed.img = images.get(reed.file);
    reed.shadowImg = images.get(reed.shadowFile);
  });

  swans = SWANS.map((swan) => {
    const img = images.get(swan.file);
    return {
      ...swan,
      img,
      x: swan.cx,
      y: swan.cy,
      tx: swan.cx,
      ty: swan.cy,
      homeX: swan.cx,
      homeY: swan.cy,
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
      targetAngle: swan.angle,
      idleTimer: 0.8 + swan.phase * 0.2,
    };
  });

  isReady = true;
  requestAnimationFrame(tick);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.w = rect.width;
  view.h = rect.height;
  view.scale = Math.max(rect.width / WORLD.w, rect.height / WORLD.h);
  view.ox = (rect.width - WORLD.w * view.scale) / 2;
  view.oy = (rect.height - WORLD.h * view.scale) / 2;
}

function toWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.ox) / view.scale,
    y: (event.clientY - rect.top - view.oy) / view.scale,
  };
}

function isWaterPoint(point) {
  return (
    point.x >= WATER_BOX.x + 18 &&
    point.x <= WATER_BOX.x + WATER_BOX.w - 40 &&
    point.y >= WATER_BOX.y + 18 &&
    point.y <= WATER_BOX.y + WATER_BOX.h - 26
  );
}

function addRipple(x, y, strength = 1) {
  ripples.push({ x, y, age: 0, life: 1.75, strength });
}

function sendSwansTo(x, y) {
  swans.forEach((swan, index) => {
    const angle = (Math.PI * 2 * index) / swans.length + (Math.random() - 0.5) * 0.65;
    const radius = 26 + Math.random() * 58;
    swan.tx = clamp(x + Math.cos(angle) * radius, 112, 1010);
    swan.ty = clamp(y + Math.sin(angle) * radius, 112, 745);
    swan.idleTimer = 2.4 + Math.random() * 1.2;
  });
}

canvas.addEventListener("pointerdown", (event) => {
  if (!isReady) return;
  const p = toWorld(event);
  if (!isWaterPoint(p)) return;
  addRipple(p.x, p.y, 1.15);
  sendSwansTo(p.x, p.y);
});

function drawMovingWater(t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(WATER_BOX.x, WATER_BOX.y, WATER_BOX.w, WATER_BOX.h);
  ctx.clip();

  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.1;
  for (let y = 74; y < 845; y += 25) {
    ctx.beginPath();
    for (let x = 58; x < 1110; x += 12) {
      const wave = Math.sin(x * 0.02 + t * 0.0019 + y * 0.015) * 2.1;
      if (x === 58) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 18; i += 1) {
    const y = 90 + i * 42;
    const x = 150 + Math.sin(t * 0.001 + i) * 18;
    const radius = 90 + Math.sin(t * 0.0016 + i) * 16;
    const g = ctx.createRadialGradient(x + i * 42, y, 0, x + i * 42, y, radius);
    g.addColorStop(0, "rgba(255,255,255,0.24)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + i * 42, y, radius * 1.4, radius * 0.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawReedShadows(t) {
  REEDS.forEach((reed) => {
    const drift = Math.sin(t * 0.0012 + reed.phase) * 0.8;
    ctx.save();
    ctx.globalAlpha = 0.84;
    ctx.drawImage(reed.shadowImg, reed.shadowX + drift, reed.shadowY, reed.shadowW, reed.shadowH);
    ctx.restore();
  });
}

function drawReeds(t) {
  REEDS.forEach((reed) => {
    const ox = reed.x + reed.w * reed.originX;
    const oy = reed.y + reed.h * reed.originY;
    const sway = Math.sin(t * 0.0018 + reed.phase) * reed.amp * (Math.PI / 180);
    const lean = Math.sin(t * 0.0012 + reed.phase * 1.7) * 1.8;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(sway);
    ctx.drawImage(reed.img, reed.x - ox + lean, reed.y - oy, reed.w, reed.h);
    ctx.restore();
  });
}

function updateSwans(dt, t) {
  swans.forEach((swan, index) => {
    swan.idleTimer -= dt;
    const target = { x: swan.tx, y: swan.ty };
    if (swan.idleTimer <= 0 && distance(swan, target) < 12) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 46 + Math.random() * 130;
      const homeBias = Math.random() < 0.55 ? 0.45 : 0;
      swan.tx = clamp(swan.x + Math.cos(angle) * radius + (swan.homeX - swan.x) * homeBias, 650, 1010);
      swan.ty = clamp(swan.y + Math.sin(angle) * radius + (swan.homeY - swan.y) * homeBias, 120, 610);
      swan.idleTimer = 1.1 + Math.random() * 2.4;
    }

    const dx = swan.tx - swan.x;
    const dy = swan.ty - swan.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const step = Math.min(d, swan.speed * dt);
      swan.x += (dx / d) * step;
      swan.y += (dy / d) * step;
      swan.targetAngle = Math.atan2(dy, dx) - Math.PI / 2;
    }

    swan.x += Math.sin(t * 0.0015 + swan.phase + index) * 0.09;
    swan.y += Math.cos(t * 0.0012 + swan.phase) * 0.09;
    let delta = swan.targetAngle - swan.angle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    swan.angle += delta * Math.min(1, dt * 4.2);
  });
}

function drawSwan(swan, t) {
  const bob = Math.sin(t * 0.004 + swan.phase) * 1.4;
  ctx.save();
  ctx.translate(swan.x, swan.y + bob);
  ctx.rotate(swan.angle);
  ctx.drawImage(swan.img, -swan.w / 2, -swan.h / 2, swan.w, swan.h);

  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.arc(i * 13, swan.h * 0.17, 22 + Math.abs(i) * 8, 0.18, 1.04);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const ripple = ripples[i];
    ripple.age += dt;
    const p = ripple.age / ripple.life;
    if (p >= 1) {
      ripples.splice(i, 1);
      continue;
    }

    for (let ring = 0; ring < 3; ring += 1) {
      const radius = (p * 92 + ring * 18) * ripple.strength;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * (0.38 - ring * 0.08)})`;
      ctx.lineWidth = 2 - ring * 0.36;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, radius * 1.16, radius * 0.72, 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function draw(t, dt) {
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.scale, view.scale);

  ctx.drawImage(backgroundImage, 0, 0, WORLD.w, WORLD.h);
  drawMovingWater(t);
  drawRipples(dt);
  drawReedShadows(t);
  drawReeds(t);
  updateSwans(dt, t);
  swans.slice().sort((a, b) => a.y - b.y).forEach((swan) => drawSwan(swan, t));

  ctx.restore();
}

function tick(now) {
  const dt = Math.min(0.032, (now - last) / 1000);
  last = now;
  if (isReady) draw(now, dt);
  requestAnimationFrame(tick);
}

resize();
window.addEventListener("resize", resize);
boot().catch((error) => {
  console.error("Failed to load pond assets", error);
});
