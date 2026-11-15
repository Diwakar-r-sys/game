import { useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Compass, Crosshair, Minus, Plus, X } from 'lucide-react';
import type { RoomCell } from '../game/types';

interface WorldMapModalProps {
  open: boolean;
  rooms: RoomCell[];
  currentRoomId: string;
  playerNormX: number;
  playerNormY: number;
  secretWallsBroken: number;
  totalSecretWalls: number;
  onClose: () => void;
}

export function WorldMapModal({
  open,
  rooms,
  currentRoomId,
  playerNormX,
  playerNormY,
  secretWallsBroken,
  totalSecretWalls,
  onClose,
}: WorldMapModalProps) {
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  if (!open) return null;

  const visitedCount = rooms.filter((r) => r.visited).length;
  const inspectedRoom =
    rooms.find((r) => r.id === (selectedRoomId ?? currentRoomId) && r.discovered) ??
    rooms.find((r) => r.id === currentRoomId);

  const cellW = 136;
  const cellH = 98;
  const gap = 18;
  const mapW = 4 * cellW + 3 * gap;
  const mapH = 3 * cellH + 2 * gap;

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.14 : -0.14;
    setZoom((z) => Math.max(0.65, Math.min(2.3, Number((z + delta).toFixed(2)))));
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPan({
      x: Math.max(-360, Math.min(360, e.clientX - dragStart.x)),
      y: Math.max(-240, Math.min(240, e.clientY - dragStart.y)),
    });
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleResetView = () => {
    setZoom(1.15);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      className="safe-modal fixed inset-0 z-40 flex items-center justify-center bg-[#020809]/92 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Cavern World Map"
    >
      <div className="flex h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#294c44] bg-[#071315] text-[#e6f0ec] shadow-2xl md:h-[88dvh]">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#193330] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <Compass className="h-5 w-5 text-[#74c69d]" />
            <div>
              <h2 className="font-display text-lg font-semibold tracking-wider text-[#eef7f3]">
                Mossgrotto Cavern Map
              </h2>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[#89aba0]">
                <span className="font-mono-code tabular-nums">
                  {visitedCount} / {rooms.length} Chambers Explored
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-code tabular-nums">
                  {secretWallsBroken} / {totalSecretWalls} Secret Walls Opened
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.2).toFixed(2))))}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#25443e] bg-[#0c1e20] text-[#cbe5dc] hover:bg-[#143134]"
              aria-label="Zoom out map"
              title="Zoom Out"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="font-mono-code w-12 text-center text-xs tabular-nums text-[#a7cabf]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.3, Number((z + 0.2).toFixed(2))))}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#25443e] bg-[#0c1e20] text-[#cbe5dc] hover:bg-[#143134]"
              aria-label="Zoom in map"
              title="Zoom In"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#25443e] bg-[#0c1e20] px-3 text-xs text-[#cbe5dc] hover:bg-[#143134]"
              title="Center Map"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Center</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#2b524a] bg-[#10282a] text-[#e2f5ec] hover:bg-[#183b3e]"
              aria-label="Close map"
              title="Close (M / Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Interactive Pan & Zoom Canvas */}
        <div
          className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#040c0e] ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Subtle coordinate grid backdrop */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(116, 198, 157, 0.35) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />

          <div
            className="transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg
              width={mapW + 40}
              height={mapH + 40}
              viewBox={`-20 -20 ${mapW + 40} ${mapH + 40}`}
              className="overflow-visible"
            >
              {/* Connection Passage Lines */}
              {rooms.map((room) => {
                if (!room.discovered) return null;
                const cx = room.gridX * (cellW + gap) + cellW * 0.5;
                const cy = room.gridY * (cellH + gap) + cellH * 0.5;
                return room.connections.map((dir) => {
                  let tx = cx;
                  let ty = cy;
                  if (dir === 'E') tx += cellW * 0.5 + gap * 0.55;
                  else if (dir === 'W') tx -= cellW * 0.5 + gap * 0.55;
                  else if (dir === 'S') ty += cellH * 0.5 + gap * 0.55;
                  else if (dir === 'N') ty -= cellH * 0.5 + gap * 0.55;
                  return (
                    <line
                      key={`${room.id}-${dir}`}
                      x1={cx}
                      y1={cy}
                      x2={tx}
                      y2={ty}
                      stroke={room.visited ? '#40916c' : '#23423d'}
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                  );
                });
              })}

              {/* Room Grid Cells */}
              {rooms.map((room) => {
                if (!room.discovered) return null;
                const x = room.gridX * (cellW + gap);
                const y = room.gridY * (cellH + gap);
                const isCurrent = room.id === currentRoomId;
                const isSelected = room.id === inspectedRoom?.id;

                const fill = room.visited
                  ? isCurrent
                    ? '#1b473d'
                    : room.isSecret
                    ? '#133a42'
                    : '#112c29'
                  : '#091819';

                const stroke = isCurrent
                  ? '#a7f3d0'
                  : isSelected
                  ? '#74c69d'
                  : room.isBossRoom
                  ? '#f59e0b'
                  : room.visited
                  ? '#40916c'
                  : '#274a44';

                return (
                  <g
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={cellW}
                      height={cellH}
                      rx={6}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isCurrent ? 2.4 : 1.5}
                      strokeDasharray={room.visited ? undefined : '5 4'}
                    />

                    {/* Room Title */}
                    <text
                      x={x + 10}
                      y={y + 22}
                      fill={room.visited ? '#e6f5ee' : '#6f9489'}
                      fontSize="11"
                      fontWeight="600"
                    >
                      {room.name}
                    </text>

                    {/* Room Sub-tags (non-hue-only text + icon cues) */}
                    {room.hasBench && room.visited && (
                      <text x={x + 10} y={y + cellH - 12} fill="#95d5b2" fontSize="10">
                        Bench Checkpoint
                      </text>
                    )}
                    {room.isSecret && (
                      <text x={x + 10} y={y + cellH - 12} fill="#67e8f9" fontSize="10">
                        Secret Chamber
                      </text>
                    )}
                    {room.isBossRoom && (
                      <text x={x + 10} y={y + cellH - 12} fill="#fbbf24" fontSize="10">
                        Warden Arena
                      </text>
                    )}

                    {/* Player Position Marker */}
                    {isCurrent && (
                      <g
                        transform={`translate(${x + 16 + playerNormX * (cellW - 32)}, ${
                          y + 32 + playerNormY * (cellH - 48)
                        })`}
                      >
                        <circle r={9} fill="rgba(167, 243, 208, 0.25)" />
                        <circle r={5} fill="#ecfdf5" stroke="#04100d" strokeWidth={1.5} />
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom-Left Room Inspector */}
          {inspectedRoom && (
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-[#23433d] bg-[#071517]/95 px-4 py-2.5">
              <div className="text-xs font-semibold text-[#e6f5ee]">{inspectedRoom.name}</div>
              <div className="mt-0.5 text-[11px] text-[#88aba0]">
                {inspectedRoom.id === currentRoomId
                  ? 'Current Location'
                  : inspectedRoom.visited
                  ? 'Explored Chamber'
                  : 'Adjacent Mapped Area'}
                {inspectedRoom.isSecret ? ' · Hidden Behind Moss Wall' : ''}
                {inspectedRoom.hasBench ? ' · Stone Bench' : ''}
              </div>
            </div>
          )}
        </div>

        {/* Footer Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#193330] bg-[#061012] px-6 py-3 text-xs text-[#91b3a8]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#40916c] bg-[#112c29]" />
              <span>Visited</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#274a44] bg-[#091819]" />
              <span>Mapped</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#40916c] bg-[#133a42]" />
              <span>Secret Chamber</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ecfdf5]" />
              <span>Vessel</span>
            </span>
          </div>
          <span className="text-[11px] text-[#729489]">Drag to pan · Scroll to zoom · M or Esc to close</span>
        </div>
      </div>
    </div>
  );
}
