/*
  Web Swing: Rooftop Run
  - Left Click: shoot swing web (attach to building)
  - Right Click or X: detach web
  - A/D: pump swing
  - Space: jump
  - F or Middle Click: shoot web bolt to defeat enemies
  - R: restart
*/

(function () {
  "use strict";

  // ------------------------------
  // Utility Math
  // ------------------------------
  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function length(x, y) {
    return Math.hypot(x, y);
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, len };
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  function lineIntersect(p, r, q, s) {
    // Solve p + t r = q + u s
    const rxs = r.x * s.y - r.y * s.x;
    const q_p = { x: q.x - p.x, y: q.y - p.y };
    const qpxr = q_p.x * r.y - q_p.y * r.x;

    if (Math.abs(rxs) < 1e-8) {
      return null; // parallel or collinear; ignore for simplicity
    }
    const t = (q_p.x * s.y - q_p.y * s.x) / rxs;
    const u = qpxr / rxs;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: p.x + t * r.x, y: p.y + t * r.y, t };
    }
    return null;
  }

  function segmentRectIntersection(segStart, segEnd, rect) {
    const dir = { x: segEnd.x - segStart.x, y: segEnd.y - segStart.y };
    const edges = [
      // top
      { a: { x: rect.x, y: rect.y }, b: { x: rect.x + rect.w, y: rect.y } },
      // right
      { a: { x: rect.x + rect.w, y: rect.y }, b: { x: rect.x + rect.w, y: rect.y + rect.h } },
      // bottom
      { a: { x: rect.x + rect.w, y: rect.y + rect.h }, b: { x: rect.x, y: rect.y + rect.h } },
      // left
      { a: { x: rect.x, y: rect.y + rect.h }, b: { x: rect.x, y: rect.y } },
    ];

    let closest = null;
    for (const edge of edges) {
      const r = { x: edge.b.x - edge.a.x, y: edge.b.y - edge.a.y };
      const hit = lineIntersect(segStart, dir, edge.a, r);
      if (hit) {
        if (!closest || hit.t < closest.t) closest = hit;
      }
    }
    return closest;
  }

  // ------------------------------
  // Game Constants
  // ------------------------------
  const WORLD = {
    gravity: 2200, // px/s^2
    groundY: 680, // world ground baseline
    maxRopeLength: 520,
    minRopeLength: 80,
    playerRadius: 14,
    playerMaxSpeed: 1600,
    playerAirAccel: 2000,
    ropePumpAccel: 1800,
    webBoltSpeed: 1400,
    webBoltCooldownMs: 250,
    enemySpeed: 80,
  };

  // ------------------------------
  // Canvas Setup
  // ------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ------------------------------
  // Input
  // ------------------------------
  const keys = new Set();
  let mouse = { x: 0, y: 0, left: false, middle: false, right: false };

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.key.toLowerCase());
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  window.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouse.left = true;
    if (e.button === 1) mouse.middle = true;
    if (e.button === 2) mouse.right = true;
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 1) mouse.middle = false;
    if (e.button === 2) mouse.right = false;
  });

  // ------------------------------
  // World Generation
  // ------------------------------
  function generateBuildings(viewWidth) {
    const buildings = [];
    const baseY = WORLD.groundY;
    const num = 8;
    let x = 80;

    for (let i = 0; i < num; i++) {
      const w = 120 + Math.random() * 120;
      const gap = 140 + Math.random() * 220;
      const h = 180 + Math.random() * 260;
      buildings.push({ x, y: baseY - h, w, h });
      x += w + gap;
    }
    return buildings;
  }

  function placeEnemies(buildings) {
    const enemies = [];
    for (const b of buildings) {
      if (Math.random() < 0.7) {
        const count = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const minX = b.x + 12;
          const maxX = b.x + b.w - 12;
          const startX = minX + Math.random() * (maxX - minX);
          const patrolMin = minX + Math.random() * (b.w * 0.25);
          const patrolMax = maxX - Math.random() * (b.w * 0.25);
          enemies.push({
            x: startX,
            y: b.y - 10, // sit slightly above roof
            w: 18,
            h: 26,
            dir: Math.random() < 0.5 ? -1 : 1,
            minX: Math.min(patrolMin, patrolMax),
            maxX: Math.max(patrolMin, patrolMax),
            alive: true,
          });
        }
      }
    }
    return enemies;
  }

  // ------------------------------
  // Game State
  // ------------------------------
  const game = {
    buildings: generateBuildings(window.innerWidth + 800),
    enemies: [],
    projectiles: [],
    player: {
      x: 120,
      y: WORLD.groundY - 340,
      vx: 0,
      vy: 0,
      onGround: false,
      rope: {
        attached: false,
        anchorX: 0,
        anchorY: 0,
        length: 0,
      },
      canShootAtMs: 0,
    },
    cameraX: 0,
    won: false,
    lost: false,
  };
  game.enemies = placeEnemies(game.buildings);

  const killsEl = document.getElementById("kills");
  const statusEl = document.getElementById("status");
  function updateHud() {
    const total = game.enemies.length;
    const alive = game.enemies.filter((e) => e.alive).length;
    const killed = total - alive;
    killsEl.textContent = `Kills: ${killed} / ${total}`;

    if (alive === 0 && !game.won) {
      game.won = true;
      statusEl.textContent = "All enemies eliminated! You win. Press R to restart.";
    } else if (!game.won) {
      statusEl.textContent = "";
    }
  }
  updateHud();

  function resetGame() {
    game.buildings = generateBuildings(window.innerWidth + 800);
    game.enemies = placeEnemies(game.buildings);
    game.projectiles = [];
    Object.assign(game.player, {
      x: 120,
      y: WORLD.groundY - 340,
      vx: 0,
      vy: 0,
      onGround: false,
      rope: { attached: false, anchorX: 0, anchorY: 0, length: 0 },
      canShootAtMs: 0,
    });
    game.cameraX = 0;
    game.won = false;
    game.lost = false;
    updateHud();
  }

  // ------------------------------
  // Mechanics
  // ------------------------------
  function tryAttachRope() {
    const start = { x: game.player.x, y: game.player.y };
    const end = { x: mouse.x + game.cameraX, y: mouse.y };

    let bestHit = null;
    for (const b of game.buildings) {
      const hit = segmentRectIntersection(start, end, b);
      if (hit) {
        const dist = Math.hypot(hit.x - start.x, hit.y - start.y);
        if (dist <= WORLD.maxRopeLength) {
          if (!bestHit || dist < bestHit.dist) bestHit = { ...hit, dist };
        }
      }
    }

    if (bestHit) {
      const length = clamp(bestHit.dist, WORLD.minRopeLength, WORLD.maxRopeLength);
      game.player.rope.attached = true;
      game.player.rope.anchorX = bestHit.x;
      game.player.rope.anchorY = bestHit.y;
      game.player.rope.length = length;
    }
  }

  function detachRope() {
    game.player.rope.attached = false;
  }

  function shootWebBolt() {
    const now = performance.now();
    if (now < game.player.canShootAtMs) return;
    game.player.canShootAtMs = now + WORLD.webBoltCooldownMs;

    const aimX = mouse.x + game.cameraX;
    const aimY = mouse.y;
    const dir = normalize(aimX - game.player.x, aimY - game.player.y);
    game.projectiles.push({
      x: game.player.x,
      y: game.player.y,
      vx: dir.x * WORLD.webBoltSpeed,
      vy: dir.y * WORLD.webBoltSpeed,
      life: 1.2,
      radius: 4,
    });
  }

  function resolveGroundAndRoofCollisions() {
    const p = game.player;
    p.onGround = false;

    // Ground baseline
    if (p.y + WORLD.playerRadius > WORLD.groundY) {
      p.y = WORLD.groundY - WORLD.playerRadius;
      if (p.vy > 0) p.vy = 0;
      p.onGround = true;
    }

    // Building tops only (simple)
    for (const b of game.buildings) {
      const top = b.y;
      const left = b.x;
      const right = b.x + b.w;

      // From above, land on roof
      const isWithinX = p.x > left && p.x < right;
      const isAboveRoof = p.y + WORLD.playerRadius > top && p.y + WORLD.playerRadius < top + 24;
      const isFalling = p.vy >= 0;

      if (isWithinX && isAboveRoof && isFalling) {
        p.y = top - WORLD.playerRadius;
        p.vy = 0;
        p.onGround = true;
      }

      // Crude side push out to prevent clipping into building sides
      const isWithinY = p.y > top && p.y < top + b.h;
      if (isWithinY) {
        if (p.x + WORLD.playerRadius > left && p.x < left && p.vx > 0) {
          p.x = left - WORLD.playerRadius;
          p.vx = 0;
        } else if (p.x - WORLD.playerRadius < right && p.x > right && p.vx < 0) {
          p.x = right + WORLD.playerRadius;
          p.vx = 0;
        }
      }
    }
  }

  function applyRopeConstraint(dt) {
    const p = game.player;
    if (!p.rope.attached) return;

    const dx = p.x - p.rope.anchorX;
    const dy = p.y - p.rope.anchorY;
    let dist = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / dist, y: dy / dist };

    // Keep distance equal to rope length
    const targetX = p.rope.anchorX + dir.x * p.rope.length;
    const targetY = p.rope.anchorY + dir.y * p.rope.length;

    // Correct positional error
    const correctionX = targetX - p.x;
    const correctionY = targetY - p.y;
    p.x += correctionX;
    p.y += correctionY;

    // Remove radial velocity component (to keep length stable)
    const radialSpeed = dot(p.vx, p.vy, dir.x, dir.y);
    p.vx -= radialSpeed * dir.x;
    p.vy -= radialSpeed * dir.y;

    // Pumping controls: accelerate tangentially
    const tangential = { x: -dir.y, y: dir.x };
    let input = 0;
    if (keys.has("a")) input -= 1;
    if (keys.has("d")) input += 1;
    if (input !== 0) {
      const accel = WORLD.ropePumpAccel * input;
      p.vx += tangential.x * accel * dt;
      p.vy += tangential.y * accel * dt;
    }
  }

  function updateProjectiles(dt) {
    for (const pr of game.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
    }
    // Remove expired
    game.projectiles = game.projectiles.filter((p) => p.life > 0);

    // Collide with buildings
    for (const pr of game.projectiles) {
      for (const b of game.buildings) {
        if (pr.x > b.x && pr.x < b.x + b.w && pr.y > b.y && pr.y < b.y + b.h) {
          pr.life = 0; // stop at wall
          break;
        }
      }
    }

    // Collide with enemies
    for (const pr of game.projectiles) {
      if (pr.life <= 0) continue;
      for (const e of game.enemies) {
        if (!e.alive) continue;
        const withinX = pr.x > e.x - e.w / 2 && pr.x < e.x + e.w / 2;
        const withinY = pr.y > e.y - e.h && pr.y < e.y;
        if (withinX && withinY) {
          e.alive = false;
          pr.life = 0;
          updateHud();
          break;
        }
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of game.enemies) {
      if (!e.alive) continue;
      e.x += e.dir * WORLD.enemySpeed * dt;
      if (e.x < e.minX) {
        e.x = e.minX;
        e.dir = 1;
      } else if (e.x > e.maxX) {
        e.x = e.maxX;
        e.dir = -1;
      }
    }
  }

  function handleInput(dt) {
    const p = game.player;

    // Shoot
    if (keys.has("f") || mouse.middle) {
      shootWebBolt();
      mouse.middle = false;
    }

    // Attach / Detach
    if (mouse.left) {
      tryAttachRope();
      mouse.left = false; // single-shot on click
    }
    if (mouse.right || keys.has("x")) {
      detachRope();
      mouse.right = false;
    }

    // Jump
    if (keys.has(" ") || keys.has("space")) {
      if (p.onGround) {
        p.vy = -680;
        p.onGround = false;
      }
    }

    // Air control when not on rope
    if (!p.rope.attached) {
      let ax = 0;
      if (keys.has("a")) ax -= WORLD.playerAirAccel;
      if (keys.has("d")) ax += WORLD.playerAirAccel;
      p.vx += ax * dt;
      p.vx = clamp(p.vx, -WORLD.playerMaxSpeed, WORLD.playerMaxSpeed);
    }
  }

  function updateCamera() {
    const target = game.player.x - window.innerWidth * 0.35;
    const stiffness = 0.12;
    game.cameraX += (target - game.cameraX) * stiffness;
    game.cameraX = Math.max(0, game.cameraX);
  }

  // ------------------------------
  // Main Loop
  // ------------------------------
  let lastTime = performance.now();
  function frame(now) {
    const dtRaw = Math.min(1 / 30, (now - lastTime) / 1000);
    lastTime = now;

    // Fixed-step simulation for stability
    let accumulator = dtRaw;
    const fixedDt = 1 / 60;
    while (accumulator > fixedDt * 0.5) {
      step(fixedDt);
      accumulator -= fixedDt;
    }

    render();
    requestAnimationFrame(frame);
  }

  function step(dt) {
    handleInput(dt);

    // Gravity
    const p = game.player;
    p.vy += WORLD.gravity * dt;

    // Integrate
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Rope constraint and pump
    applyRopeConstraint(dt);

    // Collisions
    resolveGroundAndRoofCollisions();

    // Projectiles and enemies
    updateProjectiles(dt);
    updateEnemies(dt);

    // Camera
    updateCamera();
  }

  // ------------------------------
  // Rendering
  // ------------------------------
  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function worldToScreenX(x) {
    return x - game.cameraX;
  }

  function drawBackground() {
    // Stars
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "white";
    for (let i = 0; i < 48; i++) {
      const sx = (i * 137) % (window.innerWidth * 3) - (game.cameraX * 0.2) % (window.innerWidth * 3);
      const sy = ((i * 263) % 700) + 20;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.restore();
  }

  function drawBuildings() {
    for (const b of game.buildings) {
      const sx = worldToScreenX(b.x);
      ctx.fillStyle = "#1b2233";
      ctx.fillRect(sx, b.y, b.w, b.h);
      // Roof line
      ctx.fillStyle = "#2a3349";
      ctx.fillRect(sx, b.y - 4, b.w, 4);

      // Windows
      ctx.fillStyle = "#ffc34d22";
      const cols = Math.max(2, Math.floor(b.w / 40));
      const rows = Math.max(2, Math.floor(b.h / 60));
      const padX = b.w / (cols + 1);
      const padY = b.h / (rows + 2);
      for (let c = 1; c <= cols; c++) {
        for (let r = 1; r <= rows; r++) {
          const wx = sx + c * padX - 6;
          const wy = b.y + r * padY;
          ctx.fillRect(wx, wy, 12, 16);
        }
      }
    }

    // Ground
    ctx.fillStyle = "#101624";
    ctx.fillRect(0, WORLD.groundY, window.innerWidth, 500);
  }

  function drawRope() {
    const p = game.player;
    if (!p.rope.attached) return;
    ctx.strokeStyle = "#8cc0ff";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(worldToScreenX(p.rope.anchorX), p.rope.anchorY);
    ctx.lineTo(worldToScreenX(p.x), p.y);
    ctx.stroke();
  }

  function drawPlayer() {
    const p = game.player;
    const sx = worldToScreenX(p.x);

    // Body
    ctx.fillStyle = "#e9454e"; // suit
    ctx.beginPath();
    ctx.arc(sx, p.y, WORLD.playerRadius, 0, TAU);
    ctx.fill();

    // Mask eyes
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(sx - 5, p.y - 3, 4, 3, -0.2, 0, TAU);
    ctx.ellipse(sx + 5, p.y - 3, 4, 3, 0.2, 0, TAU);
    ctx.fill();
  }

  function drawEnemies() {
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const sx = worldToScreenX(e.x);
      ctx.fillStyle = "#57d39b";
      ctx.fillRect(sx - e.w / 2, e.y - e.h, e.w, e.h);
      // eyes
      ctx.fillStyle = "#0a0d16";
      ctx.fillRect(sx - 5, e.y - e.h + 6, 3, 3);
      ctx.fillRect(sx + 2, e.y - e.h + 6, 3, 3);
    }
  }

  function drawProjectiles() {
    ctx.fillStyle = "#8cc0ff";
    for (const pr of game.projectiles) {
      const sx = worldToScreenX(pr.x);
      ctx.beginPath();
      ctx.arc(sx, pr.y, pr.radius, 0, TAU);
      ctx.fill();
    }
  }

  function render() {
    clear();
    drawBackground();
    drawBuildings();
    drawRope();
    drawPlayer();
    drawEnemies();
    drawProjectiles();
  }

  // ------------------------------
  // Global Keys
  // ------------------------------
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === "r") {
      resetGame();
    }
  });

  // Start loop
  requestAnimationFrame(frame);
})();