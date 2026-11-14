import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { FIELD, ZONE_LABELS } from '../lib/layout'
import { BG, buildCrowd, buildRoof, buildStands, fieldTexture, floorLabel, gridTexture } from './stadium'
import { PlayersLayer } from './playersLayer'
import { ZoneOverlay } from './ZoneOverlay'

/** Shared handle so the camera rig and overlays can ask the layer where a player stands. */
export const layerRef: { current: PlayersLayer | null } = { current: null }

function Stadium() {
  const gl = useThree((s) => s.gl)
  const dpr = useThree((s) => s.viewport.dpr)
  const { field, grid, roof, stands, crowd, labels } = useMemo(() => {
    const aniso = gl.capabilities.getMaxAnisotropy()
    return {
      field: fieldTexture(aniso),
      grid: gridTexture(),
      roof: buildRoof(),
      stands: buildStands(),
      crowd: buildCrowd(),
      labels: ZONE_LABELS.map((l) => ({ ...l, ...floorLabel(l.text) })),
    }
  }, [gl])
  useFrame((state, dt) => {
    const u = (crowd.material as THREE.ShaderMaterial).uniforms
    u.uTime.value += dt
    u.uPixelRatio.value = dpr
    // Looking down from above the trusses (the phone's tactical view), the roof would cover the field.
    const z = state.camera.position.z
    roof.visible = state.camera.position.y < 52 + 60 * (1 - (z / 172) ** 2) - 6
  })
  return (
    <group>
      {/* Blueprint floor to the horizon */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.06}>
        <planeGeometry args={[1400, 1400]} />
        <meshBasicMaterial map={grid} color="#9fc4e6" />
      </mesh>
      {/* Apron around the field */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
        <planeGeometry args={[FIELD.length + 26, FIELD.width + 30]} />
        <meshStandardMaterial color="#081624" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[FIELD.length, FIELD.width]} />
        <meshStandardMaterial map={field} emissiveMap={field} emissive="#ffffff" emissiveIntensity={0.42} roughness={0.95} metalness={0} />
      </mesh>
      {labels.map((l) => (
        <mesh key={l.text} rotation-x={-Math.PI / 2} position={[l.x, 0.02, l.z]}>
          <planeGeometry args={[2.6 * l.aspect, 2.6]} />
          <meshBasicMaterial map={l.texture} transparent depthWrite={false} />
        </mesh>
      ))}
      <primitive object={roof} />
      <primitive object={stands} />
      <primitive object={crowd} />
    </group>
  )
}

function Players() {
  const roster = useStore((s) => s.roster)
  const team = useStore((s) => s.team)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let live = true
    const fonts = ['800 64px "Saira Extra Condensed"', '700 64px "Saira Extra Condensed"', '600 44px "Saira Condensed"', '700 44px "Saira Condensed"']
    Promise.all(fonts.map((f) => document.fonts.load(f))).catch(() => {}).finally(() => { if (live) setFontsReady(true) })
    return () => { live = false }
  }, [])

  const layer = useMemo(() => {
    if (!roster.length || !team || !fontsReady) return null
    const maxCap = Math.max(1, ...roster.map((p) => p.lens?.cap ?? 0))
    return new PlayersLayer(roster, { season: team.season, maxCap })
  }, [roster, team, fontsReady])

  useEffect(() => {
    layerRef.current = layer
    return () => { layer?.dispose(); if (layerRef.current === layer) layerRef.current = null }
  }, [layer])

  const lens = useStore((s) => s.lens)
  const focus = useStore((s) => s.focus)
  const selected = useStore((s) => s.selected)
  const hovered = useStore((s) => s.hovered)
  const panel = useStore((s) => s.panel)
  const overlay = useStore((s) => s.overlay)
  useEffect(() => { layer?.set({ lens, focus, selected, hovered, quiet: !!panel, ghost: !!overlay }) }, [layer, lens, focus, selected, hovered, panel, overlay])

  useFrame((state, dt) => layer?.update(Math.min(dt, 0.05), state.camera as THREE.PerspectiveCamera, state.size.width, state.size.height))

  const hover = useStore((s) => s.hover)
  const select = useStore((s) => s.select)
  useEffect(() => { document.body.style.cursor = hovered ? 'pointer' : '' }, [hovered])
  if (!layer) return null
  return (
    <>
      <primitive object={layer.root} />
      <primitive
        object={layer.colliders}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hover(e.object.userData.id) }}
        onPointerOut={() => hover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.delta > 8) return // a drag, not a click
          const node = layer.byId.get(e.object.userData.id)
          if (node) select(node.p.slug)
        }}
      />
    </>
  )
}

type V3 = readonly [number, number, number]
const lookAt = (c: CameraControls, pos: V3, target: V3, transition: boolean) => c.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], transition)

const HOME = { landscape: { pos: [-2, 62, 104], target: [-1, 0, 5], fov: 36 }, portrait: { pos: [-40, 158, 0.01], target: [-2, 0, 0], fov: 58 } } as const
const FOCUS_VIEW: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  offense: { pos: [-34, 30, 56], target: [-21, 0, 1] },
  defense: { pos: [36, 32, 58], target: [22, 0, 1] },
  bench: { pos: [0, 118, 46], target: [0, 0, 0] },
}

function Rig() {
  const controls = useRef<CameraControls>(null)
  const { camera, size } = useThree()
  const portrait = size.width / size.height < 1.05
  const selected = useStore((s) => s.selected)
  const focus = useStore((s) => s.focus)
  const panel = useStore((s) => s.panel)
  const lens = useStore((s) => s.lens)
  const overlay = useStore((s) => s.overlay)
  const status = useStore((s) => s.status)
  const touring = useStore((s) => s.touring)
  const introDone = useStore((s) => s.introDone)
  const started = useRef(false)

  // Handy when tuning views from the browser console during development.
  useEffect(() => { if (import.meta.env.DEV) { (window as any).__cam = controls.current; (window as any).__layer = layerRef } })

  // Field of view follows the aspect ratio so the whole field fits on a phone held upright.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = portrait ? HOME.portrait.fov : HOME.landscape.fov
    cam.updateProjectionMatrix()
  }, [camera, portrait])

  // Opening move: drop from the roof to the broadcast angle.
  useEffect(() => {
    const c = controls.current
    if (!c || status !== 'ready' || started.current) return
    started.current = true
    const home = portrait ? HOME.portrait : HOME.landscape
    const deep = useStore.getState().selected || useStore.getState().panel
    if (deep) { useStore.getState().finishIntro(); return }
    if (portrait) c.setLookAt(-70, 260, 0.01, 0, 0, 0, false)
    else c.setLookAt(home.pos[0] * 0.3 - 30, 150, home.pos[2] * 0.3 + 70, 0, 0, 0, false)
    c.smoothTime = 1.15
    lookAt(c, home.pos, home.target, true).then(() => { c.smoothTime = 0.42; useStore.getState().finishIntro(); useStore.getState().setTouring(!portrait) })
  }, [status, portrait])

  // Fly to the selection, the focused unit, or back home.
  useEffect(() => {
    const c = controls.current
    if (!c || status !== 'ready') return
    const home = portrait ? HOME.portrait : HOME.landscape
    const cam = camera as THREE.PerspectiveCamera
    let cancelled = false
    const go = () => {
      if (cancelled) return
      const layer = layerRef.current
      if (selected && overlay) {
        // Tendency maps are painted downfield of the line, so step back behind the offense to read them.
        const vh = 2 * 70 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
        if (portrait) { c.setLookAt(-66, 60, 0.01, 12, 0, 0, true); c.setFocalOffset(0, vh * 0.2, 0, true) }
        else { c.setLookAt(-46, 40, 22, 12, 0, 0, true); c.setFocalOffset(Math.min(0.5, 280 / size.width) * vh * cam.aspect * 0.5, 0, 0, true) }
        return
      }
      if (selected) {
        if (!layer) { setTimeout(go, 80); return }
        const node = layer.bySlug.get(selected)
        const t = layer.focusPoint(selected)
        if (!node || !t) return
        const dist = portrait ? 15 : 12.5
        // Stand in front of the player, a little to one side and above.
        const front = new THREE.Vector3(Math.cos(node.place.facing), 0, -Math.sin(node.place.facing))
        const sideways = new THREE.Vector3(-front.z, 0, front.x)
        const pos = t.clone().addScaledVector(front, dist * 0.74).addScaledVector(sideways, dist * 0.5).add(new THREE.Vector3(0, dist * 0.3, 0))
        c.setLookAt(pos.x, pos.y, pos.z, t.x, t.y, t.z, true)
        // Slide the subject clear of the dossier panel.
        const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
        if (portrait) c.setFocalOffset(0, vh * 0.27, 0, true)
        else c.setFocalOffset(Math.min(0.5, 280 / size.width) * vh * cam.aspect * 0.5, vh * 0.03, 0, true)
        return
      }
      c.setFocalOffset(0, 0, 0, true)
      if (panel) {
        // Team panels: a slow high orbit behind the glass.
        c.setLookAt(-70, 62, 96, 0, 0, 0, true)
        return
      }
      if (focus !== 'all' && FOCUS_VIEW[focus]) {
        const v = FOCUS_VIEW[focus]
        const k = portrait ? 1.9 : 1
        c.setLookAt(v.target[0] + (v.pos[0] - v.target[0]) * k, v.pos[1] * k, v.target[2] + (v.pos[2] - v.target[2]) * k, ...v.target, true)
        return
      }
      if (introDone) lookAt(c, home.pos, home.target, true)
    }
    go()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, focus, panel, portrait, status, overlay])

  // Lens changes move the columns under the selected player: keep the camera on him.
  useEffect(() => {
    const c = controls.current
    if (!c || !selected) return
    const id = setTimeout(() => {
      const t = layerRef.current?.focusPoint(selected)
      if (t) c.moveTo(t.x, t.y, t.z, true)
    }, 60)
    return () => clearTimeout(id)
  }, [lens, selected])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if ((touring && !selected) || panel) c.azimuthAngle += dt * (panel ? 0.035 : 0.022)
  })

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={portrait ? 300 : 210}
      maxPolarAngle={Math.PI / 2 - 0.06}
      smoothTime={0.42}
      draggingSmoothTime={0.12}
      dollyToCursor={false}
      onStart={() => useStore.getState().setTouring(false)}
    />
  )
}

function Effects() {
  const size = useThree((s) => s.size)
  const small = size.width < 760
  return (
    <EffectComposer multisampling={small ? 0 : 4}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1.0} luminanceSmoothing={0.25} radius={0.72} />
      <Vignette offset={0.28} darkness={0.78} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

export function Scene() {
  return (
    <Canvas
      className="scene"
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 36, near: 0.5, far: 1600, position: [-30, 150, 100] }}
    >
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, 0.0036]} />
      <hemisphereLight args={['#cfe6ff', '#0b1a2b', 1.15]} />
      <directionalLight position={[40, 90, 60]} intensity={2.6} color="#ffffff" />
      <directionalLight position={[-70, 50, -80]} intensity={1.5} color="#56bdff" />
      <Suspense fallback={null}>
        <Stadium />
        <Players />
        <ZoneOverlay />
      </Suspense>
      <Rig />
      <Effects />
    </Canvas>
  )
}
