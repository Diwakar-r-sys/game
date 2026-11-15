import type { RoomCell } from '../game/types';

interface MiniMapHudProps {
  rooms: RoomCell[];
  currentRoomId: string;
  playerNormX: number;
  playerNormY: number;
  onOpenFullMap: () => void;
}

export function MiniMapHud({
  rooms,
  currentRoomId,
  playerNormX,
  playerNormY,
  onOpenFullMap,
}: MiniMapHudProps) {
  const cellW = 28;
  const cellH = 22;
  const gap = 3;

  return (
    <button
      type="button"
      onClick={onOpenFullMap}
      className="pointer-events-auto group flex flex-col items-end rounded-lg border border-[#24443f] bg-[#061113]/92 p-2 text-left transition-colors hover:border-[#4c8f7d]"
      title="Open Full Cavern Map (M)"
      aria-label="Open Full Cavern Map"
    >
      <svg
        width={4 * (cellW + gap) - gap + 8}
        height={3 * (cellH + gap) - gap + 8}
        viewBox={`0 0 ${4 * (cellW + gap) - gap + 8} ${3 * (cellH + gap) - gap + 8}`}
        className="block"
      >
        {rooms.map((room) => {
          if (!room.discovered) return null;
          const x = 4 + room.gridX * (cellW + gap);
          const y = 4 + room.gridY * (cellH + gap);
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
                width={cellW}
                height={cellH}
                rx={2}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCurrent ? 1.6 : 1}
                strokeDasharray={room.visited ? undefined : '2 2'}
              />

              {/* Bench dot */}
              {room.hasBench && room.visited && (
                <rect x={x + 4} y={y + cellH - 6} width={5} height={3} fill="#95d5b2" />
              )}

              {/* Boss icon */}
              {room.isBossRoom && (
                <circle cx={x + cellW - 6} cy={y + 6} r={2.2} fill="#fbbf24" />
              )}

              {/* Player beacon */}
              {isCurrent && (
                <circle
                  cx={x + 4 + playerNormX * (cellW - 8)}
                  cy={y + 4 + playerNormY * (cellH - 8)}
                  r={3.2}
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
