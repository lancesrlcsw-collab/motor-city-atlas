// Imperative three.js layer that owns every player figure. React tells it what the current
// lens / focus / selection is; it eases each figure toward that state every frame.
import * as THREE from 'three'
import type { RosterPlayer } from '../types'
import { bodyScale, placePlayers, type Placement } from '../lib/layout'
import { lensById, type LensContext, type LensId } from '../lib/lens'
import type { Focus } from '../store'
import { buildFigure, nameTexture, numberTexture, shadowTexture, tagTexture } from './figure'

export const FIGURE_SCALE = 2.0

export interface PlayerNode {
  p: RosterPlayer
  place: Placement
  group: THREE.Group
  rig: THREE.Group // everything that rides the column
  body: THREE.Mesh
  bodyMat: THREE.MeshStandardMaterial
  numMat: THREE.MeshBasicMaterial | null
  ring: THREE.Mesh
  ringMat: THREE.MeshBasicMaterial
  column: THREE.Mesh
  columnMat: THREE.MeshStandardMaterial
  cap: THREE.Mesh
  label: THREE.Sprite
  tag: THREE.Sprite
  tagText: string
  collider: THREE.Mesh
  height: number // figure height in world units
  col: number; colTarget: number
  lift: number
  dim: number; dimTarget: number
  labelAlpha: number
  tagAlpha: number
  nameAspect: number
  tagAspect: number
  showLabel: boolean
  ghost: number
  ringBase: number
  color: THREE.Color; colorTarget: THREE.Color
  hasValue: boolean
}

const DIM_COLOR = new THREE.Color(0.2, 0.25, 0.31)
const WHITE = new THREE.Color(1, 1, 1)
const tmp = new THREE.Vector3()

export class PlayersLayer {
  root = new THREE.Group()
  colliders = new THREE.Group()
  nodes: PlayerNode[] = []
  byId = new Map<string, PlayerNode>()
  bySlug = new Map<string, PlayerNode>()
  private beam: THREE.Mesh
  private pin: THREE.Mesh
  private halo: THREE.Mesh
  private state = { lens: 'roster' as LensId, focus: 'all' as Focus, selected: null as string | null, hovered: null as string | null, quiet: false, ghost: false }
  private ctx: LensContext
  private time = 0
  private frame = 0

  constructor(players: RosterPlayer[], ctx: LensContext) {
    this.ctx = ctx
    const places = placePlayers(players)
    const shadowTex = shadowTexture()
    const shadowGeo = new THREE.PlaneGeometry(1, 1)
    const ringGeo = new THREE.RingGeometry(1.16, 1.42, 48)
    const ringGeoThin = new THREE.RingGeometry(1.26, 1.4, 48)
    const columnGeo = new THREE.CylinderGeometry(1.02, 1.02, 1, 28, 1, true)
    columnGeo.translate(0, 0.5, 0)
    const capGeo = new THREE.CylinderGeometry(1.08, 1.08, 0.14, 28)
    const colliderGeo = new THREE.CylinderGeometry(1.25, 1.25, 1, 10)
    colliderGeo.translate(0, 0.5, 0)
    const colliderMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    const plateGeo = new THREE.PlaneGeometry(1, 1)
    const figureCache = new Map<string, THREE.BufferGeometry>()

    for (const p of players) {
      const place = places.get(p.id)
      if (!place) continue
      const [h, girth] = bodyScale(p.height, p.weight)
      const height = h * FIGURE_SCALE
      const gKey = girth.toFixed(2)
      if (!figureCache.has(gKey)) figureCache.set(gKey, buildFigure(Number(gKey)))

      const group = new THREE.Group()
      group.position.set(place.x, 0, place.z)
      const rig = new THREE.Group()
      rig.rotation.y = -place.facing
      group.add(rig)

      const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.18, transparent: true })
      const body = new THREE.Mesh(figureCache.get(gKey)!, bodyMat)
      body.scale.setScalar(height)
      rig.add(body)

      let numMat: THREE.MeshBasicMaterial | null = null
      if (p.number !== undefined) {
        numMat = new THREE.MeshBasicMaterial({ map: numberTexture(p.number), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
        for (const side of [1, -1]) {
          const plate = new THREE.Mesh(plateGeo, numMat)
          plate.scale.set(0.2 * height * Math.min(girth, 1.2), 0.17 * height, 1)
          plate.position.set(side * (0.127 * girth + 0.004) * height, 0.69 * height, 0)
          plate.rotation.y = side * Math.PI / 2
          plate.raycast = () => {}
          rig.add(plate)
        }
      }

      const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 }))
      shadow.rotation.x = -Math.PI / 2
      shadow.scale.setScalar(3.6 * girth)
      shadow.position.y = 0.03
      group.add(shadow)

      const starter = !!p.depth?.starter && (place.zone === 'offense' || place.zone === 'defense')
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: starter ? 1 : 0.7, toneMapped: false, side: THREE.DoubleSide, depthWrite: false })
      const ring = new THREE.Mesh(starter ? ringGeo : ringGeoThin, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.06
      group.add(ring)

      const columnMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.3, transparent: true, opacity: 0.92, emissiveIntensity: 0.55 })
      const column = new THREE.Mesh(columnGeo, columnMat)
      column.visible = false
      group.add(column)
      const cap = new THREE.Mesh(capGeo, ringMat)
      cap.visible = false
      group.add(cap)

      const nt = nameTexture(p.number, p.last || p.name, p.depth?.label || p.position || '')
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nt.texture, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }))
      label.renderOrder = 20
      group.add(label)
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0 }))
      tag.renderOrder = 19
      tag.visible = false
      group.add(tag)

      const collider = new THREE.Mesh(colliderGeo, colliderMat)
      collider.position.set(place.x, 0, place.z)
      collider.scale.y = height + 0.6
      collider.userData.id = p.id
      this.colliders.add(collider)

      for (const o of [body, shadow, ring, column, cap, label, tag]) o.raycast = () => {}
      this.root.add(group)
      const node: PlayerNode = {
        p, place, group, rig, body, bodyMat, numMat, ring, ringMat, column, columnMat, cap, label, tag, tagText: '', collider, height,
        col: 0, colTarget: 0, lift: 0, dim: 0, dimTarget: 0, labelAlpha: 0, tagAlpha: 0, nameAspect: nt.aspect, tagAspect: 1, showLabel: false, ghost: 0, ringBase: starter ? 1 : 0.7,
        color: new THREE.Color('#ffffff'), colorTarget: new THREE.Color('#ffffff'), hasValue: true,
      }
      this.nodes.push(node); this.byId.set(p.id, node); this.bySlug.set(p.slug, node)
    }

    // Selection marker, shared and moved to whoever is selected: a soft pool of light on the turf
    // and a hairline pin overhead. Nothing is drawn across the figure itself, so it stays crisp.
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = glowCanvas.height = 128
    const gctx = glowCanvas.getContext('2d')!
    const grad = gctx.createRadialGradient(64, 64, 6, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.32)'); grad.addColorStop(1, 'rgba(255,255,255,0)')
    gctx.fillStyle = grad; gctx.fillRect(0, 0, 128, 128)
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#3db8ff', opacity: 0.7 }))
    this.beam.rotation.x = -Math.PI / 2
    this.beam.scale.setScalar(9.5)
    this.beam.visible = false
    this.beam.raycast = () => {}
    this.root.add(this.beam)
    const pinGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6)
    pinGeo.translate(0, 0.5, 0)
    this.pin = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2.4, 2.8), transparent: true, opacity: 0.75, toneMapped: false, depthWrite: false }))
    this.pin.scale.y = 7
    this.pin.visible = false
    this.pin.raycast = () => {}
    this.root.add(this.pin)
    this.halo = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.95, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3), transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }))
    this.halo.rotation.x = -Math.PI / 2
    this.halo.visible = false
    this.halo.raycast = () => {}
    this.root.add(this.halo)

    this.apply()
  }

  set(next: Partial<PlayersLayer['state']>) {
    Object.assign(this.state, next)
    this.apply()
  }

  /** Recompute every node's targets from the current lens / focus / selection. */
  private apply() {
    const { lens: lensId, focus, selected, ghost } = this.state
    const lens = lensById(lensId)
    for (const n of this.nodes) {
      const v = lens.value(n.p, this.ctx)
      n.colorTarget.set(v.color)
      n.colTarget = v.height * lens.maxHeight
      n.hasValue = !v.empty
      const tagText = v.tag || ''
      if (tagText !== n.tagText) {
        n.tagText = tagText
        const mat = n.tag.material as THREE.SpriteMaterial
        mat.map?.dispose()
        if (tagText) {
          const t = tagTexture(tagText, v.color)
          mat.map = t.texture; mat.needsUpdate = true
          n.tagAspect = t.aspect
        } else { mat.map = null; mat.needsUpdate = true }
      } else if (tagText) {
        // Same text, possibly a new colour.
        const mat = n.tag.material as THREE.SpriteMaterial
        mat.map?.dispose()
        const t = tagTexture(tagText, v.color)
        mat.map = t.texture; mat.needsUpdate = true
        n.tagAspect = t.aspect
      }
      const inFocus = focus === 'all' || (focus === 'bench' ? n.place.zone === 'reserve' || n.place.zone === 'practice' || n.place.zone === 'specialists' : n.place.zone === focus)
      let dim = 0
      if (!inFocus) dim = 0.82
      else if (v.empty) dim = 0.55
      if (selected && n.p.slug !== selected) dim = Math.max(dim, ghost ? 0.93 : 0.45)
      n.dimTarget = dim
    }
    const sel = selected ? this.bySlug.get(selected) : null
    this.beam.visible = !!sel
    this.pin.visible = !!sel
    this.halo.visible = !!sel
  }

  inFocus(n: PlayerNode) {
    const f = this.state.focus
    return f === 'all' || (f === 'bench' ? n.place.zone === 'reserve' || n.place.zone === 'practice' || n.place.zone === 'specialists' : n.place.zone === f)
  }

  /** World position of the player's chest, for the camera to look at. */
  focusPoint(slug: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const n = this.bySlug.get(slug)
    if (!n) return null
    return out.set(n.place.x, n.colTarget + n.height * 0.62, n.place.z)
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewW: number, viewH: number) {
    this.time += dt
    this.frame++
    const { selected, hovered, quiet, lens } = this.state
    const k = 1 - Math.exp(-dt * 7)
    const kSlow = 1 - Math.exp(-dt * 4.2)
    const showTags = lens !== 'roster'
    // Labels are sized in screen pixels so they read the same at any zoom.
    const worldPerPx = (dist: number) => (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / viewH
    const small = viewW < 760
    const NAME_PX = small ? 19 : 23
    const TAG_PX = small ? 17 : 20
    if (this.frame % 4 === 1) this.declutter(camera, viewW, viewH, NAME_PX, TAG_PX)
    const selNode = selected ? this.bySlug.get(selected) ?? null : null

    for (const n of this.nodes) {
      const isSel = n.p.slug === selected
      const isHover = n.p.id === hovered
      n.col += (n.colTarget - n.col) * kSlow
      n.lift += ((isHover && !isSel ? 0.35 : 0) - n.lift) * k
      n.dim += (n.dimTarget - n.dim) * k
      n.color.lerp(n.colorTarget, k)

      const y = n.col + n.lift
      n.rig.position.y = y
      n.column.visible = n.col > 0.04
      if (n.column.visible) { n.column.scale.y = n.col; n.cap.visible = true; n.cap.position.y = n.col - 0.02 } else n.cap.visible = false

      // Anyone standing between the camera and the selected player fades out of the way.
      let blocking = false
      if (selNode && !isSel) {
        const ax = camera.position.x, az = camera.position.z, bx = selNode.place.x, bz = selNode.place.z
        const dx = bx - ax, dz = bz - az
        const len2 = dx * dx + dz * dz || 1
        const t = ((n.place.x - ax) * dx + (n.place.z - az) * dz) / len2
        if (t > 0.02 && t < 0.97) {
          const px = ax + dx * t - n.place.x, pz = az + dz * t - n.place.z
          blocking = px * px + pz * pz < 9.5
        }
      }
      n.ghost += ((blocking ? 1 : 0) - n.ghost) * k

      // Figure tint: full kit colours normally, washed toward slate when dimmed.
      const lit = 1 - n.dim
      n.bodyMat.color.copy(WHITE).lerp(DIM_COLOR, n.dim)
      n.bodyMat.opacity = Math.min(n.dim > 0.9 ? 0.16 : 1, 1 - n.ghost * 0.9)
      n.ringMat.opacity = (n.ringBase) * (1 - n.ghost * 0.8)
      n.bodyMat.emissive.copy(n.color).multiplyScalar(isHover && !isSel ? 0.22 : 0)
      if (n.numMat) n.numMat.opacity = Math.min(n.dim > 0.9 ? 0.12 : 1 - n.dim * 0.55, 1 - n.ghost * 0.92)

      const starter = n.place.rank === 1 && (n.place.zone === 'offense' || n.place.zone === 'defense')
      const boost = (isSel ? 2.6 : isHover ? 2.3 : starter ? 1.55 : 1.0) * (0.25 + 0.75 * lit)
      n.ringMat.color.copy(n.color).multiplyScalar(boost)
      n.columnMat.color.copy(n.color).multiplyScalar(0.5 + 0.5 * lit)
      n.columnMat.emissive.copy(n.color).multiplyScalar(0.5 * lit)
      n.columnMat.opacity = 0.35 + 0.57 * lit

      tmp.set(n.place.x, y + n.height, n.place.z)
      const dist = camera.position.distanceTo(tmp)
      const unit = worldPerPx(dist)
      const pinned = isSel || isHover
      const tagOn = showTags && !!n.tagText
      // Outside the depth-chart lens the value tag takes the label slot; the name joins it on hover.
      const wantName = pinned ? 1 : quiet || tagOn ? 0 : n.showLabel ? 1 : 0
      const wantTag = !tagOn || quiet ? 0 : pinned || n.showLabel ? 1 : 0
      n.labelAlpha += (wantName - n.labelAlpha) * k
      n.tagAlpha += (wantTag - n.tagAlpha) * k

      const tagH = TAG_PX * unit
      const nameH = NAME_PX * unit
      const top = y + n.height + 6 * unit
      const tm = n.tag.material as THREE.SpriteMaterial
      tm.opacity = n.tagAlpha
      n.tag.visible = tagOn && n.tagAlpha > 0.02
      if (n.tag.visible) {
        n.tag.scale.set(n.tagAspect * tagH, tagH, 1)
        n.tag.position.set(0, top + tagH / 2, 0)
      }
      const lm = n.label.material as THREE.SpriteMaterial
      lm.opacity = n.labelAlpha
      n.label.visible = n.labelAlpha > 0.02
      if (n.label.visible) {
        n.label.scale.set(n.nameAspect * nameH, nameH, 1)
        n.label.position.set(0, top + (tagOn ? tagH + 3 * unit : 0) + nameH / 2, 0)
      }
    }

    const sel = selected ? this.bySlug.get(selected) : null
    if (sel) {
      ;(this.beam.material as THREE.MeshBasicMaterial).color.copy(sel.color)
      this.beam.position.set(sel.place.x, 0.07, sel.place.z)
      this.pin.position.set(sel.place.x, sel.col + sel.height + 2.4, sel.place.z)
      const pulse = 1 + 0.07 * Math.sin(this.time * 3.2)
      this.halo.position.set(sel.place.x, 0.08, sel.place.z)
      this.halo.scale.setScalar(pulse)
      ;(this.halo.material as THREE.MeshBasicMaterial).color.copy(sel.color).multiplyScalar(2.4)
    }
  }

  /**
   * Decide which labels may show. Each candidate is projected to the screen and placed in
   * priority order; one that would overlap an already-placed label waits until there is room.
   */
  private declutter(camera: THREE.PerspectiveCamera, viewW: number, viewH: number, namePx: number, tagPx: number) {
    const { selected, hovered, lens } = this.state
    const showTags = lens !== 'roster'
    const placed: [number, number, number, number][] = []
    const items: { n: PlayerNode; prio: number; x: number; y: number; w: number; h: number }[] = []
    for (const n of this.nodes) {
      n.showLabel = false
      const isSel = n.p.slug === selected, isHover = n.p.id === hovered
      if (n.dim > 0.4 && !isSel && !isHover) continue
      if (selected && !isSel && !isHover) continue
      const tagOn = showTags && !!n.tagText
      if (showTags && !tagOn && !isSel && !isHover) continue
      tmp.set(n.place.x, n.col + n.height, n.place.z)
      const dist = camera.position.distanceTo(tmp)
      const starter = n.place.rank === 1 && (n.place.zone === 'offense' || n.place.zone === 'defense')
      if (!tagOn && !starter && dist > 62 && !isSel && !isHover) continue
      tmp.project(camera)
      if (tmp.z > 1 || tmp.z < -1) continue
      const sx = (tmp.x * 0.5 + 0.5) * viewW, sy = (-tmp.y * 0.5 + 0.5) * viewH
      if (sx < -60 || sx > viewW + 60 || sy < -40 || sy > viewH + 40) continue
      const h = tagOn ? tagPx : namePx
      const w = (tagOn ? n.tagAspect : n.nameAspect) * h
      const weight = tagOn ? n.colTarget * 40 : n.p.lens?.cap ?? 0
      const prio = (isSel ? 1e6 : 0) + (isHover ? 5e5 : 0) + (starter ? 1000 : 0) + weight - dist * 0.5
      items.push({ n, prio, x: sx - w / 2, y: sy - h - 8, w, h })
    }
    items.sort((a, b) => b.prio - a.prio)
    for (const it of items) {
      const pad = 4
      let free = true
      for (const r of placed) {
        if (it.x < r[0] + r[2] + pad && it.x + it.w + pad > r[0] && it.y < r[1] + r[3] + pad && it.y + it.h + pad > r[1]) { free = false; break }
      }
      if (!free && it.prio < 5e5) continue
      it.n.showLabel = true
      placed.push([it.x, it.y, it.w, it.h])
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.()
    })
  }
}
