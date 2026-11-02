// public/align-cover/align-cover.js
(function () {
  const container = document.getElementById('align-cover-canvas');
  if (!container) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  container.appendChild(canvas);

  const size = 800;
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.maxWidth = '800px';
  canvas.style.display = 'block';

  const safeMargin = 55;
  const groundY = size - 70;
  let isGrounded = true;
  let currentPattern = "GROUND EQUILIBRIUM";
  let blocks = [];

  const initDims = [
    [160, 85], [90, 160], [120, 120], [190, 75], [80, 150]
  ];

  class Block {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.rot = 0;
      this.vx = 0;
      this.vy = 0;
      this.vRot = 0;
      this.gravity = 0.48;
      this.bounce = -0.22;
      this.friction = 0.92;
      this.inLayout = false;
      this.targetX = x;
      this.targetY = y;
      this.targetRot = 0;
      this.hoverOffsetX = 0;
      this.hoverOffsetY = 0;
      this.seed = Math.random() * 1000;
      this.scaleAnim = 1.0;
      this.isAbsorbing = false;
      this.absorbTarget = null;
      this.holeD = 21.0;
    }

    startAbsorption(target) {
      this.isAbsorbing = true;
      this.absorbTarget = target;
    }

    toPhysicsGround(focusX) {
      this.inLayout = false;
      this.isAbsorbing = false;
      this.vx = (focusX - this.x) * 0.03 + (Math.random() * 4 - 2);
      this.vy = Math.random() * 3 + 1;
      this.vRot = Math.random() * 0.1 - 0.05;
    }

    setToTarget(tx, ty, trot) {
      this.inLayout = true;
      this.targetX = tx;
      this.targetY = ty;
      this.targetRot = trot;
    }

    getMaxCornerY() {
      const cosA = Math.cos(this.rot);
      const sinA = Math.sin(this.rot);
      const hw = this.w / 2.0;
      const hh = this.h / 2.0;
      const y1 = this.y + (-hw * sinA - hh * cosA);
      const y2 = this.y + ( hw * sinA - hh * cosA);
      const y3 = this.y + ( hw * sinA + hh * cosA);
      const y4 = this.y + (-hw * sinA + hh * cosA);
      return Math.max(y1, y2, y3, y4);
    }

    update(frameCount) {
      if (this.isAbsorbing) {
        if (this.absorbTarget) {
          this.x += (this.absorbTarget.x - this.x) * 0.15;
          this.y += (this.absorbTarget.y - this.y) * 0.15;
        }
        this.scaleAnim += (0.0 - this.scaleAnim) * 0.15;
        return;
      } else {
        this.scaleAnim += (1.0 - this.scaleAnim) * 0.12;
      }

      if (this.inLayout) {
        this.x += (this.targetX - this.x) * 0.10;
        this.y += (this.targetY - this.y) * 0.10;

        let diffRot = (this.targetRot - this.rot) % (Math.PI * 2);
        if (diffRot < -Math.PI) diffRot += Math.PI * 2;
        if (diffRot > Math.PI) diffRot -= Math.PI * 2;
        this.rot += diffRot * 0.10;

        const breathX = Math.sin(frameCount * 0.025 + this.seed) * 0.5;
        const breathY = Math.cos(frameCount * 0.02 + this.seed) * 0.5;
        this.x += breathX + this.hoverOffsetX;
        this.y += breathY + this.hoverOffsetY;
        this.hoverOffsetX *= 0.82;
        this.hoverOffsetY *= 0.82;
      } else {
        this.vy += this.gravity;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx;
        this.y += this.vy;
        this.rot += this.vRot;

        const hw = (this.w * this.scaleAnim) / 2.0;
        if (this.x - hw < safeMargin) { this.x = safeMargin + hw; this.vx *= this.bounce; }
        if (this.x + hw > size - safeMargin) { this.x = size - safeMargin - hw; this.vx *= this.bounce; }

        const lowestY = this.getMaxCornerY();
        if (lowestY >= groundY) {
          this.y -= (lowestY - groundY);
          this.vy = 0;
          this.vx *= 0.82;

          const targetEquilibrium = Math.round(this.rot / (Math.PI / 2)) * (Math.PI / 2);
          const torque = (targetEquilibrium - this.rot) * 0.18;
          this.vRot += torque;
          this.vRot *= 0.60;

          if (Math.abs(targetEquilibrium - this.rot) < 0.02 && Math.abs(this.vRot) < 0.01) {
            this.rot = targetEquilibrium;
            this.vRot = 0;
          }
        }
      }
    }

    display() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.scale(this.scaleAnim, this.scaleAnim);

      // 纯白主体 + 3px 黑描边
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0a0a0c';
      ctx.lineWidth = 3.0;
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);

      // 左上角镂空圆孔
      const cornerX = -this.w / 2.0 + 18;
      const cornerY = -this.h / 2.0 + 18;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cornerX, cornerY, this.holeD / 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3px 黑色圆孔轮廓
      ctx.beginPath();
      ctx.arc(cornerX, cornerY, this.holeD / 2.0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  for (let i = 0; i < 5; i++) {
    const d = initDims[i];
    const b = new Block(220 + i * 85, groundY - d[1] / 2, d[0], d[1]);
    blocks.push(b);
  }

  function adjustBlockCount(targetCount) {
    const active = blocks.filter(b => !b.isAbsorbing);
    if (active.length < targetCount) {
      const toAdd = targetCount - active.length;
      for (let k = 0; k < toAdd; k++) {
        const parent = active[Math.floor(Math.random() * active.length)];
        const child = new Block(parent.x, parent.y, 100 + Math.random() * 70, 70 + Math.random() * 70);
        child.rot = parent.rot;
        child.scaleAnim = 0.05;
        blocks.push(child);
        active.push(child);
      }
    } else if (active.length > targetCount) {
      const toRemove = active.length - targetCount;
      for (let k = 0; k < toRemove; k++) {
        if (active.length <= 3) break;
        const doomed = active.splice(Math.floor(Math.random() * active.length), 1)[0];
        const absorber = active[Math.floor(Math.random() * active.length)];
        doomed.startAbsorption(absorber);
      }
    }
  }

  function generateLayout(mx, my) {
    const archetype = Math.floor(Math.random() * 6);
    const names = ["ORTHOGONAL GRID", "RADIAL CIRCLE", "HORIZONTAL STRATA", "CONCENTRIC RINGS", "VERTICAL COLUMNS", "MINIMAL BAUHAUS"];
    currentPattern = names[archetype];

    const valid = blocks.filter(b => !b.isAbsorbing);
    const count = valid.length;

    for (let i = 0; i < count; i++) {
      const b = valid[i];
      let tx = mx, ty = my, trot = 0;

      if (archetype === 0) {
        const cols = (count <= 6) ? 3 : 4;
        tx = mx + (i % cols - (cols - 1) / 2.0) * 195;
        ty = my + (Math.floor(i / cols) - (count / cols) / 2.0) * 145;
      } else if (archetype === 1) {
        const a = (i / count) * Math.PI * 2;
        tx = mx + Math.cos(a) * 230;
        ty = my + Math.sin(a) * 230;
        trot = a + Math.PI / 2;
      } else if (archetype === 2) {
        const row = (count > 5 && i >= count / 2) ? 1 : 0;
        const col = (row === 0) ? i : (i - Math.floor(count / 2));
        const items = (row === 0) ? ((count > 5) ? Math.floor(count / 2) : count) : (count - Math.floor(count / 2));
        tx = mx + (col - (items - 1) / 2.0) * 210;
        ty = my + (row - 0.5) * 150;
      } else if (archetype === 3) {
        const r = (i % 2 === 0) ? 260 : 150;
        const a = (i / count) * Math.PI * 2;
        tx = mx + Math.cos(a) * r;
        ty = my + Math.sin(a) * r;
        trot = a;
      } else if (archetype === 4) {
        const col = (count > 5 && i >= count / 2) ? 1 : 0;
        const row = (col === 0) ? i : (i - Math.floor(count / 2));
        const items = (col === 0) ? ((count > 5) ? Math.floor(count / 2) : count) : (count - Math.floor(count / 2));
        tx = mx + (col - 0.5) * 230;
        ty = my + (row - (items - 1) / 2.0) * 155;
        trot = Math.PI / 2;
      } else if (archetype === 5) {
        tx = mx + (i / (count - 1 || 1)) * 480 - 240;
        ty = my + Math.sin(i * 1.5) * 160;
        trot = (i % 2 === 0) ? 0 : Math.PI / 2;
      }

      const halfDiag = Math.sqrt(b.w * b.w + b.h * b.h) / 2.0;
      tx = Math.max(safeMargin + halfDiag, Math.min(size - safeMargin - halfDiag, tx));
      ty = Math.max(safeMargin + halfDiag, Math.min(groundY - halfDiag - 10, ty));
      b.setToTarget(tx, ty, trot);
    }
  }

  function resolveOverlaps() {
    for (let i = 0; i < blocks.length; i++) {
      const b1 = blocks[i];
      if (b1.isAbsorbing) continue;
      for (let j = i + 1; j < blocks.length; j++) {
        const b2 = blocks[j];
        if (b2.isAbsorbing) continue;
        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minDist = (b1.w + b2.w) * 0.44;
        if (d < minDist && d > 1.0) {
          const push = (minDist - d) * 0.06;
          b1.hoverOffsetX -= (dx / d) * push;
          b1.hoverOffsetY -= (dy / d) * push;
          b2.hoverOffsetX += (dx / d) * push;
          b2.hoverOffsetY += (dy / d) * push;
        }
      }
    }
  }

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (size / rect.width);
    const my = (e.clientY - rect.top) * (size / rect.height);

    if (my >= groundY - 35) {
      isGrounded = true;
      currentPattern = "FALL TO GROUND";
      blocks.forEach(b => b.toPhysicsGround(mx));
      return;
    }

    isGrounded = false;
    adjustBlockCount(Math.floor(Math.random() * 7 + 4));
    generateLayout(mx, my);
  });

  let frameCount = 0;
  function animate() {
    frameCount++;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, size, size);

    // 3px 地平线
    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(safeMargin, groundY);
    ctx.lineTo(size - safeMargin, groundY);
    ctx.stroke();

    if (!isGrounded) resolveOverlaps();

    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      b.update(frameCount);
      b.display();
      if (b.isAbsorbing && b.scaleAnim < 0.05) blocks.splice(i, 1);
    }

    // HUD
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '11px monospace';
    ctx.fillText("alignIMG: " + currentPattern, safeMargin, 28);
    const activeCount = blocks.filter(b => !b.isAbsorbing).length;
    ctx.fillText("ACTIVE BLOCKS: " + activeCount, safeMargin, 45);

    requestAnimationFrame(animate);
  }
  animate();
})();