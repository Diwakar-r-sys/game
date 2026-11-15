import type {
  AirStream,
  BenchCheckpoint,
  DialogueSpeaker,
  Enemy,
  FloatingMote,
  GlowLight,
  GodRay,
  HangingRope,
  LevelPreset,
  MossTuft,
  Platform,
  ReedProp,
  RoomCell,
  SecretWall,
  SporeBulb,
  ThornHazard,
  WaterVolume,
  WorldRelicPickup,
} from './types';

export interface WorldData {
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  platforms: Platform[];
  waterVolumes: WaterVolume[];
  airStreams: AirStream[];
  reedProps: ReedProp[];
  thorns: ThornHazard[];
  secretWalls: SecretWall[];
  hangingRopes: HangingRope[];
  glowLights: GlowLight[];
  mossTufts: MossTuft[];
  sporeBulbs: SporeBulb[];
  benches: BenchCheckpoint[];
  speakers: DialogueSpeaker[];
  relics: WorldRelicPickup[];
  enemies: Enemy[];
  godRays: GodRay[];
  motes: FloatingMote[];
  rooms: RoomCell[];
  altarPos: { x: number; y: number };
}

export const LEVEL_PRESETS: LevelPreset[] = [
  {
    id: 'room-threshold',
    name: 'Sunken Moss Pond',
    subtitle: 'Threshold caverns, stone bench & Elder Moth guide',
    spawnX: 160,
    spawnY: 860,
    recommendedTheme: 'grotto',
    difficulty: 'Entry',
  },
  {
    id: 'room-chasm',
    name: 'Thorn Chasm',
    subtitle: 'Spore pod pogo leaps over crimson thorn beds',
    spawnX: 1290,
    spawnY: 820,
    recommendedTheme: 'crystal',
    difficulty: 'Trial',
  },
  {
    id: 'room-shaft',
    name: 'Azure Silk Shaft',
    subtitle: 'Vertical luminous wind stream & wall-jump climb',
    spawnX: 2510,
    spawnY: 690,
    recommendedTheme: 'grotto',
    difficulty: 'Ascent',
  },
  {
    id: 'room-deep',
    name: 'Misty Reed Marsh',
    subtitle: 'Submerged marsh basin & Forgotten Relic Vault entrance',
    spawnX: 2375,
    spawnY: 1310,
    recommendedTheme: 'swamp',
    difficulty: 'Depths',
  },
  {
    id: 'room-sanctum',
    name: "Warden's Sanctum",
    subtitle: 'Face the Mosslight Warden & claim the Ancient Silk Seal',
    spawnX: 3250,
    spawnY: 330,
    recommendedTheme: 'crystal',
    difficulty: 'Boss',
  },
];

export function findRoomAt(rooms: RoomCell[], x: number, y: number): RoomCell | undefined {
  for (const r of rooms) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return r;
    }
  }
  return rooms[0];
}

export function getZoneName(x: number, y: number): string {
  if (x >= 3240 && y < 700) return "Warden's Sanctum";
  if (x >= 1840 && x < 2280 && y >= 1150) return 'Forgotten Relic Vault';
  if (x >= 2280 && y >= 1120) return 'Misty Reed Marsh';
  if (x >= 2020 && x < 2400 && y < 480) return 'Canopy Sanctuary';
  if (x >= 2400 && y < 500) return 'Verdant Summit';
  if (x >= 2480) return 'Azure Silk Shaft';
  if (x >= 1240) return 'Thorn Chasm';
  return 'Sunken Moss Pond';
}

export function createWorld(): WorldData {
  const platforms: Platform[] = [
    // Left boundary wall
    { id: 'bound-left', x: -80, y: 0, w: 100, h: 1580, kind: 'stone' },

    // === ZONE 1: Sunken Moss Pond (Screenshot 1 inspired) ===
    { id: 'z1-floor-1', x: 20, y: 920, w: 460, h: 320, kind: 'mossStone', mossTop: true },
    { id: 'z1-step-1', x: 320, y: 825, w: 145, h: 34, kind: 'floatingIsland', mossTop: true, hasSprout: true },
    // Submerged pond floor basin (x: 480..860, water surface at y=930)
    { id: 'z1-pond-bed', x: 480, y: 1065, w: 380, h: 175, kind: 'stone' },
    // Floating vector moss islands above the emerald pond (Screenshot 1!)
    { id: 'z1-float-1', x: 530, y: 805, w: 112, h: 32, kind: 'floatingIsland', mossTop: true, hasSprout: true },
    { id: 'z1-float-2', x: 700, y: 790, w: 108, h: 30, kind: 'floatingIsland', mossTop: true },
    { id: 'z1-floor-2', x: 860, y: 880, w: 380, h: 360, kind: 'mossStone', mossTop: true },
    { id: 'z1-high-1', x: 920, y: 735, w: 185, h: 28, kind: 'floatingIsland', mossTop: true, hasSprout: true },
    { id: 'z1-ceil-1', x: 0, y: 360, w: 1240, h: 120, kind: 'stone' },

    // === ZONE 2: Thorn Chasm (Pogo & Dash Trial) ===
    { id: 'z2-pit-floor', x: 1240, y: 1120, w: 1280, h: 100, kind: 'stone' },
    { id: 'z2-ledge-1', x: 1240, y: 880, w: 180, h: 240, kind: 'mossStone', mossTop: true },
    { id: 'z2-pillar-mid', x: 1750, y: 860, w: 150, h: 260, kind: 'mossStone', mossTop: true },
    { id: 'z2-high-perch', x: 1735, y: 690, w: 180, h: 28, kind: 'floatingIsland', mossTop: true, hasSprout: true },
    { id: 'z2-ledge-exit', x: 2280, y: 900, w: 360, h: 340, kind: 'mossStone', mossTop: true },
    { id: 'z2-ceil', x: 1240, y: 360, w: 780, h: 110, kind: 'stone' },

    // === SECRET ROOM (1,0): Canopy Sanctuary (Behind Secret Wall #2) ===
    { id: 'sec-canopy-ceil', x: 2000, y: 180, w: 480, h: 70, kind: 'stone' },
    { id: 'sec-canopy-wall-l', x: 2000, y: 250, w: 40, h: 240, kind: 'stone' },
    { id: 'sec-canopy-floor', x: 2040, y: 420, w: 360, h: 50, kind: 'mossStone', mossTop: true },

    // === ZONE 3: Azure Silk Shaft & Summit (Screenshot 2 inspired) ===
    { id: 'z3-wall-left-top', x: 2400, y: 180, w: 80, h: 130, kind: 'stone' },
    { id: 'z3-wall-left-bot', x: 2400, y: 420, w: 80, h: 370, kind: 'stone' },
    { id: 'z3-wall-right', x: 2820, y: 260, w: 90, h: 1260, kind: 'stone' },
    { id: 'z3-shelf-1', x: 2480, y: 740, w: 120, h: 28, kind: 'bridge', mossTop: true },
    { id: 'z3-shelf-2', x: 2690, y: 580, w: 130, h: 28, kind: 'bridge', mossTop: true },
    { id: 'z3-shelf-3', x: 2480, y: 420, w: 140, h: 28, kind: 'bridge', mossTop: true },
    { id: 'deep-step-1', x: 2685, y: 1210, w: 135, h: 28, kind: 'bridge', mossTop: true },
    { id: 'deep-step-2', x: 2560, y: 1050, w: 110, h: 28, kind: 'bridge', mossTop: true },
    { id: 'z3-summit', x: 2820, y: 260, w: 460, h: 80, kind: 'mossStone', mossTop: true },
    { id: 'z3-ceil', x: 2400, y: 40, w: 2150, h: 90, kind: 'stone' },

    // === MISTY REED MARSH (2,2) & SECRET RELIC VAULT (1,2) (Screenshot 3 inspired) ===
    // Submerged marsh bed at y=1445 with floating wooden/moss piers at y=1355
    { id: 'deep-floor', x: 2290, y: 1450, w: 540, h: 150, kind: 'stone' },
    { id: 'deep-pier-1', x: 2330, y: 1365, w: 170, h: 24, kind: 'bridge', mossTop: true },
    { id: 'deep-pier-2', x: 2590, y: 1345, w: 135, h: 24, kind: 'floatingIsland', mossTop: true },
    { id: 'deep-wall-left-top', x: 2260, y: 1120, w: 40, h: 120, kind: 'stone' },
    { id: 'sec-vault-ceil', x: 1840, y: 1160, w: 460, h: 80, kind: 'stone' },
    { id: 'sec-vault-wall-l', x: 1840, y: 1240, w: 44, h: 260, kind: 'stone' },
    { id: 'sec-vault-floor', x: 1884, y: 1380, w: 416, h: 140, kind: 'mossStone', mossTop: true },

    // === ZONE 4: Warden's Sanctum (Boss Arena) ===
    { id: 'z4-entry-step', x: 3200, y: 390, w: 160, h: 130, kind: 'mossStone', mossTop: true },
    { id: 'z4-arena-floor', x: 3200, y: 520, w: 1280, h: 420, kind: 'mossStone', mossTop: true },
    { id: 'z4-perch-left', x: 3420, y: 385, w: 160, h: 24, kind: 'bridge', mossTop: true },
    { id: 'z4-perch-right', x: 4040, y: 385, w: 160, h: 24, kind: 'bridge', mossTop: true },
    { id: 'bound-right', x: 4460, y: 40, w: 120, h: 900, kind: 'stone' },
  ];

  const waterVolumes: WaterVolume[] = [
    // Luminous Emerald Moss Pond (Screenshot 1)
    {
      id: 'water-moss-pond',
      x: 480,
      y: 938,
      w: 380,
      h: 130,
      tint: 'emerald',
      lilypadXs: [520, 610, 705, 795],
    },
    // Misty Reed Marsh Basin (Screenshot 3)
    {
      id: 'water-reed-marsh',
      x: 2290,
      y: 1382,
      w: 530,
      h: 72,
      tint: 'marsh',
      lilypadXs: [2360, 2480, 2555, 2740],
    },
  ];

  const airStreams: AirStream[] = [
    // Luminous Azure Vertical Silk Stream inside Verdant Shaft (Screenshot 2)
    {
      id: 'stream-azure-shaft',
      x: 2610,
      y: 180,
      w: 96,
      h: 980,
      liftForce: 1950,
    },
  ];

  const reedProps: ReedProp[] = [
    // Midground lily stems & cattails (Screenshot 1 & 3)
    { x: 505, y: 940, height: 95, layer: 'mid', kind: 'lilyStem', phase: 0.2 },
    { x: 830, y: 940, height: 110, layer: 'mid', kind: 'lilyStem', phase: 1.5 },
    { x: 1090, y: 880, height: 90, layer: 'mid', kind: 'cattail', phase: 0.7 },
    { x: 2345, y: 1385, height: 115, layer: 'mid', kind: 'cattail', phase: 1.1 },
    { x: 2530, y: 1385, height: 95, layer: 'mid', kind: 'cattail', phase: 2.3 },
    { x: 2660, y: 1345, height: 105, layer: 'mid', kind: 'ringPost', phase: 0.0 },
    // Dark Foreground Silhouettes passing close to camera lens (Screenshot 1 & 3)
    { x: 760, y: 1010, height: 130, layer: 'fore', kind: 'lilyStem', phase: 0.5 },
    { x: 2440, y: 1455, height: 160, layer: 'fore', kind: 'ringPost', phase: 0.0 },
    { x: 2770, y: 1465, height: 145, layer: 'fore', kind: 'cattail', phase: 1.8 },
  ];

  const thorns: ThornHazard[] = [
    { id: 'thorn-z2-a', x: 1420, y: 1088, w: 330, h: 32, orientation: 'up' },
    { id: 'thorn-z2-b', x: 1900, y: 1088, w: 380, h: 32, orientation: 'up' },
  ];

  const secretWalls: SecretWall[] = [
    {
      id: 'secret-wall-canopy',
      x: 2400,
      y: 310,
      w: 36,
      h: 110,
      hp: 2,
      maxHp: 2,
      broken: false,
      hitFlash: 0,
      revealRoomId: 'room-canopy',
    },
    {
      id: 'secret-wall-vault',
      x: 2260,
      y: 1240,
      w: 36,
      h: 140,
      hp: 2,
      maxHp: 2,
      broken: false,
      hitFlash: 0,
      revealRoomId: 'room-vault',
    },
  ];

  const hangingRopes: HangingRope[] = [
    { id: 'rope-1', x: 260, y: 480, length: 180, angle: 0.04, angVel: 0 },
    { id: 'rope-2', x: 610, y: 480, length: 150, angle: -0.03, angVel: 0 },
    { id: 'rope-3', x: 960, y: 768, length: 105, angle: 0.02, angVel: 0 },
    { id: 'rope-4', x: 1825, y: 718, length: 135, angle: -0.02, angVel: 0 },
    { id: 'rope-5', x: 2620, y: 130, length: 210, angle: 0.03, angVel: 0 },
    { id: 'rope-6', x: 2740, y: 1238, length: 130, angle: 0.02, angVel: 0 },
    { id: 'rope-7', x: 3500, y: 130, length: 180, angle: -0.03, angVel: 0 },
    { id: 'rope-8', x: 4120, y: 130, length: 170, angle: 0.04, angVel: 0 },
  ];

  const glowLights: GlowLight[] = [
    // Teal & Emerald Bioluminescent Essence Points
    { x: 190, y: 860, radius: 190, color: 'teal', phase: 0.2 },
    { x: 1120, y: 830, radius: 220, color: 'emerald', phase: 1.4 },
    { x: 1825, y: 650, radius: 230, color: 'teal', phase: 2.1 },
    { x: 2160, y: 360, radius: 240, color: 'emerald', phase: 0.9 },
    { x: 2940, y: 210, radius: 220, color: 'teal', phase: 1.7 },
    { x: 2040, y: 1320, radius: 260, color: 'amber', phase: 0.5 },
    { x: 3880, y: 420, radius: 310, color: 'emerald', phase: 2.8 },
    // Drifting Amber Fireflies (Atmospheric Layer -2 & 0)
    { x: 410, y: 770, radius: 75, color: 'amber', phase: 0.1, isFirefly: true, driftRadius: 28 },
    { x: 890, y: 690, radius: 80, color: 'amber', phase: 1.6, isFirefly: true, driftRadius: 34 },
    { x: 1580, y: 820, radius: 85, color: 'amber', phase: 2.3, isFirefly: true, driftRadius: 30 },
    { x: 2560, y: 1290, radius: 90, color: 'amber', phase: 0.8, isFirefly: true, driftRadius: 40 },
    { x: 2680, y: 1150, radius: 85, color: 'amber', phase: 2.9, isFirefly: true, driftRadius: 32 },
    { x: 2630, y: 500, radius: 85, color: 'amber', phase: 1.2, isFirefly: true, driftRadius: 30 },
    { x: 3550, y: 330, radius: 95, color: 'amber', phase: 3.1, isFirefly: true, driftRadius: 36 },
    { x: 4080, y: 340, radius: 95, color: 'amber', phase: 1.9, isFirefly: true, driftRadius: 36 },
  ];

  // Generate springy moss tufts along moss-topped platforms
  const mossTufts: MossTuft[] = [];
  for (const p of platforms) {
    if (!p.mossTop) continue;
    const count = Math.floor(p.w / 32);
    for (let i = 0; i < count; i++) {
      mossTufts.push({
        x: p.x + 8 + i * 32,
        y: p.y,
        w: 26,
        compression: 0,
        velocity: 0,
        hueShift: ((i * 19 + p.x) % 24) - 12,
      });
    }
  }

  const sporeBulbs: SporeBulb[] = [
    { id: 'bulb-1', x: 425, y: 785, radius: 16, alive: true, respawnTimer: 0, pogoPod: false, swayPhase: 0.4 },
    { id: 'bulb-2', x: 960, y: 690, radius: 17, alive: true, respawnTimer: 0, pogoPod: false, swayPhase: 1.7 },
    { id: 'pogo-1', x: 1525, y: 895, radius: 22, alive: true, respawnTimer: 0, pogoPod: true, swayPhase: 0.2 },
    { id: 'pogo-2', x: 1645, y: 865, radius: 22, alive: true, respawnTimer: 0, pogoPod: true, swayPhase: 1.4 },
    { id: 'pogo-3', x: 2025, y: 895, radius: 22, alive: true, respawnTimer: 0, pogoPod: true, swayPhase: 2.3 },
    { id: 'pogo-4', x: 2155, y: 865, radius: 22, alive: true, respawnTimer: 0, pogoPod: true, swayPhase: 3.1 },
    { id: 'bulb-3', x: 1825, y: 645, radius: 18, alive: true, respawnTimer: 0, pogoPod: false, swayPhase: 2.8 },
    { id: 'bulb-4', x: 3020, y: 215, radius: 17, alive: true, respawnTimer: 0, pogoPod: false, swayPhase: 0.9 },
    // Secret Room Soul Caches
    { id: 'bulb-sec-canopy', x: 2160, y: 365, radius: 21, alive: true, respawnTimer: 0, pogoPod: false, swayPhase: 1.1 },
    { id: 'bulb-sec-vault', x: 2030, y: 1320, radius: 22, alive: true, respawnTimer: 0, pogoPod: false, swayPhase: 2.0 },
  ];

  const benches: BenchCheckpoint[] = [
    { id: 'bench-1', x: 1120, y: 880, activated: false, zoneName: 'Sunken Threshold' },
    { id: 'bench-2', x: 2940, y: 260, activated: false, zoneName: 'Verdant Summit' },
  ];

  const enemies: Enemy[] = [
    {
      id: 'crawler-1',
      kind: 'crawler',
      x: 520,
      y: 888,
      w: 38,
      h: 32,
      vx: 72,
      vy: 0,
      hp: 45,
      maxHp: 45,
      facing: 1,
      aiState: 'FOLLOW',
      stateTimer: 0,
      targetX: 0,
      targetY: 0,
      homeX: 520,
      homeY: 888,
      hitFlash: 0,
      alive: true,
      animPhase: 0,
      sporeWaveCount: 0,
    },
    {
      id: 'crawler-2',
      kind: 'crawler',
      x: 960,
      y: 848,
      w: 38,
      h: 32,
      vx: -78,
      vy: 0,
      hp: 45,
      maxHp: 45,
      facing: -1,
      aiState: 'FOLLOW',
      stateTimer: 0,
      targetX: 0,
      targetY: 0,
      homeX: 960,
      homeY: 848,
      hitFlash: 0,
      alive: true,
      animPhase: 1.5,
      sporeWaveCount: 0,
    },
    {
      id: 'flyer-1',
      kind: 'flyer',
      x: 1825,
      y: 620,
      w: 38,
      h: 34,
      vx: 0,
      vy: 0,
      hp: 60,
      maxHp: 60,
      facing: -1,
      aiState: 'FOLLOW',
      stateTimer: 1.8,
      targetX: 1825,
      targetY: 620,
      homeX: 1825,
      homeY: 620,
      hitFlash: 0,
      alive: true,
      animPhase: 0.7,
      sporeWaveCount: 0,
    },
    {
      id: 'shieldbearer-chasm',
      kind: 'shieldbearer',
      x: 2410,
      y: 836,
      w: 56,
      h: 64,
      vx: 0,
      vy: 0,
      hp: 90,
      maxHp: 90,
      facing: -1,
      aiState: 'SHIELD',
      stateTimer: 1.6,
      targetX: 2410,
      targetY: 836,
      homeX: 2410,
      homeY: 836,
      hitFlash: 0,
      alive: true,
      animPhase: 0.4,
      sporeWaveCount: 0,
      shielded: true,
    },
    {
      id: 'crawler-deep',
      kind: 'crawler',
      x: 2460,
      y: 1348,
      w: 38,
      h: 32,
      vx: 86,
      vy: 0,
      hp: 45,
      maxHp: 45,
      facing: 1,
      aiState: 'FOLLOW',
      stateTimer: 0,
      targetX: 0,
      targetY: 0,
      homeX: 2460,
      homeY: 1348,
      hitFlash: 0,
      alive: true,
      animPhase: 0.9,
      sporeWaveCount: 0,
    },
    {
      id: 'flyer-2',
      kind: 'flyer',
      x: 2660,
      y: 440,
      w: 38,
      h: 34,
      vx: 0,
      vy: 0,
      hp: 60,
      maxHp: 60,
      facing: -1,
      aiState: 'FOLLOW',
      stateTimer: 2.0,
      targetX: 2660,
      targetY: 440,
      homeX: 2660,
      homeY: 440,
      hitFlash: 0,
      alive: true,
      animPhase: 1.9,
      sporeWaveCount: 0,
    },
    {
      id: 'shieldbearer-summit',
      kind: 'shieldbearer',
      x: 3110,
      y: 196,
      w: 56,
      h: 64,
      vx: 0,
      vy: 0,
      hp: 90,
      maxHp: 90,
      facing: -1,
      aiState: 'FOLLOW',
      stateTimer: 1.4,
      targetX: 3110,
      targetY: 196,
      homeX: 3110,
      homeY: 196,
      hitFlash: 0,
      alive: true,
      animPhase: 1.1,
      sporeWaveCount: 0,
      shielded: false,
    },
    {
      id: 'warden-boss',
      kind: 'warden',
      x: 3920,
      y: 320,
      w: 76,
      h: 72,
      vx: 0,
      vy: 0,
      hp: 240,
      maxHp: 240,
      facing: -1,
      aiState: 'FOLLOW',
      stateTimer: 1.8,
      targetX: 3920,
      targetY: 320,
      homeX: 3880,
      homeY: 320,
      hitFlash: 0,
      alive: true,
      animPhase: 0,
      sporeWaveCount: 0,
      phase: 1,
    },
  ];

  const godRays: GodRay[] = [
    { x: 240, width: 150, angle: 0.22, alpha: 0.095, phase: 0.0, speed: 0.45 },
    { x: 640, width: 110, angle: 0.18, alpha: 0.075, phase: 1.4, speed: 0.35 },
    { x: 1060, width: 170, angle: 0.24, alpha: 0.09, phase: 2.1, speed: 0.4 },
    { x: 1580, width: 190, angle: 0.2, alpha: 0.105, phase: 0.7, speed: 0.5 },
    { x: 2080, width: 140, angle: 0.21, alpha: 0.085, phase: 3.3, speed: 0.38 },
    { x: 2640, width: 180, angle: 0.14, alpha: 0.115, phase: 1.1, speed: 0.48 },
    { x: 3560, width: 210, angle: 0.19, alpha: 0.105, phase: 2.5, speed: 0.42 },
    { x: 4050, width: 175, angle: 0.22, alpha: 0.095, phase: 0.3, speed: 0.36 },
  ];

  const motes: FloatingMote[] = [];
  for (let i = 0; i < 120; i++) {
    motes.push({
      x: (i * 197) % 4500,
      y: 120 + ((i * 313) % 1320),
      radius: 1.2 + (i % 4) * 0.65,
      depth: 0.25 + (i % 5) * 0.22,
      phase: i * 0.61,
      speedY: 8 + (i % 6) * 4,
      driftX: 10 + (i % 5) * 5,
    });
  }

  // Grid-Based Metroidvania Room Graph
  const rooms: RoomCell[] = [
    {
      id: 'room-threshold',
      name: 'Sunken Moss Pond',
      gridX: 0,
      gridY: 1,
      x: 0,
      y: 360,
      w: 1240,
      h: 880,
      discovered: true,
      visited: true,
      hasBench: true,
      connections: ['E'],
      adjacentRoomIds: ['room-chasm'],
    },
    {
      id: 'room-chasm',
      name: 'Thorn Chasm',
      gridX: 1,
      gridY: 1,
      x: 1240,
      y: 360,
      w: 1240,
      h: 840,
      discovered: true,
      visited: false,
      connections: ['W', 'E'],
      adjacentRoomIds: ['room-threshold', 'room-shaft'],
    },
    {
      id: 'room-shaft',
      name: 'Azure Silk Shaft',
      gridX: 2,
      gridY: 1,
      x: 2480,
      y: 500,
      w: 430,
      h: 620,
      discovered: false,
      visited: false,
      connections: ['W', 'N', 'S'],
      adjacentRoomIds: ['room-chasm', 'room-summit', 'room-deep'],
    },
    {
      id: 'room-deep',
      name: 'Misty Reed Marsh',
      gridX: 2,
      gridY: 2,
      x: 2280,
      y: 1120,
      w: 630,
      h: 460,
      discovered: false,
      visited: false,
      connections: ['N', 'W'],
      adjacentRoomIds: ['room-shaft'],
    },
    {
      id: 'room-vault',
      name: 'Forgotten Relic Vault',
      gridX: 1,
      gridY: 2,
      x: 1840,
      y: 1160,
      w: 440,
      h: 380,
      discovered: false,
      visited: false,
      isSecret: true,
      connections: ['E'],
      adjacentRoomIds: ['room-deep'],
    },
    {
      id: 'room-summit',
      name: 'Verdant Summit',
      gridX: 2,
      gridY: 0,
      x: 2400,
      y: 40,
      w: 840,
      h: 460,
      discovered: false,
      visited: false,
      hasBench: true,
      connections: ['S', 'W', 'E'],
      adjacentRoomIds: ['room-shaft', 'room-sanctum'],
    },
    {
      id: 'room-canopy',
      name: 'Canopy Sanctuary',
      gridX: 1,
      gridY: 0,
      x: 2000,
      y: 180,
      w: 400,
      h: 300,
      discovered: false,
      visited: false,
      isSecret: true,
      connections: ['E'],
      adjacentRoomIds: ['room-summit'],
    },
    {
      id: 'room-sanctum',
      name: "Warden's Sanctum",
      gridX: 3,
      gridY: 0,
      x: 3240,
      y: 40,
      w: 1340,
      h: 900,
      discovered: false,
      visited: false,
      isBossRoom: true,
      connections: ['W'],
      adjacentRoomIds: ['room-summit'],
    },
  ];

  const speakers: DialogueSpeaker[] = [
    {
      id: 'npc-elder-moth',
      name: 'Elder Moth',
      title: 'Keeper of the Threshold',
      x: 265,
      y: 920,
      read: false,
      lines: [
        'Awaken, Pale Vessel. The bioluminescent moss still remembers the step of travelers.',
        'Strike downward in mid-air (S + J) to pogo across spore pods and thorn beds without losing stride.',
        'Shatter cracked moss walls to uncover hidden relic sanctuaries, and rest at stone benches to bind your progress.',
      ],
    },
    {
      id: 'npc-hermit',
      name: 'Reed Hermit',
      title: 'Watcher of the Deep Marsh',
      x: 2420,
      y: 1365,
      read: false,
      lines: [
        'Few descend below the Azure Silk Shaft and return with masks intact.',
        'Listen closely to the left cavern wall — a cracked moss seal guards the Forgotten Relic Vault.',
      ],
    },
    {
      id: 'lore-summit-tablet',
      name: 'Mossbound Tablet',
      title: 'Sanctum Decree',
      x: 2920,
      y: 260,
      read: false,
      lines: [
        'Beyond this threshold broods the Mosslight Warden. Watch for its golden windup before diving.',
        'Strike foes to fill your Soul Vessel, then press F to Focus and mend shattered masks.',
      ],
    },
  ];

  const relics: WorldRelicPickup[] = [
    {
      id: 'relic-pickup-canopy',
      itemId: 'relic-mothscale',
      x: 2180,
      y: 390,
      collected: false,
      color: '#67e8f9',
    },
    {
      id: 'relic-pickup-vault',
      itemId: 'relic-shell-shard',
      x: 1980,
      y: 1350,
      collected: false,
      color: '#a7f3d0',
    },
  ];

  return {
    width: 4580,
    height: 1580,
    spawnX: 160,
    spawnY: 860,
    platforms,
    waterVolumes,
    airStreams,
    reedProps,
    thorns,
    secretWalls,
    hangingRopes,
    glowLights,
    mossTufts,
    sporeBulbs,
    benches,
    speakers,
    relics,
    enemies,
    godRays,
    motes,
    rooms,
    altarPos: { x: 4320, y: 520 },
  };
}
