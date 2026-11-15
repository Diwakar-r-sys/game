import { AnimationController } from './animation';
import { soundEngine } from './audio';
import { InputHandler, type InputSnapshot, type VirtualAction } from './input';
import { renderGameFrame, type PlayerRenderState } from './renderer';
import {
  DEFAULT_MOVEMENT_CONFIG,
  type AfterImage,
  type DialogueSpeaker,
  type Enemy,
  type FloatingText,
  type GameStatus,
  type HudSnapshot,
  type InventoryItem,
  type LevelPreset,
  type MovementConfig,
  type Particle,
  type Rect,
  type SaveStateData,
  type SceneTheme,
  type Shockwave,
  type SlashArc,
  type SlashDirection,
  type SpecialWave,
  type SporeProjectile,
} from './types';
import { createWorld, findRoomAt, getZoneName, type WorldData } from './world';

const PARTICLE_POOL_SIZE = 260;
const AFTERIMAGE_POOL_SIZE = 14;
const PROJECTILE_POOL_SIZE = 24;
const SAVE_KEY = 'mossgrotto_save_v1';

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleIntersectsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

const BIOME_ORDER: SceneTheme[] = ['crystal', 'swamp', 'grotto'];

export class MapManager {
  private activeTheme: SceneTheme;

  constructor(initial: SceneTheme = 'crystal') {
    this.activeTheme = initial;
  }

  public getTheme(): SceneTheme {
    return this.activeTheme;
  }

  public setTheme(theme: SceneTheme): SceneTheme {
    this.activeTheme = BIOME_ORDER.includes(theme) ? theme : 'crystal';
    return this.activeTheme;
  }

  public cycleTheme(): SceneTheme {
    const idx = BIOME_ORDER.indexOf(this.activeTheme);
    this.activeTheme = BIOME_ORDER[(idx + 1) % BIOME_ORDER.length];
    return this.activeTheme;
  }
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input = new InputHandler();
  private onHudChange: (hud: HudSnapshot) => void;
  private onMapToggleRequest?: () => void;
  private onInventoryToggleRequest?: () => void;

  public config: MovementConfig = { ...DEFAULT_MOVEMENT_CONFIG };
  private world: WorldData = createWorld();
  private status: GameStatus = 'TITLE_MENU';
  private mapManager = new MapManager('crystal');
  private sceneTheme: SceneTheme = 'crystal';
  private titleMousePan = 0.5;
  private externalHold = false;
  private screenShakeEnabled = true;

  private rafId = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private runTime = 0;
  private hitstopTimer = 0;

  // Viewport & Camera
  private viewW = 1280;
  private viewH = 720;
  private camX = 0;
  private camY = 480;
  private shakeTime = 0;
  private shakeMag = 0;

  // Player Physics & Combat State
  private px = 160;
  private py = 860;
  private pw = 28;
  private ph = 46;
  private pvx = 0;
  private pvy = 0;
  private facing: 1 | -1 = 1;
  private grounded = false;
  private wasGrounded = false;
  private wasInWater = false;
  private wallDir: -1 | 0 | 1 = 0;
  private wallSliding = false;

  // Dash vector (supports horizontal & diagonal Silk Dash!)
  private dashDirX = 1;
  private dashDirY = 0;

  // Tolerance windows & ability timers
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wallJumpLockTimer = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private airDashAvailable = true;
  private attackCooldownTimer = 0;
  private specialCooldownTimer = 0;
  private airJumpsRemaining = 1;
  private dyingTimer = 0;
  private invulnTimer = 0;
  private healTimer = 0;
  private hitFlashTimer = 0;
  private afterImageEmitTimer = 0;

  // Visual Juice & Animation State Machine
  private anim = new AnimationController();
  private squashX = 1;
  private squashY = 1;
  private runCycle = 0;
  private footstepTimer = 0;

  // Stats, Map & Checkpoints
  private hp = 5;
  private maxHp = 5;
  private soul = 33;
  private maxSoul = 100;
  private essence = 0;
  private enemiesDefeated = 0;
  private pogoChains = 0;
  private bossDefeated = false;
  private bossEngaged = false;
  private respawnX = 160;
  private respawnY = 860;
  private safeGroundX = 160;
  private safeGroundY = 860;
  private currentRoomId = 'room-threshold';
  private mapVersion = 0;
  private collectedItemIds = new Set<string>(['pale-needle', 'pogo-art', 'silk-dash', 'focus-mend']);
  private nearbySpeaker: DialogueSpeaker | null = null;
  private activeDialogue: {
    speakerName: string;
    speakerTitle: string;
    lines: string[];
    lineIndex: number;
  } | null = null;

  private slash: SlashArc = {
    active: false,
    x: 0,
    y: 0,
    dir: 'right',
    timer: 0,
    duration: 0.13,
    hitIds: new Set<string>(),
  };

  private particles: Particle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 3,
    life: 0,
    maxLife: 0.4,
    color: '#a7f3d0',
    gravity: 0,
    glow: false,
  }));

  private afterImages: AfterImage[] = Array.from({ length: AFTERIMAGE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    facing: 1,
    alpha: 0,
  }));

  private projectiles: SporeProjectile[] = Array.from({ length: PROJECTILE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 7,
    life: 0,
  }));

  private specialWaves: SpecialWave[] = [];
  private shockwaves: Shockwave[] = [];
  private floatingTexts: FloatingText[] = [];

  private lastHudKey = '';

  constructor(
    canvas: HTMLCanvasElement,
    onHudChange: (hud: HudSnapshot) => void,
    onMapToggleRequest?: () => void,
    onInventoryToggleRequest?: () => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.onHudChange = onHudChange;
    this.onMapToggleRequest = onMapToggleRequest;
    this.onInventoryToggleRequest = onInventoryToggleRequest;
    this.resetWorldState('TITLE_MENU');
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.titleMousePan = Math.max(0, Math.min(1, e.clientX / Math.max(1, window.innerWidth)));
  };

  public mount(): void {
    this.input.attach(this.canvas);
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.onMouseMove);
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    this.emitHud(true);
  }

  public unmount(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.input.detach();
    soundEngine.stopAmbientDrone();
  }

  private handleResize = (): void => {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = Math.max(320, w);
    this.viewH = Math.max(240, h);
    this.canvas.width = Math.floor(this.viewW * dpr);
    this.canvas.height = Math.floor(this.viewH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  public startNewGame(): void {
    this.externalHold = false;
    this.resetWorldState('PLAYING');
    this.saveProgress();
    soundEngine.startAmbientDrone();
    this.emitHud(true);
  }

  public startAtPreset(preset: LevelPreset): void {
    this.externalHold = false;
    this.resetWorldState('PLAYING');
    this.sceneTheme = preset.recommendedTheme;
    this.px = preset.spawnX;
    this.py = preset.spawnY;
    this.respawnX = preset.spawnX;
    this.respawnY = preset.spawnY;
    this.safeGroundX = preset.spawnX;
    this.safeGroundY = preset.spawnY;
    this.updateMapDiscovery();
    this.camX = Math.max(0, Math.min(this.world.width - this.viewW, this.px - this.viewW * 0.45));
    this.camY = Math.max(0, Math.min(this.world.height - this.viewH, this.py - this.viewH * 0.52));
    this.saveProgress();
    soundEngine.startAmbientDrone();
    this.emitHud(true);
  }

  public hasSaveData(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.localStorage.getItem(SAVE_KEY));
    } catch {
      return false;
    }
  }

  public saveProgress(): void {
    if (typeof window === 'undefined') return;
    try {
      const data: SaveStateData = {
        sceneTheme: this.sceneTheme,
        respawnX: this.respawnX,
        respawnY: this.respawnY,
        hp: Math.max(1, this.hp),
        maxHp: this.maxHp,
        soul: this.soul,
        essence: this.essence,
        zoneName: getZoneName(this.px + this.pw * 0.5, this.py + this.ph * 0.5),
        collectedItemIds: Array.from(this.collectedItemIds),
        equippedItemIds: Array.from(this.collectedItemIds),
        visitedRoomIds: this.world.rooms.filter((r) => r.visited).map((r) => r.id),
        discoveredRoomIds: this.world.rooms.filter((r) => r.discovered).map((r) => r.id),
        brokenWallIds: this.world.secretWalls.filter((w) => w.broken).map((w) => w.id),
        savedAt: Date.now(),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  public continueSavedGame(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw) as SaveStateData;
      this.externalHold = false;
      this.resetWorldState('PLAYING');
      const restoredTheme: SceneTheme =
        saved.sceneTheme === 'swamp' || saved.sceneTheme === 'grotto' ? saved.sceneTheme : 'crystal';
      this.sceneTheme = this.mapManager.setTheme(restoredTheme);
      this.maxHp = Math.max(5, saved.maxHp ?? 5);
      this.hp = Math.min(this.maxHp, Math.max(1, saved.hp ?? this.maxHp));
      this.soul = Math.max(0, Math.min(this.maxSoul, saved.soul ?? 33));
      this.essence = Math.max(0, saved.essence ?? 0);
      this.respawnX = saved.respawnX ?? this.world.spawnX;
      this.respawnY = saved.respawnY ?? this.world.spawnY;
      this.px = this.respawnX;
      this.py = this.respawnY;
      this.safeGroundX = this.respawnX;
      this.safeGroundY = this.respawnY;

      this.collectedItemIds = new Set<string>([
        'pale-needle',
        'pogo-art',
        'silk-dash',
        'focus-mend',
        ...(saved.collectedItemIds ?? []),
      ]);

      for (const relic of this.world.relics) {
        if (this.collectedItemIds.has(relic.itemId)) {
          relic.collected = true;
        }
      }

      const visited = new Set(saved.visitedRoomIds ?? []);
      const discovered = new Set(saved.discoveredRoomIds ?? []);
      for (const r of this.world.rooms) {
        if (visited.has(r.id)) r.visited = true;
        if (discovered.has(r.id)) r.discovered = true;
      }

      const broken = new Set(saved.brokenWallIds ?? []);
      for (const sw of this.world.secretWalls) {
        if (broken.has(sw.id)) {
          sw.broken = true;
        }
      }

      this.updateMapDiscovery();
      this.camX = Math.max(0, Math.min(this.world.width - this.viewW, this.px - this.viewW * 0.45));
      this.camY = Math.max(0, Math.min(this.world.height - this.viewH, this.py - this.viewH * 0.52));
      soundEngine.startAmbientDrone();
      this.emitHud(true);
      return true;
    } catch {
      return false;
    }
  }

  public setVirtualInput(action: VirtualAction, active: boolean): void {
    this.input.setVirtualAction(action, active);
  }

  public setScreenShakeEnabled(enabled: boolean): void {
    this.screenShakeEnabled = enabled;
    if (!enabled) {
      this.shakeTime = 0;
      this.shakeMag = 0;
    }
  }

  public interactWithNearbySpeaker(): void {
    if (!this.nearbySpeaker) return;
    this.nearbySpeaker.read = true;
    this.activeDialogue = {
      speakerName: this.nearbySpeaker.name,
      speakerTitle: this.nearbySpeaker.title,
      lines: this.nearbySpeaker.lines,
      lineIndex: 0,
    };
    soundEngine.playBench();
    this.emitHud(true);
  }

  public advanceDialogue(): void {
    if (!this.activeDialogue) return;
    if (this.activeDialogue.lineIndex + 1 < this.activeDialogue.lines.length) {
      this.activeDialogue = {
        ...this.activeDialogue,
        lineIndex: this.activeDialogue.lineIndex + 1,
      };
    } else {
      this.activeDialogue = null;
    }
    this.emitHud(true);
  }

  public closeDialogue(): void {
    if (!this.activeDialogue) return;
    this.activeDialogue = null;
    this.emitHud(true);
  }

  public resumeGame(): void {
    if (this.status === 'PAUSED') {
      this.status = 'PLAYING';
      soundEngine.startAmbientDrone();
      this.emitHud(true);
    }
  }

  public pauseGame(): void {
    if (this.status === 'PLAYING') {
      this.status = 'PAUSED';
      soundEngine.stopAmbientDrone();
      this.emitHud(true);
    }
  }

  public setExternalHold(held: boolean): void {
    this.externalHold = held;
  }

  public returnToTitle(): void {
    this.externalHold = false;
    this.resetWorldState('TITLE_MENU');
    soundEngine.stopAmbientDrone();
    this.emitHud(true);
  }

  public updateMovementConfig(partial: Partial<MovementConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public toggleSceneTheme(): void {
    this.sceneTheme = this.mapManager.cycleTheme();
    this.emitHud(true);
  }

  public setSceneTheme(theme: SceneTheme): void {
    this.sceneTheme = this.mapManager.setTheme(theme);
    this.emitHud(true);
  }

  private resetWorldState(nextStatus: GameStatus): void {
    this.world = createWorld();
    this.status = nextStatus;
    this.px = this.world.spawnX;
    this.py = this.world.spawnY;
    this.pvx = 0;
    this.pvy = 0;
    this.facing = 1;
    this.grounded = false;
    this.wasGrounded = false;
    this.wasInWater = false;
    this.wallDir = 0;
    this.wallSliding = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallJumpLockTimer = 0;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.airDashAvailable = true;
    this.attackCooldownTimer = 0;
    this.specialCooldownTimer = 0;
    this.airJumpsRemaining = 1;
    this.dyingTimer = 0;
    this.invulnTimer = 0;
    this.healTimer = 0;
    this.hitFlashTimer = 0;
    this.hitstopTimer = 0;
    this.anim.reset();
    this.squashX = 1;
    this.squashY = 1;

    this.hp = 5;
    this.maxHp = 5;
    this.soul = 33;
    this.essence = 0;
    this.enemiesDefeated = 0;
    this.pogoChains = 0;
    this.bossDefeated = false;
    this.bossEngaged = false;
    this.runTime = 0;
    this.respawnX = this.world.spawnX;
    this.respawnY = this.world.spawnY;
    this.safeGroundX = this.world.spawnX;
    this.safeGroundY = this.world.spawnY;
    this.currentRoomId = 'room-threshold';
    this.mapVersion += 1;
    this.collectedItemIds = new Set<string>(['pale-needle', 'pogo-art', 'silk-dash', 'focus-mend']);
    this.nearbySpeaker = null;
    this.activeDialogue = null;

    this.slash.active = false;
    this.specialWaves = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    for (const p of this.particles) p.active = false;
    for (const a of this.afterImages) a.active = false;
    for (const pr of this.projectiles) pr.active = false;

    this.camX = Math.max(0, this.px - this.viewW * 0.4);
    this.camY = Math.max(0, this.py - this.viewH * 0.55);
  }

  private loop = (timestamp: number): void => {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    this.elapsedTime += dt;

    const input = this.input.consumeFrame();

    if (input.mapPressed && this.status === 'PLAYING' && !this.activeDialogue && this.onMapToggleRequest) {
      this.onMapToggleRequest();
    }

    if (
      input.inventoryPressed &&
      this.status === 'PLAYING' &&
      !this.activeDialogue &&
      !this.externalHold &&
      this.onInventoryToggleRequest
    ) {
      this.onInventoryToggleRequest();
    }

    if (input.pausePressed && !this.externalHold) {
      if (this.activeDialogue) {
        this.closeDialogue();
      } else if (this.status === 'PLAYING') {
        this.pauseGame();
      } else if (this.status === 'PAUSED') {
        this.resumeGame();
      }
    }

    if (this.status === 'TITLE_MENU') {
      this.updateTitlePan(dt, input);
    } else if (this.status === 'PLAYING' && !this.externalHold) {
      if (this.dyingTimer > 0) {
        if (this.shakeTime > 0) {
          this.shakeTime = Math.max(0, this.shakeTime - dt);
        }
        this.dyingTimer -= dt;
        this.anim.update(dt, {
          vx: 0,
          vy: 0,
          grounded: this.grounded,
          wallSliding: false,
          dashing: false,
          healing: false,
          maxRunSpeed: this.config.maxRunSpeed,
          justLanded: false,
        });
        this.updateParticles(dt);
        this.updateMossTufts(dt);
        this.updateHangingRopes(dt);
        if (this.dyingTimer <= 0) {
          this.dyingTimer = 0;
          this.status = 'GAME_OVER';
          soundEngine.stopAmbientDrone();
          this.emitHud(true);
        }
      } else if (this.activeDialogue) {
        if (input.interactPressed || input.jumpPressed || input.attackPressed) {
          this.advanceDialogue();
        }
        this.anim.update(dt, {
          vx: 0,
          vy: 0,
          grounded: this.grounded,
          wallSliding: false,
          dashing: false,
          healing: false,
          maxRunSpeed: this.config.maxRunSpeed,
          justLanded: false,
        });
        this.updateMossTufts(dt);
        this.updateHangingRopes(dt);
      } else {
        this.runTime += dt;
        if (this.shakeTime > 0) {
          this.shakeTime = Math.max(0, this.shakeTime - dt);
        }
        if (this.hitstopTimer > 0) {
          this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
        } else {
          this.stepSimulation(dt, input);
        }
      }
      this.emitHud(false);
    }

    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateTitlePan(dt: number, input: InputSnapshot): void {
    if (input.moveX !== 0) {
      this.titleMousePan = Math.max(0, Math.min(1, this.titleMousePan + input.moveX * dt * 0.45));
    }
    const autoDrift = 0.5 + 0.5 * Math.sin(this.elapsedTime * 0.14 - Math.PI * 0.5);
    const blendPan = autoDrift * 0.45 + this.titleMousePan * 0.55;
    const targetCamX = 40 + blendPan * 1150;
    const targetCamY = 480 + Math.sin(this.elapsedTime * 0.22) * 30;
    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 3.5);
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 3.5);
    this.updateMossTufts(dt);
    this.updateHangingRopes(dt);
  }

  private stepSimulation(dt: number, input: InputSnapshot): void {
    this.updatePlayer(dt, input);
    this.updateSlash(dt);
    this.updateSpecialWaves(dt);
    this.updateSecretWalls(dt);
    this.updateHangingRopes(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateShockwaves(dt);
    this.updateSporeBulbs(dt);
    this.updateRelics();
    this.updateBenches();
    this.updateDialogueProximity(input);
    this.updateMapDiscovery();
    this.updateAltar();
    this.updateMossTufts(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
    this.updateAfterImages(dt);
    this.updateCamera(dt);
  }

  private updatePlayer(dt: number, input: InputSnapshot): void {
    const cfg = this.config;

    if (this.coyoteTimer > 0) this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.wallJumpLockTimer > 0) this.wallJumpLockTimer = Math.max(0, this.wallJumpLockTimer - dt);
    if (this.dashCooldownTimer > 0) this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    if (this.attackCooldownTimer > 0) this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    if (this.specialCooldownTimer > 0) this.specialCooldownTimer = Math.max(0, this.specialCooldownTimer - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    this.squashX += (1 - this.squashX) * Math.min(1, dt * 16);
    this.squashY += (1 - this.squashY) * Math.min(1, dt * 16);

    if (input.jumpPressed) {
      this.jumpBufferTimer = cfg.jumpBufferTime;
    }

    // 2.15 Focus Heal
    if (
      input.healPressed &&
      this.grounded &&
      this.dashTimer <= 0 &&
      this.healTimer <= 0 &&
      this.soul >= 33 &&
      this.hp < this.maxHp
    ) {
      this.healTimer = 0.36;
      this.pvx = 0;
      soundEngine.playHeal();
      this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.5, 16, '#a7f3d0', 180, -40);
    }

    if (this.healTimer > 0) {
      this.healTimer -= dt;
      this.pvx *= 0.8;
      if (this.healTimer <= 0) {
        this.soul = Math.max(0, this.soul - 33);
        this.hp = Math.min(this.maxHp, this.hp + 1);
        this.triggerShake(4, 0.14);
        this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.5, 24, '#ecfdf5', 260, -80);
      }
      this.anim.update(dt, {
        vx: this.pvx,
        vy: this.pvy,
        grounded: this.grounded,
        wallSliding: false,
        dashing: false,
        healing: this.healTimer > 0,
        maxRunSpeed: cfg.maxRunSpeed,
        justLanded: false,
      });
      return;
    }

    // 2.8 8-Directional / Horizontal Silk Dash
    if (
      input.dashPressed &&
      this.dashTimer <= 0 &&
      this.dashCooldownTimer <= 0 &&
      (this.grounded || this.airDashAvailable)
    ) {
      if (input.moveX !== 0) {
        this.facing = input.moveX;
      } else if (this.wallSliding && this.wallDir !== 0) {
        this.facing = (-this.wallDir) as 1 | -1;
      }

      const rawY = input.upHeld ? -1 : input.downHeld && !this.grounded ? 1 : 0;
      const rawX = rawY !== 0 && input.moveX === 0 ? 0 : input.moveX !== 0 ? input.moveX : this.facing;
      const len = Math.max(1, Math.hypot(rawX, rawY));
      this.dashDirX = rawX / len;
      this.dashDirY = rawY / len;

      this.dashTimer = cfg.dashDuration;
      this.dashCooldownTimer = cfg.dashCooldown;
      this.invulnTimer = Math.max(this.invulnTimer, cfg.dashIFrames);
      if (!this.grounded) {
        this.airDashAvailable = false;
      }
      this.pvx = this.dashDirX * cfg.dashSpeed;
      this.pvy = this.dashDirY * cfg.dashSpeed;
      this.squashX = Math.abs(this.dashDirX) > 0.5 ? 1.32 : 0.82;
      this.squashY = Math.abs(this.dashDirY) > 0.5 ? 1.3 : 0.74;
      this.afterImageEmitTimer = 0;
      soundEngine.playDash();
      this.triggerShake(3.5, 0.12);
      this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.5, 14, '#99f6e4', 220, 0);
    }

    const preBodyRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    const inWater = this.world.waterVolumes.some((w) => rectsOverlap(preBodyRect, w));
    if (inWater && !this.wasInWater) {
      this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.65, 14, '#7ae7ff', 170, -70);
      this.pvy *= 0.45;
      this.airDashAvailable = true;
      this.airJumpsRemaining = 1;
    }
    this.wasInWater = inWater;

    const activeAirStream = this.world.airStreams.find((s) => rectsOverlap(preBodyRect, s));

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.pvx = this.dashDirX * cfg.dashSpeed;
      this.pvy = this.dashDirY * cfg.dashSpeed;
      this.afterImageEmitTimer -= dt;
      if (this.afterImageEmitTimer <= 0) {
        this.afterImageEmitTimer = 0.028;
        this.spawnAfterImage();
      }
      if (this.dashTimer <= 0 && this.dashDirY < 0) {
        this.pvy *= 0.45;
      }
    } else {
      if (this.wallJumpLockTimer <= 0) {
        const baseCap = input.walkHeld ? cfg.maxRunSpeed * 0.46 : cfg.maxRunSpeed;
        const moveCap = inWater ? baseCap * 0.78 : baseCap;
        if (input.moveX !== 0) {
          this.facing = input.moveX;
          const accel = (this.grounded ? cfg.groundAccel : cfg.airAccel) * (inWater ? 0.72 : 1);
          const targetVx = input.moveX * moveCap;
          if (Math.abs(this.pvx) > moveCap && Math.sign(this.pvx) === input.moveX) {
            this.pvx += (targetVx - this.pvx) * Math.min(1, dt * 8);
          } else {
            this.pvx += accel * dt * input.moveX;
            if (Math.abs(this.pvx) > moveCap && Math.sign(this.pvx) === input.moveX) {
              this.pvx = targetVx;
            }
          }
        } else {
          const decel = (this.grounded ? cfg.groundDecel : cfg.airDecel) * (inWater ? 0.7 : 1);
          const step = decel * dt;
          if (Math.abs(this.pvx) <= step) {
            this.pvx = 0;
          } else {
            this.pvx -= Math.sign(this.pvx) * step;
          }
        }
      }

      if (inWater) {
        // Buoyant water gravity & gentle drag
        const waterGrav = this.pvy < 0 ? cfg.gravityUp * 0.55 : cfg.gravityFall * 0.24;
        this.pvy = Math.min(220, this.pvy + waterGrav * dt);
        if (Math.abs(this.pvx) > 30 && Math.random() < 0.2) {
          this.spawnParticle(this.px + this.pw * 0.5, this.py + 8, 0, -45, 2.2, 0.35, '#a7f3d0', 0);
        }
      } else {
        const grav = this.pvy < 0 ? cfg.gravityUp : cfg.gravityFall;
        this.pvy = Math.min(cfg.maxFallSpeed, this.pvy + grav * dt);
      }

      if (activeAirStream) {
        this.pvy = Math.max(-540, this.pvy - activeAirStream.liftForce * dt);
        this.airDashAvailable = true;
      }

      this.wallSliding = false;
      if (!this.grounded && !inWater && this.wallDir !== 0 && this.pvy > 0 && input.moveX === this.wallDir) {
        this.wallSliding = true;
        if (this.pvy > cfg.wallSlideSpeed) {
          this.pvy = cfg.wallSlideSpeed;
        }
        if (Math.random() < 0.35) {
          this.spawnParticle(
            this.wallDir === 1 ? this.px + this.pw : this.px,
            this.py + 12 + Math.random() * 24,
            -this.wallDir * 25,
            -20 - Math.random() * 25,
            2.4,
            0.28,
            '#74c69d',
            0
          );
        }
      }

      if (this.jumpBufferTimer > 0) {
        if (inWater) {
          // Buoyant Swim Stroke / Leap out of water
          this.pvy = -440;
          this.grounded = false;
          this.jumpBufferTimer = 0;
          this.airDashAvailable = true;
          this.airJumpsRemaining = 1;
          this.squashX = 0.82;
          this.squashY = 1.22;
          soundEngine.playJump();
          this.spawnBurst(this.px + this.pw * 0.5, this.py + 16, 10, '#a7f3d0', 140, -50);
        } else if (this.coyoteTimer > 0) {
          // 2.4 Primary Jump
          this.pvy = cfg.jumpVelocity;
          this.grounded = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
          this.squashX = 0.78;
          this.squashY = 1.28;
          soundEngine.playJump();
          this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph, 8, '#a7f3d0', 110, -30);
        } else if (this.wallDir !== 0 && !this.grounded) {
          // 2.10 Wall Jump
          this.pvx = -this.wallDir * cfg.wallJumpVelX;
          this.pvy = cfg.wallJumpVelY;
          this.facing = (-this.wallDir) as 1 | -1;
          this.wallJumpLockTimer = cfg.wallJumpLockTime;
          this.jumpBufferTimer = 0;
          this.wallSliding = false;
          this.airDashAvailable = true;
          this.airJumpsRemaining = 1;
          this.squashX = 0.76;
          this.squashY = 1.26;
          this.anim.trigger('wallJump', 0.2);
          soundEngine.playWallJump();
          this.spawnBurst(
            this.wallDir === 1 ? this.px + this.pw : this.px,
            this.py + this.ph * 0.5,
            10,
            '#d8f3dc',
            150,
            -60
          );
        } else if (this.airJumpsRemaining > 0 && !this.grounded) {
          // 2.5 Monarch Double Jump
          this.airJumpsRemaining -= 1;
          this.pvy = cfg.jumpVelocity * 0.92;
          this.jumpBufferTimer = 0;
          this.squashX = 0.84;
          this.squashY = 1.22;
          this.anim.trigger('doubleJump', 0.28);
          soundEngine.playWallJump();
          this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.65, 16, '#a7f3d0', 180, -40);
        }
      }

      if (!inWater && input.jumpReleased && this.pvy < -80) {
        this.pvy *= cfg.jumpCutMultiplier;
      }
    }

    // 2.12 Special Attack (Silk Cyclone Nova + Soul Crescent Wave)
    if (input.specialAttackPressed && this.specialCooldownTimer <= 0) {
      this.executeSpecialAttack();
    } else if (input.attackPressed && this.attackCooldownTimer <= 0) {
      // 2.11 Directional Slash Attack
      let dir: SlashDirection = this.facing === 1 ? 'right' : 'left';
      if (input.upHeld) {
        dir = 'up';
      } else if (input.downHeld && !this.grounded) {
        dir = 'down';
      }
      this.startSlash(dir);
    }

    this.wasGrounded = this.grounded;
    this.moveAndCollide(dt);
    this.disturbNearbyRopes();

    const justLanded = this.grounded && !this.wasGrounded;
    if (this.grounded) {
      this.coyoteTimer = cfg.coyoteTime;
      this.airDashAvailable = true;
      this.airJumpsRemaining = 1;
      if (justLanded) {
        // 2.7 Landing Compression & Dust
        this.squashX = 1.28;
        this.squashY = 0.74;
        this.pogoChains = 0;
        soundEngine.playLand();
        this.depressMossBelow(1.0);
        this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph, 7, '#74c69d', 90, -25);
      }
      if (Math.abs(this.pvx) > 18) {
        const speedFactor = Math.abs(this.pvx) >= cfg.maxRunSpeed * 0.58 ? 15 : 10;
        this.runCycle += dt * speedFactor;
        this.footstepTimer -= dt;
        this.depressMossBelow(0.38);
        if (this.footstepTimer <= 0) {
          this.footstepTimer = speedFactor === 15 ? 0.22 : 0.32;
          this.spawnParticle(
            this.px + this.pw * 0.5 - this.facing * 6,
            this.py + this.ph - 1,
            -this.facing * 35,
            -18,
            2.2,
            0.22,
            '#52b788',
            80
          );
        }
      }
    }

    this.anim.update(dt, {
      vx: this.pvx,
      vy: this.pvy,
      grounded: this.grounded,
      wallSliding: this.wallSliding,
      dashing: this.dashTimer > 0,
      healing: this.healTimer > 0,
      maxRunSpeed: cfg.maxRunSpeed,
      justLanded,
    });

    if (this.grounded && this.isStandingSafe()) {
      this.safeGroundX = this.px;
      this.safeGroundY = this.py;
    }

    const playerRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    for (const thorn of this.world.thorns) {
      const insetThorn: Rect = {
        x: thorn.x + 4,
        y: thorn.y + 8,
        w: thorn.w - 8,
        h: thorn.h - 8,
      };
      if (rectsOverlap(playerRect, insetThorn)) {
        this.onThornHazardHit();
        break;
      }
    }
  }

  private disturbNearbyRopes(): void {
    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;
    if (Math.abs(this.pvx) < 25) return;
    for (const rope of this.world.hangingRopes) {
      const tipX = rope.x + Math.sin(rope.angle) * rope.length;
      if (Math.abs(pcx - tipX) < 22 && pcy >= rope.y && pcy <= rope.y + rope.length + 24) {
        rope.angVel += Math.sign(this.pvx) * 0.12;
      }
    }
  }

  private updateHangingRopes(dt: number): void {
    for (const rope of this.world.hangingRopes) {
      const wind = Math.sin(this.elapsedTime * 1.4 + rope.x * 0.01) * 0.18;
      const angAccel = -14 * Math.sin(rope.angle) - 2.4 * rope.angVel + wind;
      rope.angVel += angAccel * dt;
      rope.angle += rope.angVel * dt;
    }
  }

  private isStandingSafe(): boolean {
    const cx = this.px + this.pw * 0.5;
    const feetY = this.py + this.ph + 4;
    for (const p of this.world.platforms) {
      if (cx >= p.x + 18 && cx <= p.x + p.w - 18 && Math.abs(feetY - p.y) < 10) {
        return true;
      }
    }
    return false;
  }

  private getSolidColliders(): Rect[] {
    const solids: Rect[] = [...this.world.platforms];
    for (const sw of this.world.secretWalls) {
      if (!sw.broken) solids.push(sw);
    }
    return solids;
  }

  private moveAndCollide(dt: number): void {
    const solids = this.getSolidColliders();

    this.px += this.pvx * dt;
    this.wallDir = 0;
    const hRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    for (const p of solids) {
      if (!rectsOverlap(hRect, p)) continue;
      if (this.pvx > 0) {
        this.px = p.x - this.pw;
        this.pvx = 0;
        this.wallDir = 1;
      } else if (this.pvx < 0) {
        this.px = p.x + p.w;
        this.pvx = 0;
        this.wallDir = -1;
      }
      hRect.x = this.px;
    }

    if (this.wallDir === 0) {
      const probeRight: Rect = { x: this.px + this.pw, y: this.py + 6, w: 3, h: this.ph - 12 };
      const probeLeft: Rect = { x: this.px - 3, y: this.py + 6, w: 3, h: this.ph - 12 };
      for (const p of solids) {
        if (rectsOverlap(probeRight, p)) {
          this.wallDir = 1;
          break;
        }
        if (rectsOverlap(probeLeft, p)) {
          this.wallDir = -1;
          break;
        }
      }
    }

    this.py += this.pvy * dt;
    this.grounded = false;
    const vRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    for (const p of solids) {
      if (!rectsOverlap(vRect, p)) continue;
      if (this.pvy >= 0) {
        this.py = p.y - this.ph;
        this.pvy = 0;
        this.grounded = true;
      } else if (this.pvy < 0) {
        this.py = p.y + p.h;
        this.pvy = 0;
      }
      vRect.y = this.py;
    }
  }

  private depressMossBelow(strength: number): void {
    const cx = this.px + this.pw * 0.5;
    const feetY = this.py + this.ph;
    for (const m of this.world.mossTufts) {
      if (Math.abs(m.y - feetY) < 8 && cx >= m.x - 10 && cx <= m.x + m.w + 10) {
        m.compression = Math.min(1, Math.max(m.compression, strength));
      }
    }
  }

  private updateMossTufts(dt: number): void {
    const stiffness = 135;
    const damping = 9.5;
    for (const m of this.world.mossTufts) {
      if (m.compression === 0 && Math.abs(m.velocity) < 0.001) continue;
      const force = -stiffness * m.compression - damping * m.velocity;
      m.velocity += force * dt;
      m.compression += m.velocity * dt;
      if (Math.abs(m.compression) < 0.005 && Math.abs(m.velocity) < 0.01) {
        m.compression = 0;
        m.velocity = 0;
      }
    }
  }

  private updateSecretWalls(dt: number): void {
    for (const sw of this.world.secretWalls) {
      if (sw.hitFlash > 0) {
        sw.hitFlash = Math.max(0, sw.hitFlash - dt);
      }
    }
  }

  private updateMapDiscovery(): void {
    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;
    const room = findRoomAt(this.world.rooms, pcx, pcy);
    if (!room) return;

    let changed = false;
    if (this.currentRoomId !== room.id) {
      this.currentRoomId = room.id;
      changed = true;
    }
    if (!room.visited) {
      room.visited = true;
      room.discovered = true;
      changed = true;
    }
    for (const adjId of room.adjacentRoomIds) {
      const adj = this.world.rooms.find((r) => r.id === adjId);
      if (adj && !adj.isSecret && !adj.discovered) {
        adj.discovered = true;
        changed = true;
      }
    }
    if (changed) {
      this.mapVersion += 1;
    }
  }

  private startSlash(dir: SlashDirection): void {
    this.attackCooldownTimer = 0.24;
    this.slash.active = true;
    this.slash.dir = dir;
    this.slash.duration = 0.13;
    this.slash.timer = 0.13;
    this.slash.hitIds.clear();
    this.positionSlash();
    this.anim.trigger('attack', 0.16);
    const pitch = dir === 'up' ? 1.15 : dir === 'down' ? 0.92 : 1;
    soundEngine.playSlash(pitch);
  }

  private executeSpecialAttack(): void {
    this.specialCooldownTimer = 0.55;
    this.attackCooldownTimer = 0.26;
    this.invulnTimer = Math.max(this.invulnTimer, 0.22);
    this.anim.trigger('specialAttack', 0.34);
    this.triggerShake(6.5, 0.2);
    soundEngine.playPogo();
    soundEngine.playSlash(0.8);

    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;
    this.spawnBurst(pcx, pcy, 28, '#67e8f9', 260, -40);

    // 360-degree Silk Cyclone Nova (bypasses shields, deals 30 dmg)
    const novaBox: Rect = { x: pcx - 92, y: pcy - 76, w: 184, h: 152 };
    for (const enemy of this.world.enemies) {
      if (!enemy.alive) continue;
      if (rectsOverlap(novaBox, enemy)) {
        this.hitEnemy(enemy, 30, true);
      }
    }
    for (const sw of this.world.secretWalls) {
      if (sw.broken) continue;
      if (rectsOverlap(novaBox, sw)) {
        sw.hp = 0;
        sw.broken = true;
        this.essence += 50;
        soundEngine.playEnemyDefeat();
        this.spawnBurst(sw.x + sw.w * 0.5, sw.y + sw.h * 0.5, 30, '#95d5b2', 280, -60);
        const room = this.world.rooms.find((r) => r.id === sw.revealRoomId);
        if (room) {
          room.discovered = true;
          this.mapVersion += 1;
        }
        this.saveProgress();
      }
    }

    // Launch Soul Crescent Wave if >= 25 Soul (or empowered slash wave)
    if (this.soul >= 25) {
      this.soul -= 25;
      this.specialWaves.push({
        active: true,
        x: pcx + this.facing * 20,
        y: pcy,
        vx: this.facing * 640,
        facing: this.facing,
        life: 0.9,
        maxLife: 0.9,
        hitIds: new Set<string>(),
      });
    }
  }

  private updateSpecialWaves(dt: number): void {
    for (const wave of this.specialWaves) {
      if (!wave.active) continue;
      wave.life -= dt;
      wave.x += wave.vx * dt;
      if (wave.life <= 0) {
        wave.active = false;
        continue;
      }
      const box: Rect = { x: wave.x - 24, y: wave.y - 32, w: 48, h: 64 };
      for (const enemy of this.world.enemies) {
        if (!enemy.alive || wave.hitIds.has(enemy.id)) continue;
        if (rectsOverlap(box, enemy)) {
          wave.hitIds.add(enemy.id);
          this.hitEnemy(enemy, 25, true);
        }
      }
      for (const sw of this.world.secretWalls) {
        if (sw.broken || wave.hitIds.has(sw.id)) continue;
        if (rectsOverlap(box, sw)) {
          wave.hitIds.add(sw.id);
          sw.hp -= 1;
          sw.hitFlash = 0.14;
          if (sw.hp <= 0) {
            sw.broken = true;
            this.essence += 50;
            soundEngine.playEnemyDefeat();
            const room = this.world.rooms.find((r) => r.id === sw.revealRoomId);
            if (room) {
              room.discovered = true;
              this.mapVersion += 1;
            }
            this.saveProgress();
          }
        }
      }
    }
    if (this.specialWaves.length > 12) {
      this.specialWaves = this.specialWaves.filter((w) => w.active);
    }
  }

  private positionSlash(): void {
    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;
    if (this.slash.dir === 'right') {
      this.slash.x = pcx + 14;
      this.slash.y = pcy;
    } else if (this.slash.dir === 'left') {
      this.slash.x = pcx - 14;
      this.slash.y = pcy;
    } else if (this.slash.dir === 'up') {
      this.slash.x = pcx;
      this.slash.y = pcy - 16;
    } else {
      this.slash.x = pcx;
      this.slash.y = pcy + 16;
    }
  }

  private getSlashHitbox(): Rect {
    const { x, y, dir } = this.slash;
    if (dir === 'right') return { x: x - 6, y: y - 34, w: 68, h: 68 };
    if (dir === 'left') return { x: x - 62, y: y - 34, w: 68, h: 68 };
    if (dir === 'up') return { x: x - 34, y: y - 62, w: 68, h: 68 };
    return { x: x - 34, y: y - 6, w: 68, h: 68 };
  }

  private updateSlash(dt: number): void {
    if (!this.slash.active) return;
    this.slash.timer -= dt;
    this.positionSlash();

    const hitbox = this.getSlashHitbox();
    let triggeredPogo = false;

    // 1. Enemies
    for (const enemy of this.world.enemies) {
      if (!enemy.alive || this.slash.hitIds.has(enemy.id)) continue;
      if (rectsOverlap(hitbox, enemy)) {
        this.slash.hitIds.add(enemy.id);
        this.hitEnemy(enemy, 15, false);
        if (this.slash.dir === 'down') {
          triggeredPogo = true;
        }
      }
    }

    // 2. Breakable Secret Moss Walls
    for (const sw of this.world.secretWalls) {
      if (sw.broken || this.slash.hitIds.has(sw.id)) continue;
      if (rectsOverlap(hitbox, sw)) {
        this.slash.hitIds.add(sw.id);
        sw.hp -= 1;
        sw.hitFlash = 0.14;
        this.hitstopTimer = 0.045;
        this.triggerShake(5, 0.16);
        soundEngine.playHit();
        this.spawnBurst(sw.x + sw.w * 0.5, sw.y + sw.h * 0.5, 16, '#86efac', 220, -40);
        if (sw.hp <= 0) {
          sw.broken = true;
          this.essence += 50;
          this.hitstopTimer = 0.065;
          this.triggerShake(7.5, 0.24);
          soundEngine.playEnemyDefeat();
          this.spawnBurst(sw.x + sw.w * 0.5, sw.y + sw.h * 0.5, 34, '#95d5b2', 300, -60);
          const room = this.world.rooms.find((r) => r.id === sw.revealRoomId);
          if (room) {
            room.discovered = true;
            this.mapVersion += 1;
          }
          this.saveProgress();
        }
      }
    }

    // 3. Spore Bulbs & Pogo Pods
    for (const bulb of this.world.sporeBulbs) {
      if (!bulb.alive || this.slash.hitIds.has(bulb.id)) continue;
      if (circleIntersectsRect(bulb.x, bulb.y, bulb.radius + 6, hitbox)) {
        this.slash.hitIds.add(bulb.id);
        this.soul = Math.min(this.maxSoul, this.soul + (bulb.pogoPod ? 10 : 22));
        this.essence += bulb.pogoPod ? 5 : 15;
        this.spawnBurst(bulb.x, bulb.y, 16, '#86efac', 210, -40);
        if (bulb.pogoPod) {
          soundEngine.playPogo();
          if (this.slash.dir === 'down') {
            triggeredPogo = true;
          }
        } else {
          bulb.alive = false;
          bulb.respawnTimer = 10;
          soundEngine.playHit();
        }
      }
    }

    // 4. Sway Hanging Ropes when slashed
    for (const rope of this.world.hangingRopes) {
      const ropeBox: Rect = { x: rope.x - 16, y: rope.y, w: 32, h: rope.length };
      if (rectsOverlap(hitbox, ropeBox)) {
        rope.angVel += (this.slash.dir === 'left' ? -1 : 1) * 0.85;
      }
    }

    // 5. Pogo on Thorn Hazards
    if (this.slash.dir === 'down' && !this.slash.hitIds.has('thorn-pogo')) {
      for (const thorn of this.world.thorns) {
        if (rectsOverlap(hitbox, thorn)) {
          this.slash.hitIds.add('thorn-pogo');
          triggeredPogo = true;
          this.spawnBurst(this.px + this.pw * 0.5, thorn.y + 4, 12, '#e9d5ff', 190, -80);
          soundEngine.playPogo();
          break;
        }
      }
    }

    if (triggeredPogo) {
      this.executePogoBounce();
    }

    if (this.slash.timer <= 0) {
      this.slash.active = false;
    }
  }

  private executePogoBounce(): void {
    this.pvy = this.config.pogoVelocity;
    this.airDashAvailable = true;
    this.airJumpsRemaining = 1;
    this.dashTimer = 0;
    this.pogoChains += 1;
    this.squashX = 0.8;
    this.squashY = 1.24;
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
    this.triggerShake(4.5, 0.14);
  }

  private hitEnemy(enemy: Enemy, damage = 15, bypassShield = false): boolean {
    const pcx = this.px + this.pw * 0.5;
    const ecx = enemy.x + enemy.w * 0.5;
    const ecy = enemy.y + enemy.h * 0.5;

    const isHorizontalSlash = this.slash.dir === 'right' || this.slash.dir === 'left';
    const hittingFrontSide = (pcx < ecx && enemy.facing === -1) || (pcx > ecx && enemy.facing === 1);
    if (enemy.kind === 'shieldbearer' && enemy.shielded && !bypassShield && isHorizontalSlash && hittingFrontSide) {
      this.hitstopTimer = 0.035;
      this.triggerShake(3.5, 0.12);
      soundEngine.playPogo();
      this.spawnBurst(ecx + enemy.facing * 20, ecy, 10, '#e2e8f0', 220, -40);
      this.spawnFloatingText(ecx, enemy.y - 12, 'BLOCKED', '#cbd5e1');
      if (this.slash.dir === 'right') this.pvx = -230;
      else if (this.slash.dir === 'left') this.pvx = 230;
      return false;
    }

    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlash = 0.12;
    this.soul = Math.min(this.maxSoul, this.soul + 14);
    this.hitstopTimer = enemy.kind === 'warden' ? 0.06 : enemy.kind === 'shieldbearer' ? 0.05 : 0.042;
    this.triggerShake(enemy.kind === 'warden' ? 6.5 : enemy.kind === 'shieldbearer' ? 5.2 : 4.5, 0.16);
    soundEngine.playHit();

    this.spawnBurst(ecx, ecy, 14, '#fef08a', 240, -50);
    this.spawnFloatingText(
      ecx + (Math.random() - 0.5) * 14,
      enemy.y - 10,
      `-${damage}`,
      bypassShield ? '#67e8f9' : '#fef08a'
    );

    if (this.slash.dir === 'right') this.pvx = -170;
    else if (this.slash.dir === 'left') this.pvx = 170;

    if (enemy.kind === 'crawler') {
      enemy.vx = this.slash.dir === 'left' ? -130 : 130;
    }

    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.enemiesDefeated += 1;
      this.essence +=
        enemy.kind === 'warden' ? 150 : enemy.kind === 'shieldbearer' ? 60 : enemy.kind === 'flyer' ? 35 : 20;
      soundEngine.playEnemyDefeat();
      this.hitstopTimer = enemy.kind === 'warden' ? 0.09 : enemy.kind === 'shieldbearer' ? 0.07 : 0.055;
      this.triggerShake(enemy.kind === 'warden' ? 11 : enemy.kind === 'shieldbearer' ? 8 : 6, 0.25);
      this.spawnBurst(ecx, ecy, enemy.kind === 'warden' ? 42 : 24, '#6ee7b7', 310, -80);

      if (enemy.kind === 'warden') {
        this.bossDefeated = true;
        this.bossEngaged = false;
        for (const p of this.projectiles) p.active = false;
        for (const sw of this.shockwaves) sw.active = false;
      }
    }
    return true;
  }

  private updateEnemies(dt: number): void {
    const playerRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;

    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      if (e.kind === 'crawler') {
        this.updateCrawlerAI(e, dt);
      } else if (e.kind === 'flyer') {
        this.updateFlyerAI(e, dt, pcx, pcy);
      } else if (e.kind === 'shieldbearer') {
        this.updateShieldbearerAI(e, dt, pcx);
      } else {
        this.updateWardenBossAI(e, dt, pcx, pcy);
      }

      const enemyHitbox: Rect = {
        x: e.x + 4,
        y: e.y + 4,
        w: e.w - 8,
        h: e.h - 8,
      };
      if (rectsOverlap(playerRect, enemyHitbox)) {
        const ecx = e.x + e.w * 0.5;
        this.damagePlayer(pcx < ecx ? -1 : 1);
      }
    }
  }

  private updateCrawlerAI(e: Enemy, dt: number): void {
    const speed = 78;
    if (Math.abs(e.vx) < speed) {
      e.vx += (e.facing * speed - e.vx) * Math.min(1, dt * 6);
    }
    e.x += e.vx * dt;

    const probeX = e.facing === 1 ? e.x + e.w + 4 : e.x - 4;
    const wallProbe: Rect = { x: probeX, y: e.y + 6, w: 4, h: e.h - 12 };
    const edgeProbe: Rect = { x: probeX, y: e.y + e.h + 2, w: 6, h: 12 };

    let hitWall = false;
    let hasGroundAhead = false;
    for (const p of this.world.platforms) {
      if (rectsOverlap(wallProbe, p)) hitWall = true;
      if (rectsOverlap(edgeProbe, p)) hasGroundAhead = true;
    }

    if (hitWall || !hasGroundAhead) {
      e.facing = (-e.facing) as 1 | -1;
      e.vx = e.facing * speed;
      e.x += e.facing * 4;
    }
  }

  private updateFlyerAI(e: Enemy, dt: number, pcx: number, pcy: number): void {
    const ecx = e.x + e.w * 0.5;
    const ecy = e.y + e.h * 0.5;
    const dist = Math.hypot(pcx - ecx, pcy - ecy);

    if (e.aiState === 'FOLLOW') {
      e.stateTimer -= dt;
      const goalX = dist < 520 ? pcx : e.homeX + Math.sin(this.elapsedTime * 1.1 + e.animPhase) * 90;
      const goalY =
        dist < 520 ? pcy - 125 + Math.sin(this.elapsedTime * 3) * 14 : e.homeY + Math.cos(this.elapsedTime * 1.6) * 20;

      e.vx += (Math.max(-170, Math.min(170, (goalX - ecx) * 2.4)) - e.vx) * Math.min(1, dt * 4.5);
      e.vy += (Math.max(-150, Math.min(150, (goalY - ecy) * 2.4)) - e.vy) * Math.min(1, dt * 4.5);
      e.facing = pcx >= ecx ? 1 : -1;

      if (e.stateTimer <= 0 && dist < 390) {
        e.aiState = 'WINDUP';
        e.stateTimer = 0.42;
        e.targetX = pcx;
        e.targetY = pcy;
        e.vx *= 0.2;
        e.vy *= 0.2;
      }
    } else if (e.aiState === 'WINDUP') {
      e.stateTimer -= dt;
      e.vx *= 0.85;
      e.vy -= 30 * dt;
      if (e.stateTimer <= 0) {
        e.sporeWaveCount += 1;
        if (e.sporeWaveCount % 2 === 0 && dist > 140) {
          this.fireSingleSpore(ecx, ecy, pcx, pcy, 290);
          this.spawnBurst(ecx, ecy, 8, '#fdba74', 150, -30);
          e.aiState = 'RECOVER';
          e.stateTimer = 1.15;
          e.vx *= 0.2;
          e.vy = -30;
        } else {
          e.aiState = 'ATTACK';
          e.stateTimer = 0.48;
          const dx = e.targetX - ecx;
          const dy = e.targetY - ecy;
          const len = Math.max(1, Math.hypot(dx, dy));
          e.vx = (dx / len) * 440;
          e.vy = (dy / len) * 440;
        }
      }
    } else if (e.aiState === 'ATTACK') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.aiState = 'RECOVER';
        e.stateTimer = 1.35;
        e.vx *= 0.25;
        e.vy *= 0.25;
      }
    } else {
      e.stateTimer -= dt;
      e.vx *= 0.92;
      e.vy = Math.sin(this.elapsedTime * 5) * 18;
      if (e.stateTimer <= 0) {
        e.aiState = 'FOLLOW';
        e.stateTimer = 1.75;
      }
    }

    this.moveFlyerWithBounds(e, dt);
  }

  private updateShieldbearerAI(e: Enemy, dt: number, pcx: number): void {
    const ecx = e.x + e.w * 0.5;
    const distX = Math.abs(pcx - ecx);
    e.y = e.homeY;

    if (e.aiState === 'SHIELD') {
      e.shielded = true;
      e.stateTimer -= dt;
      e.facing = pcx >= ecx ? 1 : -1;
      e.vx = distX < 320 && distX > 46 ? e.facing * 52 : 0;
      if (e.stateTimer <= 0 || (distX < 130 && e.stateTimer < 0.9)) {
        e.aiState = 'FOLLOW';
        e.stateTimer = 0.75;
        e.shielded = false;
      }
    } else if (e.aiState === 'FOLLOW') {
      e.shielded = false;
      e.stateTimer -= dt;
      e.facing = pcx >= ecx ? 1 : -1;
      e.vx = distX < 360 && distX > 42 ? e.facing * 88 : 0;
      if (e.stateTimer <= 0 && distX < 280) {
        e.aiState = 'WINDUP';
        e.stateTimer = 0.55;
        e.vx = 0;
      } else if (e.stateTimer <= 0) {
        e.aiState = 'SHIELD';
        e.stateTimer = 1.4;
      }
    } else if (e.aiState === 'WINDUP') {
      e.shielded = false;
      e.vx = 0;
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.aiState = 'SLAM';
        e.stateTimer = 0.35;
        this.triggerShake(6.5, 0.2);
        soundEngine.playLand();
        this.spawnBurst(ecx, e.y + e.h - 4, 18, '#fbbf24', 220, -90);
        this.spawnShockwavePair(ecx, e.y + e.h, '#f59e0b', 280, 0.75);
      }
    } else if (e.aiState === 'SLAM') {
      e.shielded = false;
      e.vx = 0;
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.aiState = 'RECOVER';
        e.stateTimer = 0.95;
      }
    } else {
      e.shielded = false;
      e.vx = 0;
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.aiState = 'SHIELD';
        e.stateTimer = 1.45;
      }
    }

    e.x = Math.max(e.homeX - 95, Math.min(e.homeX + 95, e.x + e.vx * dt));
  }

  private updateWardenBossAI(e: Enemy, dt: number, pcx: number, pcy: number): void {
    const ecx = e.x + e.w * 0.5;
    const ecy = e.y + e.h * 0.5;

    if (!this.bossEngaged) {
      if (pcx > 3310 && pcy < 620) {
        this.bossEngaged = true;
      } else {
        e.vy = Math.sin(this.elapsedTime * 2) * 15;
        e.y += e.vy * dt;
        return;
      }
    }

    if (e.hp <= e.maxHp * 0.5 && e.phase !== 2) {
      e.phase = 2;
      this.triggerShake(10, 0.35);
      soundEngine.playEnemyDefeat();
      this.spawnBurst(ecx, ecy, 36, '#f43f5e', 300, -60);
      this.spawnFloatingText(ecx, e.y - 18, 'PHASE II', '#fb923c');
    }

    const isPhase2 = e.phase === 2;

    if (e.aiState === 'FOLLOW') {
      e.stateTimer -= dt;
      const hoverX = pcx + Math.sin(this.elapsedTime * (isPhase2 ? 1.85 : 1.4)) * 120;
      const hoverY = 245 + Math.sin(this.elapsedTime * 2.5) * 28;
      e.vx += (Math.max(-260, Math.min(260, (hoverX - ecx) * 2.7)) - e.vx) * Math.min(1, dt * 4);
      e.vy += (Math.max(-190, Math.min(190, (hoverY - ecy) * 2.8)) - e.vy) * Math.min(1, dt * 4);
      e.facing = pcx >= ecx ? 1 : -1;

      if (e.stateTimer <= 0) {
        e.sporeWaveCount += 1;
        e.aiState = 'WINDUP';
        e.stateTimer = isPhase2 ? 0.38 : 0.5;
        e.targetX = pcx;
        e.targetY = 475;
        e.vx = 0;
        e.vy = -65;
      }
    } else if (e.aiState === 'WINDUP') {
      e.stateTimer -= dt;
      e.vy *= 0.9;
      if (e.stateTimer <= 0) {
        if (isPhase2 && e.sporeWaveCount % 3 === 0) {
          e.aiState = 'SLAM';
          e.stateTimer = 0.7;
          e.vx = (pcx - ecx) * 1.4;
          e.vy = 780;
        } else if (e.sporeWaveCount % 2 === 0) {
          e.aiState = 'DASH';
          e.stateTimer = 0.56;
          e.facing = pcx >= ecx ? 1 : -1;
          e.vx = e.facing * (isPhase2 ? 710 : 580);
          e.vy = 0;
          soundEngine.playDash();
        } else {
          e.aiState = 'ATTACK';
          e.stateTimer = 0.55;
          const dx = e.targetX - ecx;
          const dy = e.targetY - ecy;
          const len = Math.max(1, Math.hypot(dx, dy));
          const spd = isPhase2 ? 640 : 560;
          e.vx = (dx / len) * spd;
          e.vy = (dy / len) * spd;
        }
      }
    } else if (e.aiState === 'DASH') {
      e.stateTimer -= dt;
      const targetDashY = 520 - e.h - 4;
      e.vy = (targetDashY - e.y) * 9;
      if (Math.random() < 0.45) {
        this.spawnParticle(ecx, ecy, -e.facing * 90, -20, 3.2, 0.22, isPhase2 ? '#fb923c' : '#7ae7ff', 0);
      }
      if (e.stateTimer <= 0 || e.x <= 3365 || e.x + e.w >= 4355) {
        e.aiState = 'RECOVER';
        e.stateTimer = isPhase2 ? 0.95 : 1.25;
        e.vx *= 0.2;
        e.vy = -80;
      }
    } else if (e.aiState === 'SLAM') {
      e.stateTimer -= dt;
      e.vx *= 0.9;
      e.vy = 780;
      if (e.y + e.h >= 516 || e.stateTimer <= 0) {
        e.y = 516 - e.h;
        e.vx = 0;
        e.vy = 0;
        e.aiState = 'RECOVER';
        e.stateTimer = 1.15;
        this.triggerShake(9.5, 0.28);
        soundEngine.playLand();
        this.spawnBurst(ecx, 515, 24, '#fb923c', 270, -100);
        this.spawnShockwavePair(ecx, 520, '#fb923c', 380, 1.35);
        this.fireSporeSpread(ecx, 490);
      }
    } else if (e.aiState === 'ATTACK') {
      e.stateTimer -= dt;
      if (e.y + e.h >= 516) {
        e.y = 516 - e.h;
        e.vy = 0;
        e.vx = 0;
        e.aiState = 'RECOVER';
        e.stateTimer = isPhase2 ? 1.1 : 1.45;
        this.triggerShake(7.5, 0.22);
        soundEngine.playLand();
        this.spawnBurst(ecx, 515, 18, '#fb923c', 230, -90);
        if (isPhase2) {
          this.spawnShockwavePair(ecx, 520, '#fb923c', 340, 1.1);
        }
        this.fireSporeSpread(ecx, 490);
      } else if (e.stateTimer <= 0) {
        e.aiState = 'RECOVER';
        e.stateTimer = isPhase2 ? 1.0 : 1.3;
        e.vx *= 0.2;
        e.vy *= 0.2;
      }
    } else {
      e.stateTimer -= dt;
      e.vx *= 0.9;
      e.vy = Math.sin(this.elapsedTime * 4) * 16;
      if (e.stateTimer <= 0) {
        e.aiState = 'FOLLOW';
        e.stateTimer = isPhase2 ? 1.05 : 1.65;
      }
    }

    this.moveFlyerWithBounds(e, dt);
  }

  private fireSingleSpore(ox: number, oy: number, tx: number, ty: number, speed: number): void {
    const dx = tx - ox;
    const dy = ty - oy;
    const len = Math.max(1, Math.hypot(dx, dy));
    for (const p of this.projectiles) {
      if (!p.active) {
        p.active = true;
        p.x = ox;
        p.y = oy;
        p.vx = (dx / len) * speed;
        p.vy = (dy / len) * speed - 65;
        p.radius = 6.5;
        p.life = 2.4;
        return;
      }
    }
  }

  private fireSporeSpread(ox: number, oy: number): void {
    const velocities = [
      { vx: -270, vy: -95 },
      { vx: 270, vy: -95 },
      { vx: -150, vy: -220 },
      { vx: 150, vy: -220 },
    ];
    for (const vel of velocities) {
      for (const p of this.projectiles) {
        if (!p.active) {
          p.active = true;
          p.x = ox;
          p.y = oy;
          p.vx = vel.vx;
          p.vy = vel.vy;
          p.radius = 7.5;
          p.life = 2.6;
          break;
        }
      }
    }
  }

  private spawnShockwavePair(cx: number, groundY: number, color: string, speed: number, life: number): void {
    const h = 24;
    const w = 28;
    for (const dir of [-1, 1] as const) {
      this.shockwaves.push({
        active: true,
        x: cx - w * 0.5 + dir * 16,
        y: groundY - h,
        vx: dir * speed,
        w,
        h,
        life,
        maxLife: life,
        color,
      });
    }
  }

  private updateShockwaves(dt: number): void {
    const playerRect: Rect = { x: this.px + 3, y: this.py + 3, w: this.pw - 6, h: this.ph - 6 };
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.life -= dt;
      sw.x += sw.vx * dt;
      if (sw.life <= 0) {
        sw.active = false;
        continue;
      }
      if (rectsOverlap(playerRect, sw)) {
        sw.active = false;
        this.damagePlayer(sw.vx >= 0 ? 1 : -1);
      }
    }
    if (this.shockwaves.length > 16) {
      this.shockwaves = this.shockwaves.filter((s) => s.active);
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      active: true,
      x,
      y,
      vy: -52,
      text,
      color,
      life: 0.72,
      maxLife: 0.72,
    });
  }

  private updateFloatingTexts(dt: number): void {
    for (const ft of this.floatingTexts) {
      if (!ft.active) continue;
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.94;
      if (ft.life <= 0) {
        ft.active = false;
      }
    }
    if (this.floatingTexts.length > 24) {
      this.floatingTexts = this.floatingTexts.filter((f) => f.active);
    }
  }

  private moveFlyerWithBounds(e: Enemy, dt: number): void {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const rect: Rect = { x: e.x, y: e.y, w: e.w, h: e.h };
    for (const p of this.world.platforms) {
      if (!rectsOverlap(rect, p)) continue;
      if (e.vy > 0) {
        e.y = p.y - e.h;
        e.vy = -Math.abs(e.vy) * 0.3;
      } else if (e.vy < 0) {
        e.y = p.y + p.h;
        e.vy = Math.abs(e.vy) * 0.3;
      }
      rect.y = e.y;
    }
    if (e.kind === 'warden') {
      e.x = Math.max(3360, Math.min(4360 - e.w, e.x));
      e.y = Math.max(150, Math.min(520 - e.h, e.y));
    }
  }

  private updateProjectiles(dt: number): void {
    const playerRect: Rect = { x: this.px + 3, y: this.py + 3, w: this.pw - 6, h: this.ph - 6 };
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 170 * dt;

      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (circleIntersectsRect(p.x, p.y, p.radius, playerRect)) {
        p.active = false;
        this.damagePlayer(this.px < p.x ? -1 : 1);
        continue;
      }
      for (const plat of this.world.platforms) {
        if (circleIntersectsRect(p.x, p.y, p.radius, plat)) {
          p.active = false;
          this.spawnBurst(p.x, p.y, 6, '#fdba74', 120, -20);
          break;
        }
      }
    }
  }

  private updateSporeBulbs(dt: number): void {
    for (const b of this.world.sporeBulbs) {
      if (!b.alive && b.respawnTimer > 0) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          b.alive = true;
        }
      }
    }
  }

  private updateRelics(): void {
    const playerRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    for (const relic of this.world.relics) {
      if (relic.collected) continue;
      if (circleIntersectsRect(relic.x, relic.y, 20, playerRect)) {
        relic.collected = true;
        this.collectedItemIds.add(relic.itemId);
        if (relic.itemId === 'relic-shell-shard') {
          this.maxHp += 1;
          this.hp = this.maxHp;
        } else {
          this.essence += 25;
        }
        soundEngine.playBench();
        this.spawnBurst(relic.x, relic.y, 26, relic.color, 230, -80);
        this.saveProgress();
      }
    }
  }

  private updateDialogueProximity(input: InputSnapshot): void {
    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;
    let closest: DialogueSpeaker | null = null;
    let bestDist = Infinity;

    for (const s of this.world.speakers) {
      const dx = Math.abs(pcx - s.x);
      const dy = Math.abs(pcy - (s.y - 24));
      if (dx < 76 && dy < 70 && dx < bestDist) {
        bestDist = dx;
        closest = s;
      }
    }

    this.nearbySpeaker = closest;
    if (closest && input.interactPressed) {
      this.interactWithNearbySpeaker();
    }
  }

  private updateBenches(): void {
    const playerRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    for (const bench of this.world.benches) {
      const zone: Rect = { x: bench.x - 36, y: bench.y - 48, w: 72, h: 48 };
      if (!bench.activated && rectsOverlap(playerRect, zone)) {
        bench.activated = true;
        this.respawnX = bench.x - this.pw * 0.5;
        this.respawnY = bench.y - this.ph;
        this.hp = this.maxHp;
        this.soul = Math.max(this.soul, 66);
        soundEngine.playBench();
        this.spawnBurst(bench.x, bench.y - 24, 24, '#a7f3d0', 220, -90);
        this.saveProgress();
      }
    }
  }

  private updateAltar(): void {
    if (!this.bossDefeated) return;
    const altarRect: Rect = {
      x: this.world.altarPos.x - 42,
      y: this.world.altarPos.y - 96,
      w: 84,
      h: 96,
    };
    const playerRect: Rect = { x: this.px, y: this.py, w: this.pw, h: this.ph };
    if (rectsOverlap(playerRect, altarRect)) {
      this.collectedItemIds.add('seal-ancient-silk');
      this.status = 'VICTORY';
      this.saveProgress();
      soundEngine.playVictory();
      soundEngine.stopAmbientDrone();
      this.emitHud(true);
    }
  }

  private beginDeathSequence(): void {
    this.hp = 0;
    this.dyingTimer = 0.85;
    this.pvx = 0;
    this.pvy = 0;
    this.dashTimer = 0;
    this.healTimer = 0;
    this.hitstopTimer = 0.08;
    this.anim.trigger('death', 0.85);
    this.triggerShake(11, 0.45);
    this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.5, 38, '#ecfdf5', 260, -110);
    this.emitHud(true);
  }

  private onThornHazardHit(): void {
    if (this.invulnTimer > 0 || this.dyingTimer > 0) return;
    this.hp -= 1;
    this.invulnTimer = 1.1;
    this.hitFlashTimer = 0.14;
    this.hitstopTimer = 0.06;
    this.triggerShake(8, 0.24);
    soundEngine.playDamage();

    if (this.hp <= 0) {
      this.beginDeathSequence();
      return;
    }

    this.anim.trigger('hurt', 0.26);
    this.px = this.safeGroundX;
    this.py = this.safeGroundY;
    this.pvx = 0;
    this.pvy = 0;
    this.dashTimer = 0;
    this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.5, 18, '#a7f3d0', 180, -40);
  }

  private damagePlayer(knockDir: -1 | 1): void {
    if (this.invulnTimer > 0 || this.dyingTimer > 0) return;
    this.hp -= 1;
    this.invulnTimer = 1.15;
    this.hitFlashTimer = 0.16;
    this.hitstopTimer = 0.065;
    this.dashTimer = 0;
    this.healTimer = 0;
    this.pvx = knockDir * 310;
    this.pvy = -330;
    this.wallJumpLockTimer = 0.16;
    this.triggerShake(9, 0.25);
    soundEngine.playDamage();
    this.spawnBurst(this.px + this.pw * 0.5, this.py + this.ph * 0.5, 22, '#fca5a5', 260, -70);

    if (this.hp <= 0) {
      this.beginDeathSequence();
    } else {
      this.anim.trigger('hurt', 0.26);
    }
  }

  private triggerShake(magnitude: number, duration: number): void {
    if (!this.screenShakeEnabled) return;
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    maxLife: number,
    color: string,
    gravity = 240
  ): void {
    for (const pt of this.particles) {
      if (!pt.active) {
        pt.active = true;
        pt.x = x;
        pt.y = y;
        pt.vx = vx;
        pt.vy = vy;
        pt.size = size;
        pt.life = maxLife;
        pt.maxLife = maxLife;
        pt.color = color;
        pt.gravity = gravity;
        return;
      }
    }
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
    biasVy: number
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.75);
      this.spawnParticle(
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd + biasVy,
        2.2 + Math.random() * 3,
        0.25 + Math.random() * 0.3,
        color,
        260
      );
    }
  }

  private spawnAfterImage(): void {
    for (const img of this.afterImages) {
      if (!img.active) {
        img.active = true;
        img.x = this.px;
        img.y = this.py;
        img.facing = this.facing;
        img.alpha = 0.85;
        return;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.vy += pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
  }

  private updateAfterImages(dt: number): void {
    for (const img of this.afterImages) {
      if (!img.active) continue;
      img.alpha -= dt * 4.5;
      if (img.alpha <= 0) {
        img.active = false;
      }
    }
  }

  private updateCamera(dt: number): void {
    const lookAheadX = this.facing * 85;
    const lookAheadY = Math.max(-55, Math.min(75, this.pvy * 0.08));
    const targetX = this.px + this.pw * 0.5 + lookAheadX - this.viewW * 0.5;
    const targetY = this.py + this.ph * 0.5 + lookAheadY - this.viewH * 0.52;

    const clampedX = Math.max(0, Math.min(this.world.width - this.viewW, targetX));
    const clampedY = Math.max(0, Math.min(this.world.height - this.viewH, targetY));

    this.camX += (clampedX - this.camX) * Math.min(1, dt * 6.5);
    this.camY += (clampedY - this.camY) * Math.min(1, dt * 5.8);
  }

  private render(): void {
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTime > 0) {
      const mag = this.shakeMag * (this.shakeTime / 0.25);
      shakeX = (Math.random() * 2 - 1) * mag;
      shakeY = (Math.random() * 2 - 1) * mag;
      if (this.shakeTime <= 0.02) this.shakeMag = 0;
    }

    const playerState: PlayerRenderState = {
      x: this.px,
      y: this.py,
      w: this.pw,
      h: this.ph,
      vx: this.pvx,
      vy: this.pvy,
      facing: this.facing,
      grounded: this.grounded,
      wallSliding: this.wallSliding,
      wallDir: this.wallDir,
      dashing: this.dashTimer > 0,
      healing: this.healTimer > 0,
      healProgress: this.healTimer > 0 ? 1 - this.healTimer / 0.36 : 0,
      invulnTimer: this.invulnTimer,
      squashX: this.squashX,
      squashY: this.squashY,
      runCycle: this.runCycle,
      hitFlash: this.hitFlashTimer,
      pose: this.anim.samplePose(this.elapsedTime, this.runCycle),
    };

    renderGameFrame(this.ctx, this.viewW, this.viewH, {
      time: this.elapsedTime,
      sceneTheme: this.sceneTheme,
      camX: this.camX,
      camY: this.camY,
      shakeX,
      shakeY,
      world: this.world,
      player: playerState,
      slash: this.slash,
      afterImages: this.afterImages,
      particles: this.particles,
      projectiles: this.projectiles,
      specialWaves: this.specialWaves,
      shockwaves: this.shockwaves,
      floatingTexts: this.floatingTexts,
      bossDefeated: this.bossDefeated,
      isTitleMode: this.status === 'TITLE_MENU',
    });
  }

  private getInventoryItems(): InventoryItem[] {
    return [
      {
        id: 'pale-needle',
        name: 'Pale Needle',
        category: 'Ability',
        description: 'Forged bone blade enabling directional 4-way slashes (J / X).',
        collected: true,
        equipped: true,
        icon: 'needle',
      },
      {
        id: 'pogo-art',
        name: 'Downward Pogo Art',
        category: 'Ability',
        description: 'Strike downward (S + J) on thorns, spore pods, and enemies to rebound upward.',
        collected: true,
        equipped: true,
        icon: 'crest',
      },
      {
        id: 'silk-dash',
        name: 'Silk Dash',
        category: 'Ability',
        description: '8-directional burst dash with brief i-frames (K / Shift). Resets on pogo & wall jump.',
        collected: true,
        equipped: true,
        icon: 'dash',
      },
      {
        id: 'focus-mend',
        name: 'Soul Focus Mend',
        category: 'Ability',
        description: 'Channel 33 Soul while grounded (F) to restore 1 shattered Mask.',
        collected: true,
        equipped: true,
        icon: 'focus',
      },
      {
        id: 'relic-mothscale',
        name: 'Mothscale Charm',
        category: 'Relic',
        description: 'Hidden in Canopy Sanctuary behind a cracked upper moss wall (+25 Essence).',
        collected: this.collectedItemIds.has('relic-mothscale'),
        equipped: this.collectedItemIds.has('relic-mothscale'),
        icon: 'relic',
      },
      {
        id: 'relic-shell-shard',
        name: 'Pale Shell Fragment',
        category: 'Relic',
        description: 'Hidden in the Forgotten Relic Vault beneath Misty Reed Marsh (+1 Max Mask).',
        collected: this.collectedItemIds.has('relic-shell-shard'),
        equipped: this.collectedItemIds.has('relic-shell-shard'),
        icon: 'crest',
      },
      {
        id: 'seal-ancient-silk',
        name: 'Ancient Silk Seal',
        category: 'Seal',
        description: "Claimed at the Sanctum Altar after vanquishing the Mosslight Warden.",
        collected: this.collectedItemIds.has('seal-ancient-silk'),
        equipped: this.collectedItemIds.has('seal-ancient-silk'),
        icon: 'seal',
      },
    ];
  }

  private emitHud(force: boolean): void {
    const boss = this.world.enemies.find((e) => e.kind === 'warden');
    const pcx = this.px + this.pw * 0.5;
    const pcy = this.py + this.ph * 0.5;
    const zoneName = getZoneName(pcx, pcy);
    const activeRoom = this.world.rooms.find((r) => r.id === this.currentRoomId) ?? this.world.rooms[0];

    const playerNormX = Math.max(0, Math.min(1, (pcx - activeRoom.x) / activeRoom.w));
    const playerNormY = Math.max(0, Math.min(1, (pcy - activeRoom.y) / activeRoom.h));
    const normBucketX = Math.round(playerNormX * 8);
    const normBucketY = Math.round(playerNormY * 8);

    const bossActive = Boolean(this.bossEngaged && boss && boss.alive);
    const bossHp = boss ? Math.max(0, boss.hp) : 0;
    const bossMaxHp = boss ? boss.maxHp : 240;
    const secs = Math.floor(this.runTime);
    const dashReady = this.dashCooldownTimer <= 0 && (this.grounded || this.airDashAvailable);
    const canHeal = this.soul >= 33 && this.hp < this.maxHp;
    const secretWallsBroken = this.world.secretWalls.filter((sw) => sw.broken).length;
    const totalSecretWalls = this.world.secretWalls.length;
    const inventoryKey = Array.from(this.collectedItemIds).sort().join(',');
    const speakerKey = this.nearbySpeaker?.id ?? '';
    const dialogueKey = this.activeDialogue ? `${this.activeDialogue.speakerName}:${this.activeDialogue.lineIndex}` : '';
    const hasSave = this.hasSaveData();

    const key = `${this.status}|${this.sceneTheme}|${this.hp}|${this.maxHp}|${this.soul}|${this.essence}|${zoneName}|${this.currentRoomId}|${this.mapVersion}|${normBucketX},${normBucketY}|${secretWallsBroken}|${bossActive}|${bossHp}|${secs}|${this.enemiesDefeated}|${this.pogoChains}|${dashReady}|${canHeal}|${inventoryKey}|${speakerKey}|${dialogueKey}|${hasSave}`;
    if (!force && key === this.lastHudKey) return;
    this.lastHudKey = key;

    this.onHudChange({
      status: this.status,
      sceneTheme: this.sceneTheme,
      hp: this.hp,
      maxHp: this.maxHp,
      soul: this.soul,
      maxSoul: this.maxSoul,
      essence: this.essence,
      zoneName,
      currentRoomId: this.currentRoomId,
      playerNormX,
      playerNormY,
      rooms: this.world.rooms.map((r) => ({ ...r })),
      secretWallsBroken,
      totalSecretWalls,
      bossActive,
      bossName: 'Mosslight Warden',
      bossHp,
      bossMaxHp,
      elapsedSeconds: secs,
      enemiesDefeated: this.enemiesDefeated,
      pogoChains: this.pogoChains,
      canHeal,
      dashReady,
      inventory: this.getInventoryItems(),
      nearbySpeaker: this.nearbySpeaker ? { ...this.nearbySpeaker } : null,
      activeDialogue: this.activeDialogue ? { ...this.activeDialogue } : null,
      hasSaveData: hasSave,
    });
  }

  public respawnAtCheckpoint(): void {
    this.hp = this.maxHp;
    this.soul = Math.max(this.soul, 33);
    this.px = this.respawnX;
    this.py = this.respawnY;
    this.pvx = 0;
    this.pvy = 0;
    this.dyingTimer = 0;
    this.airJumpsRemaining = 1;
    this.anim.reset();
    this.invulnTimer = 1.0;
    this.status = 'PLAYING';
    soundEngine.startAmbientDrone();
    this.emitHud(true);
  }
}
