import type { Platform } from '../types';
import type { PropAnchor } from '../world';

export class MysticSwampRenderer {
  private layer1Cache: HTMLCanvasElement | null = null;
  private cacheWidth = 0;
  private cacheHeight = 0;

  private ensureLayer1Cache(viewW: number, viewH: number): HTMLCanvasElement {
    const targetW = Math.max(1600, Math.ceil(viewW * 1.4));
    const targetH = Math.max(760, viewH);

    if (
      this.layer1Cache &&
      this.cacheWidth === targetW &&
      this.cacheHeight === targetH
    ) {
      return this.layer1Cache;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const c = canvas.getContext('2d');
    if (!c) return canvas;

    this.cacheWidth = targetW;
    this.cacheHeight = targetH;

    // Layer 1: Soft-focused background swamp tree trunks + autumn canopy silhouettes
    c.save();
    c.filter = 'blur(3px)';

    const trunkCount = 18;
    for (let i = 0; i < trunkCount; i++) {
      const tx = (i / trunkCount) * targetW + ((i * 23) % 35);
      const trunkW = 14 + ((i * 7) % 14);
      const canopyY = 95 + ((i * 41) % 120);

      // Vertical slender tree trunk fading into swamp mist
      const tGrad = c.createLinearGradient(tx, canopyY, tx, targetH);
      tGrad.addColorStop(0, '#2a222b');
      tGrad.addColorStop(0.7, '#344954');
      tGrad.addColorStop(1, 'rgba(65, 110, 122, 0.25)');
      c.fillStyle = tGrad;
      c.fillRect(tx, canopyY, trunkW, targetH - canopyY);

      // Autumn orange/brown foliage canopies (#6e473b)
      c.fillStyle = i % 2 === 0 ? 'rgba(110, 71, 59, 0.78)' : 'rgba(92, 62, 54, 0.72)';
      c.beginPath();
      c.arc(tx + trunkW * 0.5, canopyY, 54 + ((i * 19) % 28), 0, Math.PI * 2);
      c.arc(tx - 24, canopyY + 18, 38, 0, Math.PI * 2);
      c.arc(tx + 34, canopyY + 16, 42, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
    this.layer1Cache = canvas;
    return canvas;
  }

  public drawLayer0Backdrop(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number
  ): void {
    // Misty twilight purples, muted slate-teal, and atmospheric swamp glow
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#242c3b');
    grad.addColorStop(0.42, '#3d515e');
    grad.addColorStop(0.75, '#577c86');
    grad.addColorStop(1, '#264450');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    // Subtle misty twilight glow behind canopy
    const mist = ctx.createRadialGradient(
      viewW * 0.52,
      viewH * 0.35,
      30,
      viewW * 0.52,
      viewH * 0.35,
      viewW * 0.6
    );
    mist.addColorStop(0, 'rgba(164, 212, 218, 0.24)');
    mist.addColorStop(1, 'rgba(38, 68, 80, 0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  public drawLayer1Silhouettes(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    camX: number,
    camY: number
  ): void {
    const cache = this.ensureLayer1Cache(viewW, viewH);
    const px = ((camX * 0.24) % cache.width + cache.width) % cache.width;
    const py = Math.max(-35, Math.min(35, -camY * 0.04));

    ctx.drawImage(cache, -px, py);
    if (cache.width - px < viewW) {
      ctx.drawImage(cache, cache.width - px, py);
    }
  }

  public drawLayer2WorldProps(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    viewW: number,
    viewH: number,
    time: number,
    anchors?: PropAnchor[]
  ): void {
    const items: PropAnchor[] = anchors && anchors.length > 0
      ? anchors
      : [
          { x: 180, y: 780 },
          { x: 1160, y: 780 },
          { x: 2220, y: 780 },
          { x: 3440, y: 780 },
        ];
    for (const anchor of items) {
      const baseX = anchor.x;
      const floorY = anchor.y;
      if (
        baseX + 980 < cx - 120 ||
        baseX - 160 > cx + viewW + 120 ||
        floorY + 260 < cy - 120 ||
        floorY - 360 > cy + viewH + 120
      ) {
        continue;
      }

      // Calm reflective teal-mist swamp water below elevated banks
      this.drawSwampWater(ctx, baseX + 260, floorY + 62, 580, 140, time);

      // Woven thatched dome hut on wooden stilts on the left bank
      this.drawThatchedHut(ctx, baseX + 120, floorY);

      // Three glowing cyan/blue spore mushroom stalks near the bridge
      this.drawSporePillars(ctx, baseX + 340, floorY, time);

      // Massive curved mossy purple-brown fallen log bridge
      this.drawFallenLogBridge(ctx, baseX + 280, floorY + 8, baseX + 760, floorY + 12);
    }
  }

  private drawSwampWater(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    time: number
  ): void {
    const wGrad = ctx.createLinearGradient(x, y, x, y + h);
    wGrad.addColorStop(0, '#4ca1af');
    wGrad.addColorStop(0.45, '#2c5364');
    wGrad.addColorStop(1, '#142a34');
    ctx.fillStyle = wGrad;
    ctx.fillRect(x, y, w, h);

    // Subtle animated ripples & floating lily pads
    ctx.strokeStyle = 'rgba(205, 245, 250, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const rx = x + 60 + i * 92 + Math.sin(time * 0.9 + i) * 8;
      const ry = y + 26 + (i % 3) * 28;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 28 + (i % 2) * 10, 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Floating lily pad
      if (i % 2 === 0) {
        ctx.fillStyle = '#6ba368';
        ctx.beginPath();
        ctx.ellipse(rx + 18, ry + 12, 16, 5, 0, 0.2, Math.PI * 1.9);
        ctx.fill();
      }
    }
  }

  private drawThatchedHut(
    ctx: CanvasRenderingContext2D,
    cx: number,
    floorY: number
  ): void {
    // Wooden support stilts
    ctx.strokeStyle = '#2d232c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 56, floorY);
    ctx.lineTo(cx - 44, floorY - 56);
    ctx.moveTo(cx + 56, floorY);
    ctx.lineTo(cx + 44, floorY - 56);
    ctx.moveTo(cx - 18, floorY);
    ctx.lineTo(cx - 18, floorY - 46);
    ctx.moveTo(cx + 18, floorY);
    ctx.lineTo(cx + 18, floorY - 46);
    ctx.stroke();

    // Round wooden cabin base
    const baseY = floorY - 72;
    ctx.fillStyle = '#473c4a';
    ctx.strokeStyle = '#0a0d12';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 72, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Warm dark interior doorway
    ctx.fillStyle = '#18141c';
    ctx.beginPath();
    ctx.ellipse(cx + 26, baseY + 4, 20, 26, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Woven thatched dome roof (layered overlapping jagged pale grey-green strokes)
    const roofTop = baseY - 118;
    const roofGrad = ctx.createLinearGradient(cx, roofTop, cx, baseY + 10);
    roofGrad.addColorStop(0, '#4a5661');
    roofGrad.addColorStop(0.55, '#7e8e98');
    roofGrad.addColorStop(1, '#9aa8b0');

    ctx.fillStyle = roofGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 88, baseY - 2);
    ctx.quadraticCurveTo(cx - 72, roofTop + 14, cx, roofTop);
    ctx.quadraticCurveTo(cx + 72, roofTop + 14, cx + 88, baseY - 2);
    ctx.quadraticCurveTo(cx, baseY + 14, cx - 88, baseY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Jagged thatched fringe strokes
    ctx.strokeStyle = '#3b444d';
    ctx.lineWidth = 2;
    for (let i = -72; i <= 72; i += 14) {
      ctx.beginPath();
      ctx.moveTo(cx + i, baseY - 26);
      ctx.lineTo(cx + i - 4, baseY + 4);
      ctx.stroke();
    }

    // Tied top branches & hanging rope
    ctx.strokeStyle = '#382b33';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 16, roofTop - 22);
    ctx.lineTo(cx + 4, roofTop + 10);
    ctx.moveTo(cx + 16, roofTop - 20);
    ctx.lineTo(cx - 4, roofTop + 10);
    ctx.stroke();
  }

  private drawSporePillars(
    ctx: CanvasRenderingContext2D,
    x: number,
    floorY: number,
    time: number
  ): void {
    const stalks = [
      { dx: 0, h: 68, w: 18 },
      { dx: 26, h: 98, w: 22 },
      { dx: 54, h: 74, w: 18 },
    ];
    for (const s of stalks) {
      const sx = x + s.dx;
      const grad = ctx.createLinearGradient(sx, floorY - s.h, sx, floorY);
      grad.addColorStop(0, '#7ae7ff');
      grad.addColorStop(0.4, '#00f2fe');
      grad.addColorStop(1, 'rgba(30, 120, 145, 0.45)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx - s.w * 0.5, floorY);
      ctx.lineTo(sx - s.w * 0.35, floorY - s.h);
      ctx.quadraticCurveTo(sx, floorY - s.h - 10, sx + s.w * 0.35, floorY - s.h);
      ctx.lineTo(sx + s.w * 0.5, floorY);
      ctx.closePath();
      ctx.fill();

      // Delicate glowing electric tendrils sprouting from top
      ctx.strokeStyle = '#7ae7ff';
      ctx.lineWidth = 1.4;
      const sway = Math.sin(time * 2.5 + s.dx) * 4;
      ctx.beginPath();
      ctx.moveTo(sx, floorY - s.h - 4);
      ctx.quadraticCurveTo(sx - 8 + sway, floorY - s.h - 20, sx - 14 + sway, floorY - s.h - 26);
      ctx.moveTo(sx, floorY - s.h - 4);
      ctx.quadraticCurveTo(sx + 8 + sway, floorY - s.h - 22, sx + 12 + sway, floorY - s.h - 28);
      ctx.stroke();
    }
  }

  private drawFallenLogBridge(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    const midX = (x1 + x2) * 0.5;
    const archY = Math.min(y1, y2) - 86;

    const logGrad = ctx.createLinearGradient(x1, archY, x2, y2);
    logGrad.addColorStop(0, '#5a486b');
    logGrad.addColorStop(0.5, '#735c87');
    logGrad.addColorStop(1, '#4a3b59');

    ctx.fillStyle = logGrad;
    ctx.strokeStyle = '#0a0d12';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, archY - 34, x2, y2);
    ctx.lineTo(x2, y2 + 34);
    ctx.quadraticCurveTo(midX, archY + 14, x1, y1 + 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wooden planks nailed across the left slope
    ctx.fillStyle = '#3c3044';
    for (let i = 0; i < 4; i++) {
      const px = x1 + 42 + i * 26;
      const py = y1 - 12 - i * 11;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.36);
      ctx.fillRect(-10, -4, 22, 9);
      ctx.strokeRect(-10, -4, 22, 9);
      ctx.restore();
    }
  }

  public drawPlatform(
    ctx: CanvasRenderingContext2D,
    p: Platform
  ): void {
    // Mossy purple-brown elevated bank & cliff sides matching Reference Image 2
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + Math.min(p.h, 180));
    grad.addColorStop(0, '#584166');
    grad.addColorStop(0.45, '#3b2b47');
    grad.addColorStop(1, '#1b1322');

    ctx.fillStyle = grad;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.strokeStyle = '#0a0d12';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(p.x, p.y, p.w, p.h);

    if (p.mossTop) {
      ctx.fillStyle = '#8b729c';
      ctx.fillRect(p.x - 1, p.y, p.w + 2, 9);
      ctx.fillStyle = '#b49ec7';
      ctx.fillRect(p.x - 1, p.y, p.w + 2, 3);
    }
  }

  public drawLayer3Lighting(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    cx: number,
    cy: number,
    time: number,
    anchors?: PropAnchor[]
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Soft swamp canopy light shafts
    const shafts = [340, 1480, 2680, 3840];
    for (const sxWorld of shafts) {
      const sx = sxWorld - cx * 0.8;
      if (sx < -320 || sx > viewW + 320) continue;
      const pulse = 0.75 + Math.sin(time * 0.8 + sxWorld) * 0.25;
      const grad = ctx.createLinearGradient(sx, -40, sx + 160, viewH);
      grad.addColorStop(0, `rgba(170, 225, 225, ${0.14 * pulse})`);
      grad.addColorStop(1, 'rgba(0, 242, 254, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx - 60, -40);
      ctx.lineTo(sx + 70, -40);
      ctx.lineTo(sx + 240, viewH + 40);
      ctx.lineTo(sx + 40, viewH + 40);
      ctx.closePath();
      ctx.fill();
    }

    // Bioluminescent cyan/blue spore & root-light halos in world space
    ctx.translate(-Math.round(cx), -Math.round(cy));
    const items: PropAnchor[] = anchors && anchors.length > 0
      ? anchors
      : [
          { x: 180, y: 780 },
          { x: 1160, y: 780 },
          { x: 2220, y: 780 },
          { x: 3440, y: 780 },
        ];
    for (const anchor of items) {
      const baseX = anchor.x;
      const floorY = anchor.y;
      if (
        baseX + 980 < cx ||
        baseX - 100 > cx + viewW ||
        floorY + 120 < cy ||
        floorY - 260 > cy + viewH
      ) {
        continue;
      }

      const glowPoints = [
        { gx: baseX + 160, gy: floorY - 12, r: 95 },
        { gx: baseX + 365, gy: floorY - 58, r: 155 },
      ];
      for (const gp of glowPoints) {
        const rad = ctx.createRadialGradient(gp.gx, gp.gy, 6, gp.gx, gp.gy, gp.r);
        rad.addColorStop(0, 'rgba(0, 242, 254, 0.36)');
        rad.addColorStop(0.55, 'rgba(0, 200, 220, 0.12)');
        rad.addColorStop(1, 'rgba(0, 242, 254, 0)');
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(gp.gx, gp.gy, gp.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  public drawLayer4Foreground(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    px: number,
    time: number
  ): void {
    const spacing = 560;
    const startIdx = Math.floor(px / spacing) - 1;
    const count = Math.ceil(viewW / spacing) + 3;

    for (let i = startIdx; i < startIdx + count; i++) {
      const sx = i * spacing - px;

      // Dark out-of-focus foreground rocks framing bottom edge
      ctx.fillStyle = '#0c0910';
      ctx.beginPath();
      ctx.moveTo(sx - 40, viewH + 10);
      ctx.lineTo(sx + 30, viewH - 64);
      ctx.lineTo(sx + 135, viewH - 48);
      ctx.lineTo(sx + 210, viewH - 86);
      ctx.lineTo(sx + 290, viewH + 10);
      ctx.closePath();
      ctx.fill();

      // Glowing cyan reeds sprouting in foreground corners
      const sway = Math.sin(time * 1.8 + i) * 5;
      ctx.strokeStyle = '#4de8ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx + 65, viewH - 18);
      ctx.quadraticCurveTo(sx + 58 + sway, viewH - 72, sx + 54 + sway, viewH - 110);
      ctx.moveTo(sx + 84, viewH - 12);
      ctx.quadraticCurveTo(sx + 92 + sway, viewH - 62, sx + 96 + sway, viewH - 94);
      ctx.stroke();
    }
  }
}
