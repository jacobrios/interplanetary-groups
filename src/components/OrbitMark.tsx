"use client"

import { useId } from "react"

// Orbit's mark, ported from docs/design/design-polish-rd-2/orbit-mark.js.
// The sphere is centred in the 240 viewBox; the moon and orbit path overflow
// the avatar slot uncropped (slot stays transparent, overflow visible).
const LIME = "#a4ef4e"
const LIME_HI = "#c2f878"
const LIME_SH = "#8ad53b"
const INK = "#181c12"
const BLUE = "#45a6ff"
const EYE = "#1c2218"
const CORAL = "#ff8f7a"
const PATH = "#8b99ad"

const CX = 120
const LX = 96
const RX = 144
const EY = 116
const ER = 16
const MT = 136
const MOUTH = `M${CX - 20} ${MT} L${CX + 20} ${MT} A 20 22 0 0 1 ${CX - 20} ${MT} Z`
const MOON_X = 185.26
const MOON_Y = 86.9

export function OrbitMark({ size, label = "Orbit" }: { size: number; label?: string | null }) {
  const uid = useId()
  const gid = `osph${uid}`
  const cid = `omc${uid}`
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "156%",
          height: "156%",
          transform: "translate(-50%, -50%)",
          display: "block",
          pointerEvents: "none",
        }}
      >
        <defs>
          <radialGradient id={gid} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor={LIME_HI} />
            <stop offset="55%" stopColor={LIME} />
            <stop offset="100%" stopColor={LIME_SH} />
          </radialGradient>
          <clipPath id={cid}>
            <path d={MOUTH} />
          </clipPath>
        </defs>
        <g transform="rotate(-18 120 120)">
          <ellipse cx={120} cy={120} rx={106} ry={42} fill="none" stroke={PATH} strokeWidth={4.5} />
        </g>
        <circle cx={120} cy={120} r={74} fill={`url(#${gid})`} stroke={INK} strokeWidth={9} />
        <circle cx={92} cy={86} r={7} fill="#eaffc9" opacity={0.85} />
        <circle cx={LX} cy={EY} r={ER} fill={EYE} />
        <circle cx={RX} cy={EY} r={ER} fill={EYE} />
        <circle cx={LX + 5.5} cy={EY - 6.5} r={5.5} fill="#fff" />
        <circle cx={RX + 5.5} cy={EY - 6.5} r={5.5} fill="#fff" />
        <circle cx={LX - 13} cy={EY + 13} r={5} fill={BLUE} />
        <path d={MOUTH} fill={EYE} />
        <g clipPath={`url(#${cid})`}>
          <ellipse cx={CX} cy={MT + 22} rx={14} ry={11} fill={CORAL} />
        </g>
        <path d={MOUTH} fill="none" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
        <g transform="rotate(-18 120 120)">
          <circle cx={MOON_X} cy={MOON_Y} r={13.5} fill={BLUE} stroke={INK} strokeWidth={6} />
        </g>
      </svg>
    </span>
  )
}
