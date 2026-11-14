// Paints a selected player's tendencies onto the turf: a 3x4 passing/receiving grid
// (left / middle / right by depth of target) or seven run lanes keyed to the gaps in the line.
import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { FIELD } from '../lib/layout'
import type { Lane, Zone } from '../types'

const DISPLAY = '"Saira Extra Condensed", "Saira Condensed", sans-serif'
const LABEL = '"Saira Condensed", sans-serif'

const LATERAL: Record<string, [number, number]> = { left: [-FIELD.halfWidth + 1, -8.6], middle: [-8.6, 8.6], right: [8.6, FIELD.halfWidth - 1] }
const DEPTH: Record<string, [number, number, string]> = { behind: [-6.5, -0.4, 'Behind the line'], short: [0.4, 10, '0–9 yards'], mid: [10, 20, '10–19 yards'], deep: [20, 41, '20+ yards'] }
const LANES: Record<string, [number, string]> = {
  'left-end': [-11.4, 'Left end'], 'left-tackle': [-6.4, 'Left tackle'], 'left-guard': [-3.2, 'Left guard'], middle: [0, 'Middle'],
  'right-guard': [3.2, 'Right guard'], 'right-tackle': [6.4, 'Right tackle'], 'right-end': [11.4, 'Right end'],
}

/** Diverging colour for EPA per play: warm when it cost Detroit points, blue when it added them, grey near zero. */
export function epaColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v / 0.45))
  const mix = (a: number[], b: number[], k: number) => a.map((x, i) => Math.round(x + (b[i] - x) * k))
  const mid = [91, 104, 120]
  const c = t >= 0 ? mix(mid, [79, 151, 234], t) : mix(mid, [232, 104, 74], -t)
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function tileTexture(lines: { big: string; small: string[] }, color: string, w: number, h: number): THREE.CanvasTexture {
  const S = 22
  const c = document.createElement('canvas')
  c.width = Math.round(w * S); c.height = Math.round(h * S)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color; ctx.globalAlpha = 0.34
  ctx.beginPath(); ctx.roundRect(3, 3, c.width - 6, c.height - 6, 10); ctx.fill()
  ctx.globalAlpha = 0.95; ctx.strokeStyle = color; ctx.lineWidth = 4
  ctx.beginPath(); ctx.roundRect(3, 3, c.width - 6, c.height - 6, 10); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'
  const cy = c.height / 2
  const bigSize = Math.min(c.height * 0.42, c.width * 0.3, 84)
  ctx.font = `800 ${bigSize}px ${DISPLAY}`
  ctx.fillText(lines.big, c.width / 2, cy - (lines.small.length ? bigSize * 0.32 : 0))
  ctx.font = `600 ${Math.min(26, c.height * 0.15)}px ${LABEL}`
  ctx.fillStyle = 'rgba(235,244,250,0.92)'
  lines.small.forEach((t, i) => ctx.fillText(t, c.width / 2, cy + bigSize * 0.36 + i * Math.min(28, c.height * 0.17)))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function arrowShape(len: number, width: number): THREE.Shape {
  const head = Math.min(2.2, len * 0.4), hw = width * 0.95
  const s = new THREE.Shape()
  s.moveTo(0, -width / 2); s.lineTo(len - head, -width / 2); s.lineTo(len - head, -hw); s.lineTo(len, 0)
  s.lineTo(len - head, hw); s.lineTo(len - head, width / 2); s.lineTo(0, width / 2); s.closePath()
  return s
}

export function ZoneOverlay() {
  const overlay = useStore((s) => s.overlay)
  const selected = useStore((s) => s.selected)
  const dossier = useStore((s) => (s.selected ? s.dossiers[s.selected] : null))

  const items = useMemo(() => {
    if (!overlay || !dossier || typeof dossier === 'string') return null
    if (overlay === 'rush') {
      const lanes = dossier.zones?.rush as Record<string, Lane> | undefined
      if (!lanes) return null
      const maxAtt = Math.max(...Object.values(lanes).map((l) => l.att))
      return Object.entries(lanes).filter(([k]) => LANES[k]).map(([k, l]) => {
        const ypc = l.yds / l.att
        const len = Math.max(3.5, Math.min(26, ypc * 3.1))
        const width = 0.7 + 1.5 * (l.att / maxAtt)
        const color = epaColor(l.epa / l.att)
        const label = tileTexture({ big: ypc.toFixed(1), small: [LANES[k][1], `${l.att} car · ${l.yds} yd`, l.td ? `${l.td} TD` : 'yards / carry'] }, color, 6.2, 6.9)
        return { key: k, kind: 'lane' as const, z: LANES[k][0], len, width, color, label }
      })
    }
    const grid = (overlay === 'pass' ? dossier.zones?.pass : dossier.zones?.recv) as Record<string, Zone> | undefined
    if (!grid) return null
    return Object.entries(grid).map(([k, zne]) => {
      const [loc, depth] = k.split('-')
      const zr = LATERAL[loc], xr = DEPTH[depth]
      if (!zr || !xr) return null
      const w = xr[1] - xr[0] - 0.5, h = zr[1] - zr[0] - 0.5
      const color = epaColor(zne.epa / Math.max(1, zne.att))
      const pct = zne.att ? Math.round((zne.cmp / zne.att) * 100) : 0
      const small = [`${zne.yds} yds · ${pct}%`, [zne.td ? `${zne.td} TD` : '', zne.int ? `${zne.int} INT` : ''].filter(Boolean).join(' · ') || xr[2]]
      const tex = tileTexture({ big: `${zne.cmp}/${zne.att}`, small }, color, h, w)
      return { key: k, kind: 'tile' as const, x: (xr[0] + xr[1]) / 2, z: (zr[0] + zr[1]) / 2, w, h, tex }
    }).filter(Boolean) as { key: string; kind: 'tile'; x: number; z: number; w: number; h: number; tex: THREE.CanvasTexture }[]
  }, [overlay, dossier])

  if (!items || !selected) return null
  return (
    <group position-y={0.09}>
      {items.map((it) =>
        it.kind === 'tile' ? (
          <group key={it.key} position={[it.x, 0, it.z]} rotation-y={-Math.PI / 2}>
            <mesh rotation-x={-Math.PI / 2} renderOrder={5}>
              <planeGeometry args={[it.h, it.w]} />
              <meshBasicMaterial map={it.tex} transparent depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        ) : (
          <group key={it.key} position={[0.6, 0, it.z]}>
            <mesh rotation-x={-Math.PI / 2} renderOrder={5}>
              <shapeGeometry args={[arrowShape(it.len, it.width)]} />
              <meshBasicMaterial color={it.color} transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <group position={[it.len + 2.4, 0.01, 0]} rotation-y={-Math.PI / 2}>
              <mesh rotation-x={-Math.PI / 2} renderOrder={6}>
                <planeGeometry args={[it.z === 0 ? 3.1 : 3.05, 3.4]} />
                <meshBasicMaterial map={it.label} transparent depthWrite={false} toneMapped={false} />
              </mesh>
            </group>
          </group>
        ),
      )}
    </group>
  )
}
