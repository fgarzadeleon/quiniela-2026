'use client'
import { useState } from 'react'

interface PlayerRank { id: string; name: string; rank: number; total_points: number }
interface Stage { label: string; display: string; ranks: PlayerRank[] }

interface Props {
  stages: Stage[]
  current: PlayerRank[]
}

// Golden-angle hue distribution for visually distinct colors
function playerColor(index: number): string {
  const hue = Math.round((index * 137.508) % 360)
  return `hsl(${hue}, 70%, 58%)`
}

const COL_W = 72       // px between stage columns
const ROW_H = 20       // px per rank position
const PAD_TOP = 36     // px above rank 1
const PAD_LEFT = 10    // px before first column
const LABEL_RIGHT = 160 // px for right-side name labels
const NAME_LEFT = 130  // px for left-side name labels

export default function BumpsChart({ stages, current }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  // All columns: historical stages + current
  const columns: Array<{ display: string; ranks: PlayerRank[] }> = [
    ...stages.map(s => ({ display: s.display, ranks: s.ranks })),
    ...(current.length ? [{ display: 'Now', ranks: current }] : []),
  ]

  if (columns.length === 0) return (
    <p className="text-white/30 text-sm text-center py-8">
      No stage snapshots yet — chart will populate after each matchday.
    </p>
  )

  // All unique players across all columns, ordered by current rank
  const playerOrder = current.length ? current : (columns[0]?.ranks ?? [])
  const numPlayers = playerOrder.length
  const numCols = columns.length

  const svgWidth = PAD_LEFT + NAME_LEFT + (numCols - 1) * COL_W + LABEL_RIGHT
  const svgHeight = PAD_TOP + numPlayers * ROW_H + 20

  // For each player, get their rank in each column (null if absent)
  function rankAt(playerId: string, colIdx: number): number | null {
    const r = columns[colIdx].ranks.find(p => p.id === playerId)
    return r ? r.rank : null
  }

  function xForCol(colIdx: number) {
    return PAD_LEFT + NAME_LEFT + colIdx * COL_W
  }

  function yForRank(rank: number) {
    return PAD_TOP + (rank - 1) * ROW_H
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block', minWidth: svgWidth }}
      >
        {/* Column headers */}
        {columns.map((col, ci) => (
          <text
            key={ci}
            x={xForCol(ci)}
            y={PAD_TOP - 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.4)"
            fontSize={11}
            fontFamily="Impact, sans-serif"
            letterSpacing={1}
          >
            {col.display}
          </text>
        ))}

        {/* Rank position gridlines */}
        {playerOrder.map((_, i) => (
          <line
            key={i}
            x1={PAD_LEFT + NAME_LEFT}
            x2={xForCol(numCols - 1)}
            y1={PAD_TOP + i * ROW_H}
            y2={PAD_TOP + i * ROW_H}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        {/* Player lines and dots */}
        {playerOrder.map((player, pi) => {
          const color = playerColor(pi)
          const isHovered = hovered === player.id
          const isFaded = hovered !== null && !isHovered
          const opacity = isFaded ? 0.15 : 1
          const strokeWidth = isHovered ? 2.5 : 1.5

          // Build path points
          const points: Array<{ x: number; y: number; col: number }> = []
          for (let ci = 0; ci < numCols; ci++) {
            const rank = rankAt(player.id, ci)
            if (rank != null) points.push({ x: xForCol(ci), y: yForRank(rank), col: ci })
          }

          return (
            <g
              key={player.id}
              style={{ opacity, cursor: 'pointer' }}
              onMouseEnter={() => setHovered(player.id)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Line segments */}
              {points.slice(0, -1).map((pt, i) => {
                const next = points[i + 1]
                return (
                  <line
                    key={i}
                    x1={pt.x} y1={pt.y}
                    x2={next.x} y2={next.y}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                )
              })}

              {/* Dots at each stage */}
              {points.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x} cy={pt.y}
                  r={isHovered ? 4 : 3}
                  fill={color}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={1}
                />
              ))}

              {/* Left label (first column position) */}
              {points[0] && (
                <text
                  x={xForCol(0) - 8}
                  y={points[0].y + 4}
                  textAnchor="end"
                  fill={isHovered ? color : 'rgba(255,255,255,0.5)'}
                  fontSize={isHovered ? 11 : 10}
                  fontWeight={isHovered ? 'bold' : 'normal'}
                  fontFamily="sans-serif"
                >
                  {player.name.split(' ')[0]}
                </text>
              )}

              {/* Right label (last column position) */}
              {points[points.length - 1] && (() => {
                const last = points[points.length - 1]
                const rank = rankAt(player.id, numCols - 1)
                return (
                  <text
                    x={last.x + 10}
                    y={last.y + 4}
                    textAnchor="start"
                    fill={isHovered ? color : 'rgba(255,255,255,0.55)'}
                    fontSize={isHovered ? 11 : 10}
                    fontWeight={isHovered ? 'bold' : 'normal'}
                    fontFamily="sans-serif"
                  >
                    {rank && `#${rank} `}{player.name.split(' ')[0]}
                  </text>
                )
              })()}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
