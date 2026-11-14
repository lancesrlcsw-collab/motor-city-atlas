// Procedural stadium: the field texture, the blueprint floor around it, roof trusses,
// light banks and a twinkling crowd. Everything is generated in code — no image assets.
import * as THREE from 'three'
import { FIELD } from '../lib/layout'

const DISPLAY = '"Saira Extra Condensed", "Saira Condensed", "Arial Narrow", sans-serif'
export const BG = '#03070d'

export function fieldTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const S = 24 // pixels per yard
  const W = FIELD.length * S
  const H = Math.round(FIELD.width * S)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const X = (yd: number) => yd * S

  // Turf: alternating five-yard bands in deep blue.
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = i % 2 ? '#0b2b47' : '#0d3252'
    ctx.fillRect(X(10 + i * 5), 0, X(5), H)
  }
  // End zones.
  const ez = ctx.createLinearGradient(0, 0, 0, H)
  ez.addColorStop(0, '#0067a3'); ez.addColorStop(0.5, '#007dc4'); ez.addColorStop(1, '#0067a3')
  ctx.fillStyle = ez
  ctx.fillRect(0, 0, X(10), H); ctx.fillRect(X(110), 0, X(10), H)

  // Fine mowing texture so the surface is not flat colour.
  ctx.globalAlpha = 0.05
  for (let y = 0; y < H; y += 3) { ctx.fillStyle = y % 6 ? '#ffffff' : '#000000'; ctx.fillRect(0, y, W, 1) }
  ctx.globalAlpha = 1

  const line = 'rgba(232,243,252,0.94)'
  ctx.strokeStyle = line; ctx.fillStyle = line
  // Yard lines every five yards, goal lines heavier.
  for (let yd = 10; yd <= 110; yd += 5) {
    ctx.lineWidth = yd === 10 || yd === 110 ? 7 : yd === 60 ? 5 : 3.2
    ctx.beginPath(); ctx.moveTo(X(yd), 0); ctx.lineTo(X(yd), H); ctx.stroke()
  }
  // One-yard ticks at both sidelines and both hash marks.
  const hash = 3.083 * S
  const tick = 0.62 * S
  ctx.lineWidth = 2.6
  for (let yd = 11; yd < 110; yd++) {
    if (yd % 5 === 0) continue
    for (const y of [S * 0.2, H - S * 0.2 - tick, H / 2 - hash - tick / 2, H / 2 + hash - tick / 2]) {
      ctx.beginPath(); ctx.moveTo(X(yd), y); ctx.lineTo(X(yd), y + tick); ctx.stroke()
    }
  }
  // Field numbers, readable from each sideline.
  ctx.font = `700 ${Math.round(S * 3.4)}px ${DISPLAY}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let yd = 20; yd <= 100; yd += 10) {
    const label = String(yd <= 60 ? yd - 10 : 110 - yd)
    const tens = label[0], ones = label[1]
    const off = S * 1.08
    for (const [y, flip] of [[H - S * 10.4, false], [S * 10.4, true]] as const) {
      ctx.save(); ctx.translate(X(yd), y); if (flip) ctx.rotate(Math.PI)
      ctx.fillText(tens, -off, 0); ctx.fillText(ones, off, 0)
      // Direction arrow toward the nearer goal line.
      if (yd !== 60) {
        const dir = (yd < 60 ? -1 : 1) * (flip ? -1 : 1)
        ctx.beginPath(); ctx.moveTo(dir * S * 2.75, 0); ctx.lineTo(dir * S * 2.2, -S * 0.34); ctx.lineTo(dir * S * 2.2, S * 0.34); ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    }
  }
  // Midfield: a drafting-compass mark rather than a logo.
  ctx.save(); ctx.translate(X(60), H / 2)
  ctx.strokeStyle = 'rgba(232,243,252,0.5)'
  for (const [r, w] of [[S * 5.2, 3], [S * 4.3, 1.4], [S * 1.2, 2]] as const) { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke() }
  ctx.lineWidth = 1.4
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, r0 = S * 4.3, r1 = S * (i % 6 === 0 ? 5.2 : 4.75)
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(232,243,252,0.16)'
  ctx.beginPath(); ctx.arc(0, 0, S * 4.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // End-zone lettering.
  ctx.fillStyle = 'rgba(240,247,252,0.95)'
  ctx.font = `800 ${Math.round(S * 6.4)}px ${DISPLAY}`
  const spaced = (text: string) => text.split('').join('  ')
  ctx.save(); ctx.translate(X(5), H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(spaced('DETROIT'), 0, S * 0.3); ctx.restore()
  ctx.save(); ctx.translate(X(115), H / 2); ctx.rotate(Math.PI / 2); ctx.fillText(spaced('MOTOR CITY'), 0, S * 0.3); ctx.restore()

  // White border.
  ctx.strokeStyle = 'rgba(226,238,248,0.96)'; ctx.lineWidth = S * 0.5
  ctx.strokeRect(S * 0.25, S * 0.25, W - S * 0.5, H - S * 0.5)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = maxAnisotropy
  tex.generateMipmaps = true
  return tex
}

/** Faint drafting grid that runs to the horizon around the field. */
export function gridTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#050c15'; ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(70,150,215,0.20)'; ctx.lineWidth = 1
  for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(256, i + 0.5); ctx.stroke() }
  ctx.strokeStyle = 'rgba(90,175,240,0.42)'; ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 254, 254)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(40, 40)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Text painted flat on the ground (sideline group names). */
export function floorLabel(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const h = 96
  const m = document.createElement('canvas').getContext('2d')!
  m.font = `700 64px ${DISPLAY}`
  const spaced = text.split('').join('   ')
  const w = Math.ceil(m.measureText(spaced).width + 40)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.font = `700 64px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(140,196,238,0.85)'
  ctx.fillText(spaced, w / 2, h / 2 + 4)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return { texture, aspect: w / h }
}

/** Arched roof trusses with light banks. */
export function buildRoof(): THREE.Group {
  const group = new THREE.Group()
  const trussMat = new THREE.MeshBasicMaterial({ color: '#0b2740', fog: true })
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#1c64a0', fog: true })
  const span = 172, apex = 112, eave = 52
  const heightAt = (z: number) => eave + (apex - eave) * (1 - (z / span) ** 2)
  const arc = (x: number) => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 24; i++) {
      const z = (i / 24 - 0.5) * 2 * span
      pts.push(new THREE.Vector3(x, heightAt(z), z))
    }
    return new THREE.CatmullRomCurve3(pts)
  }
  for (let i = -6; i <= 6; i++) {
    const curve = arc(i * 30)
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.8, 6), trussMat))
    const under = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.14, 5), edgeMat)
    under.position.y = -1
    group.add(under)
  }
  for (const z of [-120, -80, -40, 0, 40, 80, 120]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(380, 0.6, 0.6), trussMat)
    beam.position.set(0, heightAt(z), z)
    group.add(beam)
  }
  // Light banks: bright panels that the bloom pass turns into stadium lights.
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3.7, 4.0), toneMapped: false, fog: false })
  const panel = new THREE.BoxGeometry(11, 0.3, 2.6)
  for (const z of [-62, 62]) {
    for (let i = -5; i <= 5; i++) {
      const m = new THREE.Mesh(panel, lightMat)
      m.position.set(i * 30 + 15, heightAt(z) - 2.4, z)
      m.rotation.x = z > 0 ? 0.45 : -0.45
      group.add(m)
    }
  }
  return group
}

// The seating bowl follows a superellipse so it hugs the rectangular field.
const TIERS = [
  { rx0: 86, rz0: 52, rx1: 108, rz1: 74, y0: 2.5, y1: 15 },
  { rx0: 111, rz0: 77, rx1: 133, rz1: 99, y0: 18.5, y1: 33 },
  { rx0: 136, rz0: 102, rx1: 156, rz1: 122, y0: 37, y1: 52 },
]
const bowl = (a: number, rx: number, rz: number): [number, number] => {
  const ca = Math.cos(a), sa = Math.sin(a)
  return [Math.sign(ca) * Math.abs(ca) ** 0.6 * rx, Math.sign(sa) * Math.abs(sa) ** 0.6 * rz]
}

/** Three seating tiers, each fronted by a glowing ribbon board. */
export function buildStands(): THREE.Group {
  const group = new THREE.Group()
  const seg = 128
  // Single-sided on purpose: solid from the field, culled from behind, so the camera is never walled in.
  const standMat = new THREE.MeshStandardMaterial({ color: '#0d2238', roughness: 0.96, metalness: 0.05, side: THREE.BackSide })
  const ribbonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.95, 2.3), toneMapped: false, side: THREE.BackSide })
  const wallMat = new THREE.MeshStandardMaterial({ color: '#06101b', roughness: 1, side: THREE.BackSide })
  const strip = (pts: (i: number) => [number, number, number, number, number, number]) => {
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= seg; i++) pos.push(...pts(i))
    for (let i = 0; i < seg; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  for (const t of TIERS) {
    const A = (i: number) => (i / seg) * Math.PI * 2
    group.add(new THREE.Mesh(strip((i) => { const [x0, z0] = bowl(A(i), t.rx0, t.rz0); const [x1, z1] = bowl(A(i), t.rx1, t.rz1); return [x0, t.y0, z0, x1, t.y1, z1] }), standMat))
    group.add(new THREE.Mesh(strip((i) => { const [x, z] = bowl(A(i), t.rx0, t.rz0); return [x, t.y0 - 3.2, z, x, t.y0, z] }), wallMat))
    group.add(new THREE.Mesh(strip((i) => { const [x, z] = bowl(A(i), t.rx0 - 0.15, t.rz0 - 0.15); return [x, t.y0 - 1.5, z, x, t.y0 - 0.55, z] }), ribbonMat))
  }
  return group
}

/** Thousands of points scattered across the seating tiers, twinkling like a crowd under the lights. */
export function buildCrowd(count = 9000): THREE.Points {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const tint = new Float32Array(count)
  let s = 12345
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < count; i++) {
    const t = TIERS[Math.min(2, Math.floor(rnd() * 3))]
    const a = rnd() * Math.PI * 2
    const k = rnd()
    const [x, z] = bowl(a, t.rx0 + (t.rx1 - t.rx0) * k, t.rz0 + (t.rz1 - t.rz0) * k)
    pos[i * 3] = x
    pos[i * 3 + 1] = t.y0 + (t.y1 - t.y0) * k + 0.5
    pos[i * 3 + 2] = z
    seed[i] = rnd() * 100
    tint[i] = rnd()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; attribute float aTint;
      uniform float uTime; uniform float uPixelRatio;
      varying float vAlpha; varying float vTint;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.5 + 0.5 * sin(uTime * (0.5 + fract(aSeed) * 1.6) + aSeed * 6.283);
        vAlpha = (0.35 + 0.65 * tw) * smoothstep(520.0, 120.0, -mv.z);
        vTint = aTint;
        gl_PointSize = clamp((1.6 + fract(aSeed * 7.0) * 2.2) * uPixelRatio * (210.0 / -mv.z), 1.0, 7.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha; varying float vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 blue = vec3(0.10, 0.50, 0.95); vec3 white = vec3(0.80, 0.88, 0.96);
        vec3 col = mix(blue, white, step(0.66, vTint));
        gl_FragColor = vec4(col, vAlpha * 0.62 * smoothstep(0.5, 0.05, d));
      }`,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}
