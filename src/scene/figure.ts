// Procedural player figure: a stylised, helmeted "game piece" built from primitives and merged
// into one mesh per player. The model is one unit tall and faces +X; callers scale it to the
// player's listed height, and `girth` widens it from his height-to-weight ratio.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const KIT = {
  jersey: new THREE.Color('#0a7cc4'),
  jerseyLight: new THREE.Color('#1a94e0'),
  pants: new THREE.Color('#aab4bd'),
  helmet: new THREE.Color('#c3ccd4'),
  stripe: new THREE.Color('#0a7cc4'),
  trim: new THREE.Color('#f3f7fa'),
  dark: new THREE.Color('#0d1620'),
}

function paint(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}

const m4 = new THREE.Matrix4()
function place(geo: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  m4.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale))
  geo.applyMatrix4(m4)
  return geo
}

/** A limb between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, color: THREE.Color) {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(r1, r0, len, 10, 1)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))
  geo.applyMatrix4(m4)
  return paint(geo, color)
}

export function buildFigure(girth: number): THREE.BufferGeometry {
  const g = girth
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const parts: THREE.BufferGeometry[] = []

  // Cleats and legs, set in a slightly staggered athletic stance.
  for (const side of [-1, 1]) {
    const z = side * 0.075 * g
    const lead = side * 0.018
    parts.push(paint(place(new THREE.BoxGeometry(0.12, 0.036, 0.062 * g), [0.02 + lead, 0.018, z]), KIT.dark))
    parts.push(limb(V(lead, 0.035, z), V(lead * 0.5, 0.27, z * 1.04), 0.04 * g, 0.056 * g, KIT.trim)) // sock / shin
    parts.push(limb(V(lead * 0.5, 0.26, z * 1.04), V(0, 0.5, z * 0.92), 0.058 * g, 0.082 * g, KIT.pants)) // thigh
  }
  // Hips and torso (flattened front-to-back).
  parts.push(paint(place(new THREE.CylinderGeometry(0.128 * g, 0.118 * g, 0.12, 14), [0, 0.52, 0], [0, 0, 0], [0.78, 1, 1]), KIT.pants))
  parts.push(paint(place(new THREE.CylinderGeometry(0.168 * g, 0.124 * g, 0.26, 14), [0.004, 0.69, 0], [0, 0, 0], [0.74, 1, 1]), KIT.jersey))
  // Shoulder pads.
  parts.push(paint(place(new THREE.SphereGeometry(1, 16, 10), [0, 0.808, 0], [0, 0, 0], [0.135 * g, 0.066, 0.255 * g]), KIT.jerseyLight))
  // Arms: sleeve to the elbow, then a taped forearm held slightly forward.
  for (const side of [-1, 1]) {
    const sh = V(0, 0.795, side * 0.228 * g)
    const el = V(0.035, 0.62, side * 0.262 * g)
    const ha = V(0.11, 0.49, side * 0.235 * g)
    parts.push(limb(sh, el, 0.05 * g, 0.043 * g, KIT.jersey))
    parts.push(limb(el, ha, 0.04 * g, 0.034 * g, KIT.trim))
    parts.push(paint(place(new THREE.SphereGeometry(0.04 * g, 10, 8), [ha.x + 0.01, ha.y - 0.012, ha.z]), KIT.dark))
  }
  // Neck, helmet shell, centre stripe, face opening and mask.
  parts.push(paint(place(new THREE.CylinderGeometry(0.05, 0.058, 0.05, 10), [0, 0.862, 0]), KIT.dark))
  parts.push(paint(place(new THREE.SphereGeometry(0.088, 18, 14), [0.004, 0.928, 0], [0, 0, 0], [1.1, 1.04, 0.98]), KIT.helmet))
  parts.push(paint(place(new THREE.TorusGeometry(0.0905, 0.011, 6, 18, Math.PI * 0.92), [0.004, 0.931, 0], [0, 0, 0.16], [1.1, 1.04, 1]), KIT.stripe))
  parts.push(paint(place(new THREE.SphereGeometry(0.062, 12, 10), [0.058, 0.912, 0], [0, 0, 0], [0.72, 0.78, 1.06]), KIT.dark))
  parts.push(paint(place(new THREE.TorusGeometry(0.071, 0.0065, 5, 14, Math.PI), [0.052, 0.893, 0], [Math.PI / 2, 0, -Math.PI / 2 + 0.25], [1, 1, 1]), KIT.trim))
  parts.push(paint(place(new THREE.TorusGeometry(0.066, 0.0055, 5, 14, Math.PI), [0.058, 0.918, 0], [Math.PI / 2, 0, -Math.PI / 2 + 0.1], [1, 1, 1]), KIT.trim))

  // Each primitive keeps its own smooth normals, so helmets and pads read as moulded shells.
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!
  merged.computeBoundingSphere()
  for (const p of parts) p.dispose()
  return merged
}

// ---------------------------------------------------------------- textures

const FONT_DISPLAY = '"Saira Extra Condensed", "Saira Condensed", "Arial Narrow", sans-serif'
const FONT_LABEL = '"Saira Condensed", "Arial Narrow", sans-serif'
const numberCache = new Map<string, THREE.CanvasTexture>()

/** Jersey numeral, white with a thin dark keyline. */
export function numberTexture(n: number | string): THREE.CanvasTexture {
  const key = String(n)
  const hit = numberCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 128; c.height = 128
  const ctx = c.getContext('2d')!
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `800 118px ${FONT_DISPLAY}`
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(4,30,52,0.9)'; ctx.lineJoin = 'round'
  ctx.strokeText(key, 64, 70)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(key, 64, 70)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  numberCache.set(key, tex)
  return tex
}

/** Floating name plate: number, surname and position. Returns the texture and its aspect ratio. */
export function nameTexture(number: number | undefined, name: string, position: string): { texture: THREE.CanvasTexture; aspect: number } {
  const pad = 18, h = 84
  const measure = document.createElement('canvas').getContext('2d')!
  const numText = number !== undefined ? String(number) : ''
  measure.font = `800 58px ${FONT_DISPLAY}`
  const wNum = numText ? measure.measureText(numText).width + 16 : 0
  measure.font = `600 44px ${FONT_LABEL}`
  const label = name.toUpperCase()
  const wName = measure.measureText(label).width
  measure.font = `600 26px ${FONT_LABEL}`
  const wPos = measure.measureText(position).width + 14
  const w = Math.ceil(pad * 2 + wNum + wName + wPos + 6)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(3,10,18,0.78)'
  ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, 12); ctx.fill()
  ctx.strokeStyle = 'rgba(150,200,240,0.28)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, 12); ctx.stroke()
  ctx.textBaseline = 'middle'
  let x = pad
  if (numText) {
    ctx.font = `800 58px ${FONT_DISPLAY}`; ctx.fillStyle = '#4fc0ff'
    ctx.fillText(numText, x, h / 2 + 4); x += wNum
  }
  ctx.font = `600 44px ${FONT_LABEL}`; ctx.fillStyle = '#f2f7fb'
  ctx.fillText(label, x, h / 2 + 3); x += wName + 14
  ctx.font = `600 26px ${FONT_LABEL}`; ctx.fillStyle = 'rgba(170,196,216,0.9)'
  ctx.fillText(position, x, h / 2 + 5)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, aspect: w / h }
}

/** Short value tag used by the data lenses ("$37.6M", "84%"). */
export function tagTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const h = 64
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = `700 44px ${FONT_LABEL}`
  const w = Math.ceil(measure.measureText(text).width + 28)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(3,10,18,0.82)'
  ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, 10); ctx.fill()
  ctx.font = `700 44px ${FONT_LABEL}`; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
  ctx.fillText(text, w / 2, h / 2 + 3)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: w / h }
}

/** Soft radial blob used as a contact shadow under each figure. */
export function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}
