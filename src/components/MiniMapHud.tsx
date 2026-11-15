import type { RoomCell } from '../game/types';

interface MiniMapHudProps {
  rooms: RoomCell[];
  currentRoomId: string;
  worldWidth: number;
  worldHeight: number;
  playerNormX: number;
  playerNormY: number;
  onOpenFullMap: () => void;
}

export function MiniMapHud({
  rooms,
  currentRoomId,
  worldWidth,
  worldHeight,
  playerNormX,
  playerNormY,
  onOpenFullMap,
}: MiniMapHudProps) {
  const svgW = 132;
  const svgH = 78;
  const pad = 6;
  const safeW = Math.max(1, worldWidth || 2800);
  const safeH = Math.max(1, worldHeight || 2100);
  const scale = Math.min((svgW - pad * 2) / safeW, (svgH - pad * 2) / safeH);
  const offsetX = (svgW - safeW * scale) * 0.5;
  const offsetY = (svgH - safeH * scale) * 0.5;

  const toRect = (room: RoomCell) => ({
    x: offsetX + room.x * scale,
    y: offsetY + room.y * scale,
    w: Math.max(10, room.w * scale - 1.5),
    h: Math.max(8, room.h * scale - 1.5),
  });

  const renderedConnectors = new Set<string>();

  return (
    <button
      type="button"
      onClick={onOpenFullMap}
      className="pointer-events-auto group flex flex-col items-end rounded-lg border border-[#24443f] bg-[#061113]/92 p-2 text-left transition-colors hover:border-[#4c8f7d]"
      title="Open Full Cavern Map (M)"
      aria-label="Open Full Cavern Map"
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="block"
      >
        {/* Interconnected Passage Lines */}
        {rooms.map((room) => {
          if (!room.discovered) return null;
          const a = toRect(room);
          const ax = a.x + a.w * 0.5;
          const ay = a.y + a.h * 0.5;
          return room.adjacentRoomIds.map((adjId) => {
            const pairKey = room.id < adjId ? `${room.id}:${adjId}` : `${adjId}:${room.id}`;
            if (renderedConnectors.has(pairKey)) return null;
            const adj = rooms.find((r) => r.id === adjId);
            if (!adj || !adj.discovered) return null;
            renderedConnectors.add(pairKey);
            const b = toRect(adj);
            return (
              <line
                key={pairKey}
                x1={ax}
                y1={ay}
                x2={b.x + b.w * 0.5}
                y2={b.y + b.h * 0.5}
                stroke={room.visited || adj.visited ? '#2f6a54' : '#1b3833'}
                strokeWidth={2}
              />
            );
          });
        })}

        {/* Proportional Room Polygons */}
        {rooms.map((room) => {
          if (!room.discovered) return null;
          const { x, y, w, h } = toRect(room);
          const isCurrent = room.id === currentRoomId;

          const fill = room.visited
            ? isCurrent
              ? '#1e4d42'
              : room.isSecret
              ? '#183d46'
              : '#112e2a'
            : '#0a1c1d';

          const stroke = isCurrent
            ? '#a7f3d0'
            : room.isBossRoom
            ? '#f59e0b'
            : room.visited
            ? '#40916c'
            : '#284a44';

          return (
            <g key={room.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={1.5}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCurrent ? 1.5 : 1}
                strokeDasharray={room.visited ? undefined : '2 2'}
              />

              {/* Bench dot */}
              {room.hasBench && room.visited && (
                <rect x={x + 2.5} y={y + h - 4.5} width={4} height={2.5} fill="#95d5b2" />
              )}

              {/* Boss icon */}
              {room.isBossRoom && (
                <circle cx={x + w - 4} cy={y + 4} r={2} fill="#fbbf24" />
              )}

              {/* Player beacon */}
              {isCurrent && (
                <circle
                  cx={x + 2 + playerNormX * Math.max(1, w - 4)}
                  cy={y + 2 + playerNormY * Math.max(1, h - 4)}
                  r={3}
                  fill="#ecfdf5"
                  stroke="#04100d"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex w-full items-center justify-between text-[10px] text-[#83a69b] group-hover:text-[#cbe5dc]">
        <span>Map</span>
        <span className="font-mono-code">M</span>
      </div>
    </button>
  );
}
