"use client";
// Imperative Three.js: objects are mutated every frame by design, so the React Compiler skips this file.
"use no memo";
/* eslint-disable react-hooks/immutability -- particle pools, matrices and buffers are mutated inside useFrame, the R3F pattern for per-frame work without allocations. */

/**
 * The workshop "showroom": four procedural stations the camera visits with the
 * scroll — lathe (spinning chuck, steel chips), meshing gears, CNC mill tracing
 * a pocket, and a welding torch throwing sparks. Studio light bars flicker on
 * like fluorescent tubes at load ("automotive reveal").
 *
 * Budget rules: one Canvas, geometries/materials built once, no allocation in
 * useFrame, particle pools updated in place, dpr capped and lowered by the
 * PerformanceMonitor, env map baked once from Lightformers (no CDN presets).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, PerformanceMonitor, RoundedBox } from "@react-three/drei";
import type { MotionValue } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const NAVY = "#030812";
const GLOW = "#5ec8ff";

/* ───────────────────────── Materials (shared) ───────────────────────── */

function useMaterials() {
  return useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: "#16284a", metalness: 0.55, roughness: 0.42 }),
      bodyDark: new THREE.MeshStandardMaterial({ color: "#0c1830", metalness: 0.5, roughness: 0.5 }),
      steel: new THREE.MeshStandardMaterial({ color: "#c9d3e3", metalness: 1, roughness: 0.22 }),
      steelDark: new THREE.MeshStandardMaterial({ color: "#7d8aa3", metalness: 1, roughness: 0.35 }),
      aluminum: new THREE.MeshStandardMaterial({ color: "#aeb9cc", metalness: 0.9, roughness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false }),
      glowSoft: new THREE.MeshBasicMaterial({ color: "#2a6fd0", toneMapped: false, transparent: true, opacity: 0.65 }),
      brass: new THREE.MeshStandardMaterial({ color: "#c79a4b", metalness: 1, roughness: 0.3 }),
      insert: new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: 0.8, roughness: 0.25 }),
    }),
    [],
  );
}
type Mats = ReturnType<typeof useMaterials>;

/* ───────────────────────── Lathe ───────────────────────── */

const CHIP_COLORS = ["#d8b46c", "#b9803f", "#7a5fb0", "#4a7fd6", "#9aa7bd"].map((c) => new THREE.Color(c));
const CHIPS = 46;

function Lathe({ m, quality }: { m: Mats; quality: number }) {
  const spindle = useRef<THREE.Group>(null);
  const carriage = useRef<THREE.Group>(null);
  const chips = useRef<THREE.InstancedMesh>(null);
  const pool = useMemo(
    () =>
      Array.from({ length: CHIPS }, () => ({
        life: -1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
      })),
    [],
  );
  const chipGeo = useMemo(() => new THREE.TorusGeometry(0.045, 0.007, 5, 14, Math.PI * 1.6), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const emit = useRef(0);

  useEffect(() => {
    const mesh = chips.current;
    if (!mesh) return;
    for (let i = 0; i < CHIPS; i++) {
      mesh.setColorAt(i, CHIP_COLORS[i % CHIP_COLORS.length]!);
      dummy.position.set(0, -10, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dummy]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    if (spindle.current) spindle.current.rotation.x -= dt * 9;
    // The carriage feeds along the workpiece and returns: the cut point moves.
    const feed = (t * 0.06) % 1;
    const x = 0.95 - feed * 1.25;
    if (carriage.current) carriage.current.position.x = x;

    const mesh = chips.current;
    if (!mesh) return;
    emit.current += dt * 26 * quality;
    for (const p of pool) {
      if (p.life < 0 && emit.current >= 1) {
        emit.current -= 1;
        p.life = 0;
        p.pos.set(x - 0.02, 1.32, 0.2);
        p.vel.set((Math.random() - 0.3) * 0.6, 0.6 + Math.random() * 1.1, 0.9 + Math.random() * 1.2);
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      }
    }
    for (let i = 0; i < CHIPS; i++) {
      const p = pool[i]!;
      if (p.life < 0) continue;
      p.life += dt;
      p.vel.y -= 4.2 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.62) {
        // Chips land in the bed tray and rest briefly.
        p.pos.y = 0.62;
        p.vel.set(0, 0, 0);
        p.spin.multiplyScalar(0);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      if (p.life > 2.2) p.life = -1;
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(p.life < 0 ? 0 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Legs and bed */}
      <RoundedBox args={[0.7, 0.62, 1]} radius={0.04} position={[-1.7, 0.31, 0]} material={m.bodyDark} castShadow />
      <RoundedBox args={[0.7, 0.62, 1]} radius={0.04} position={[1.7, 0.31, 0]} material={m.bodyDark} castShadow />
      <RoundedBox args={[4.4, 0.28, 0.95]} radius={0.04} position={[0, 0.76, 0]} material={m.body} />
      {/* Ways (guides) */}
      <mesh position={[0, 0.93, 0.28]} material={m.steel}>
        <boxGeometry args={[4.3, 0.06, 0.12]} />
      </mesh>
      <mesh position={[0, 0.93, -0.28]} material={m.steel}>
        <boxGeometry args={[4.3, 0.06, 0.12]} />
      </mesh>
      {/* Headstock */}
      <RoundedBox args={[1.1, 0.95, 0.95]} radius={0.06} position={[-1.65, 1.38, 0]} material={m.body} />
      <mesh position={[-1.65, 1.86, 0.48]} material={m.glow}>
        <boxGeometry args={[0.9, 0.02, 0.01]} />
      </mesh>
      {/* Spindle: chuck + jaws + workpiece rotate together around X */}
      <group ref={spindle} position={[-1.05, 1.32, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={m.steel}>
          <cylinderGeometry args={[0.36, 0.36, 0.26, 48]} />
        </mesh>
        <mesh position={[0.135, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.steelDark}>
          <cylinderGeometry args={[0.3, 0.3, 0.02, 48]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={`jaw-${i}`} rotation={[(i * Math.PI * 2) / 3, 0, 0]}>
            <mesh position={[0.2, 0.2, 0]} material={m.steelDark}>
              <boxGeometry args={[0.14, 0.17, 0.09]} />
            </mesh>
          </group>
        ))}
        {/* Workpiece: a stepped shaft, the turned part shows the job. */}
        <mesh position={[1.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.steel}>
          <cylinderGeometry args={[0.13, 0.13, 1.7, 32]} />
        </mesh>
        <mesh position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.aluminum}>
          <cylinderGeometry args={[0.16, 0.16, 0.5, 32]} />
        </mesh>
      </group>
      {/* Tailstock with live center */}
      <RoundedBox args={[0.6, 0.62, 0.7]} radius={0.05} position={[1.85, 1.24, 0]} material={m.body} />
      <mesh position={[1.43, 1.32, 0]} rotation={[0, 0, Math.PI / 2]} material={m.steel}>
        <coneGeometry args={[0.08, 0.24, 24]} />
      </mesh>
      {/* Carriage, cross slide and tool post with a carbide insert at the cut */}
      <group ref={carriage}>
        <RoundedBox args={[0.6, 0.18, 0.95]} radius={0.03} position={[0, 1.03, 0]} material={m.body} />
        <RoundedBox args={[0.38, 0.14, 0.55]} radius={0.03} position={[0, 1.16, 0.22]} material={m.bodyDark} />
        <mesh position={[0, 1.28, 0.32]} material={m.steelDark}>
          <boxGeometry args={[0.18, 0.12, 0.18]} />
        </mesh>
        <mesh position={[0, 1.31, 0.2]} rotation={[0, 0, 0]} material={m.insert}>
          <boxGeometry args={[0.05, 0.03, 0.12]} />
        </mesh>
        <mesh position={[0, 1.07, 0.48]} material={m.glow}>
          <boxGeometry args={[0.5, 0.012, 0.01]} />
        </mesh>
      </group>
      <instancedMesh ref={chips} args={[chipGeo, m.brass, CHIPS]} frustumCulled={false} />
    </group>
  );
}

/* ───────────────────────── Gears ───────────────────────── */

function gearGeometry(teeth: number, module: number, thickness: number) {
  const pitchR = (module * teeth) / 2;
  const rOut = pitchR + module;
  const rRoot = pitchR - 1.25 * module;
  const step = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: Array<[number, number]> = [
      [rRoot, a],
      [rOut, a + step * 0.16],
      [rOut, a + step * 0.34],
      [rRoot, a + step * 0.5],
      [rRoot, a + step],
    ];
    pts.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  const bore = new THREE.Path();
  bore.absarc(0, 0, Math.max(0.06, rRoot * 0.28), 0, Math.PI * 2, true);
  shape.holes.push(bore);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
  geo.translate(0, 0, -thickness / 2);
  return { geo, pitchR, step };
}

function Gears({ m }: { m: Mats }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const c = useRef<THREE.Mesh>(null);
  const big = useMemo(() => gearGeometry(28, 0.085, 0.3), []);
  const small = useMemo(() => gearGeometry(14, 0.085, 0.3), []);
  const tiny = useMemo(() => gearGeometry(10, 0.085, 0.3), []);
  // Tooth centre sits at 0.25·step; mesh partners face each other with a gap.
  const centerAB = big.pitchR + small.pitchR;
  const angBC = 0.9;
  const centerBC = small.pitchR + tiny.pitchR;

  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.55;
    if (a.current) a.current.rotation.z = -big.step * 0.25 + t;
    if (b.current) b.current.rotation.z = Math.PI - small.step * 0.75 - t * (28 / 14);
    // Gear C meshes with B along angle angBC from B's centre.
    // Mesh condition: a tooth of B on the line of centres faces a gap of C.
    const thetaB = Math.PI - small.step * 0.75 - t * (28 / 14);
    if (c.current) c.current.rotation.z = angBC + Math.PI - tiny.step * 0.75 - (14 / 10) * (thetaB + small.step * 0.25 - angBC);
  });

  return (
    <group position={[8, 1.55, 0]}>
      <RoundedBox args={[4.2, 0.3, 1.2]} radius={0.05} position={[0.6, -1.4, 0]} material={m.bodyDark} />
      <mesh ref={a} geometry={big.geo} material={m.steel} />
      <mesh position={[0, 0, 0.17]} material={m.glow}>
        <torusGeometry args={[0.16, 0.012, 8, 48]} />
      </mesh>
      <mesh ref={b} geometry={small.geo} material={m.brass} position={[centerAB, 0, 0]} />
      <mesh ref={c} geometry={tiny.geo} material={m.steelDark} position={[centerAB + Math.cos(angBC) * centerBC, Math.sin(angBC) * centerBC, 0]} />
      {/* Shafts down to the base */}
      {[0, centerAB].map((x) => (
        <mesh key={x} position={[x, -0.7, -0.25]} material={m.body}>
          <boxGeometry args={[0.16, 1.4, 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── CNC mill ───────────────────────── */

function pocketPath(): THREE.Vector3[] {
  // Rectangular spiral pocket on the block top (local XZ), like a real roughing toolpath.
  const pts: THREE.Vector3[] = [];
  let w = 0.62;
  let d = 0.42;
  while (w > 0.06 && d > 0.06) {
    pts.push(new THREE.Vector3(-w, 0, -d), new THREE.Vector3(w, 0, -d), new THREE.Vector3(w, 0, d), new THREE.Vector3(-w, 0, d));
    w -= 0.08;
    d -= 0.08;
  }
  pts.push(new THREE.Vector3(0, 0, 0));
  return pts;
}

function Cnc({ m }: { m: Mats }) {
  const head = useRef<THREE.Group>(null);
  const tool = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.Line>(null);
  const { curve, line, total } = useMemo(() => {
    const pts = pocketPath();
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i]!, pts[i + 1]!));
    const samples = path.getSpacedPoints(400);
    const geo = new THREE.BufferGeometry().setFromPoints(samples);
    const lineObj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: GLOW, toneMapped: false }));
    return { curve: path, line: lineObj, total: samples.length };
  }, []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const t = (state.clock.elapsedTime % 16) / 14;
    const u = Math.min(1, t);
    curve.getPointAt(u, tmp);
    if (head.current) {
      head.current.position.x = tmp.x;
      head.current.position.z = tmp.z;
      head.current.position.y = t > 1 ? 0.35 : 0;
    }
    if (tool.current) tool.current.rotation.y += Math.min(delta, 0.05) * 30;
    if (trail.current) trail.current.geometry.setDrawRange(0, Math.floor(u * total));
  });

  return (
    <group position={[16, 0, 0]}>
      <RoundedBox args={[2.6, 0.9, 1.8]} radius={0.06} position={[0, 0.45, 0]} material={m.bodyDark} />
      {/* Column */}
      <RoundedBox args={[0.9, 2.8, 0.7]} radius={0.06} position={[0, 2.05, -0.75]} material={m.body} />
      <mesh position={[0.46, 2.05, -0.4]} material={m.glow}>
        <boxGeometry args={[0.012, 2.4, 0.012]} />
      </mesh>
      {/* Table and aluminium block with the pocket being cut */}
      <RoundedBox args={[2.2, 0.12, 1.3]} radius={0.03} position={[0, 0.96, 0.15]} material={m.steelDark} />
      <mesh position={[0, 1.17, 0.15]} material={m.aluminum}>
        <boxGeometry args={[1.5, 0.3, 1.05]} />
      </mesh>
      <group position={[0, 1.325, 0.15]}>
        <primitive ref={trail} object={line} />
      </group>
      {/* Spindle head follows the toolpath */}
      <group position={[0, 0, 0.15]}>
        <group ref={head}>
          <RoundedBox args={[0.55, 0.7, 0.55]} radius={0.05} position={[0, 2.2, 0]} material={m.body} />
          <mesh position={[0, 1.7, 0]} material={m.steel}>
            <cylinderGeometry args={[0.14, 0.18, 0.4, 32]} />
          </mesh>
          <mesh ref={tool} position={[0, 1.42, 0]} material={m.steel}>
            <cylinderGeometry args={[0.035, 0.035, 0.24, 12]} />
          </mesh>
          <mesh position={[0, 1.3, 0]} material={m.glow}>
            <sphereGeometry args={[0.025, 12, 12]} />
          </mesh>
        </group>
      </group>
      {/* Enclosure frame in HUD lines */}
      {[
        [-1.3, 1.8, 1.0],
        [1.3, 1.8, 1.0],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x!, y!, z!]} material={m.glowSoft}>
          <boxGeometry args={[0.02, 1.8, 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, 2.7, 1.0]} material={m.glowSoft}>
        <boxGeometry args={[2.62, 0.02, 0.02]} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── Welding ───────────────────────── */

const SPARKS = 220;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,248,225,1)");
  grad.addColorStop(0.25, "rgba(255,190,90,0.85)");
  grad.addColorStop(1, "rgba(255,120,30,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Welding({ m, quality }: { m: Mats; quality: number }) {
  const torch = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Sprite>(null);
  const hot = useRef<THREE.Mesh>(null);
  const bead = useRef<THREE.InstancedMesh>(null);
  const BEADS = 48;
  const { points, positions, velocities, life, colors } = useMemo(() => {
    const positions = new Float32Array(SPARKS * 3).fill(-50);
    const colors = new Float32Array(SPARKS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    return { points: new THREE.Points(geo, mat), positions, colors, velocities: new Float32Array(SPARKS * 3), life: new Float32Array(SPARKS).fill(-1) };
  }, []);
  const texture = useMemo(() => glowTexture(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const beadGeo = useMemo(() => new THREE.SphereGeometry(0.05, 10, 8), []);
  const emitAcc = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = (state.clock.elapsedTime % 9) / 8;
    const u = Math.min(1, t);
    const z = -0.7 + u * 1.4;
    const welding = t <= 1;
    if (torch.current) torch.current.position.z = z;
    const flicker = welding ? 7 + Math.random() * 9 : 0;
    if (light.current) light.current.intensity = flicker * quality + (welding ? 2 : 0);
    if (halo.current) halo.current.scale.setScalar(welding ? 0.28 + Math.random() * 0.1 : 0.001);
    if (hot.current) {
      hot.current.position.z = z - 0.12;
      hot.current.visible = welding;
    }
    // Bead grows behind the torch.
    const mesh = bead.current;
    if (mesh) {
      const shown = Math.floor(u * BEADS);
      for (let i = 0; i < BEADS; i++) {
        dummy.position.set(0, 1.08, -0.7 + (i / (BEADS - 1)) * 1.4);
        if (!welding || i <= shown) dummy.scale.set(1, 0.55, 1.4);
        else dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    // Spark pool.
    if (welding) emitAcc.current += dt * 420 * quality;
    for (let i = 0; i < SPARKS; i++) {
      const k = i * 3;
      if (life[i]! < 0) {
        if (emitAcc.current >= 1) {
          emitAcc.current -= 1;
          life[i] = 0;
          positions[k] = 0;
          positions[k + 1] = 1.12;
          positions[k + 2] = z;
          const ang = Math.random() * Math.PI * 2;
          const sp = 1.2 + Math.random() * 2.6;
          velocities[k] = Math.cos(ang) * sp * 0.7;
          velocities[k + 1] = 1 + Math.random() * 2.4;
          velocities[k + 2] = Math.sin(ang) * sp * 0.7;
        } else continue;
      }
      life[i]! += dt;
      velocities[k + 1]! -= 9 * dt;
      positions[k]! += velocities[k]! * dt;
      positions[k + 1]! += velocities[k + 1]! * dt;
      positions[k + 2]! += velocities[k + 2]! * dt;
      if (positions[k + 1]! < 0.98) {
        positions[k + 1] = 0.98;
        velocities[k + 1] = -velocities[k + 1]! * 0.3;
        velocities[k]! *= 0.5;
        velocities[k + 2]! *= 0.5;
      }
      const fade = Math.max(0, 1 - life[i]! / 0.7);
      colors[k] = 1 * fade;
      colors[k + 1] = (0.55 + 0.4 * fade) * fade;
      colors[k + 2] = 0.2 * fade * fade;
      if (life[i]! > 0.7) {
        life[i] = -1;
        positions[k + 1] = -50;
      }
    }
    points.geometry.attributes.position!.needsUpdate = true;
    points.geometry.attributes.color!.needsUpdate = true;
  });

  return (
    <group position={[24, 0, 0]}>
      <RoundedBox args={[2.2, 0.9, 1.8]} radius={0.05} position={[0, 0.45, 0]} material={m.bodyDark} />
      <mesh position={[0, 0.94, 0]} material={m.steelDark}>
        <boxGeometry args={[2.1, 0.06, 1.7]} />
      </mesh>
      {/* Two plates with the seam between them */}
      <mesh position={[-0.42, 1.0, 0]} material={m.steel}>
        <boxGeometry args={[0.8, 0.07, 1.5]} />
      </mesh>
      <mesh position={[0.42, 1.0, 0]} material={m.steel}>
        <boxGeometry args={[0.8, 0.07, 1.5]} />
      </mesh>
      <instancedMesh ref={bead} args={[beadGeo, m.steelDark, BEADS]} frustumCulled={false} />
      <mesh ref={hot} position={[0, 1.07, 0]}>
        <capsuleGeometry args={[0.045, 0.18, 4, 8]} />
        <meshBasicMaterial color="#ff8a3c" toneMapped={false} />
      </mesh>
      <group ref={torch}>
        <group position={[0.18, 1.45, 0]} rotation={[0, 0, 0.5]}>
          <mesh material={m.body}>
            <cylinderGeometry args={[0.06, 0.06, 0.6, 16]} />
          </mesh>
          <mesh position={[0, -0.4, 0]} material={m.brass}>
            <coneGeometry args={[0.07, 0.22, 16]} />
          </mesh>
        </group>
        <sprite ref={halo} position={[0, 1.1, 0]}>
          <spriteMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <pointLight ref={light} position={[0, 1.2, 0]} color="#ff9a3c" distance={4} decay={2} />
      </group>
      <primitive object={points} frustumCulled={false} />
    </group>
  );
}

/* ───────────────────────── Studio lights (reveal) ───────────────────────── */

const BARS = [
  { x: 0, delay: 0.15 },
  { x: 8, delay: 0.55 },
  { x: 16, delay: 0.85 },
  { x: 24, delay: 1.15 },
];

/** Fluorescent-tube flicker on at load, then steady. */
function tubeLevel(t: number, delay: number) {
  const s = t - delay;
  if (s < 0) return 0;
  if (s > 0.55) return 1;
  // Two quick stutters before settling.
  return s < 0.08 ? 0.9 : s < 0.16 ? 0.1 : s < 0.24 ? 1 : s < 0.3 ? 0.25 : 0.95;
}

function StudioLights({ reduced }: { reduced: boolean }) {
  const bars = useRef<Array<THREE.Mesh | null>>([]);
  const spots = useRef<Array<THREE.SpotLight | null>>([]);
  const start = useRef<number | null>(null);
  const settled = useRef(false);
  useFrame((state) => {
    if (settled.current) return;
    start.current ??= state.clock.elapsedTime;
    const t = reduced ? 10 : state.clock.elapsedTime - start.current;
    BARS.forEach((b, i) => {
      const level = tubeLevel(t, b.delay);
      const mat = bars.current[i]?.material as THREE.MeshBasicMaterial | undefined;
      if (mat) mat.opacity = 0.15 + 0.85 * level;
      const spot = spots.current[i];
      if (spot) spot.intensity = 38 * level;
    });
    if (t > 2) settled.current = true;
  });
  return (
    <>
      {BARS.map((b, i) => (
        <group key={b.x} position={[b.x, 4.6, 0.6]}>
          <mesh
            ref={(el) => {
              bars.current[i] = el;
            }}
          >
            <boxGeometry args={[3.2, 0.05, 0.16]} />
            <meshBasicMaterial color="#dff3ff" transparent opacity={0.15} toneMapped={false} />
          </mesh>
          <spotLight
            ref={(el) => {
              spots.current[i] = el;
              if (el) {
                // The target is not in the scene graph: place it once, straight below.
                el.target.position.set(b.x, 0, 0);
                el.target.updateMatrixWorld();
              }
            }}
            position={[0, -0.1, 0]}
            angle={0.75}
            penumbra={0.8}
            intensity={0}
            distance={9}
            decay={1.6}
            color="#cfe6ff"
          />
        </group>
      ))}
    </>
  );
}

/* ───────────────────────── Camera rig ───────────────────────── */

/**
 * Text cards sit on the left, so every station is framed on the right half:
 * the camera looks at a point to the left of the subject.
 */
export const KEYFRAMES: Array<{ pos: [number, number, number]; look: [number, number, number] }> = [
  { pos: [1.0, 2.1, 5.6], look: [-2.3, 1.3, 0] }, // hero: the lathe
  { pos: [-0.35, 1.75, 2.5], look: [-1.8, 1.4, 0] }, // ingreso: chuck close-up
  { pos: [9.4, 2.0, 4.6], look: [7.3, 1.5, 0] }, // cotización: gears
  { pos: [17.4, 3.0, 4.8], look: [14.7, 1.5, 0.15] }, // programación: CNC
  { pos: [25.2, 1.9, 3.1], look: [23.0, 1.1, 0] }, // producción: welding
  { pos: [13.5, 4.2, 10.5], look: [9.5, 1.1, 0] }, // entrega: the floor
  { pos: [14, 8.5, 17], look: [9.5, 0.6, 0] }, // gestión: wide reveal
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const P0 = new THREE.Vector3();
const P1 = new THREE.Vector3();
const L0 = new THREE.Vector3();
const L1 = new THREE.Vector3();
const TARGET_POS = new THREE.Vector3();
const TARGET_LOOK = new THREE.Vector3();
const LOOK = new THREE.Vector3(0, 1.25, 0);

/**
 * Camera keyed to scroll: each beat dwells on its station and travels near
 * the boundaries. Critically damped, so it arrives and stops (no lag tail).
 */
function CameraRig({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  const { camera } = useThree();
  const intro = useRef(0);
  // The canvas ignores pointer events (it must never block scrolling), so read the pointer from the window.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const n = KEYFRAMES.length;
    // Beat i is centred when the page has scrolled i viewports: progress i/(n-1).
    const u = Math.min(n - 1, Math.max(0, progress.get() * (n - 1)));
    const seg = Math.min(n - 2, Math.floor(u));
    const local = smooth(0.18, 0.82, u - seg);
    const a = KEYFRAMES[seg]!;
    const b = KEYFRAMES[seg + 1]!;
    P0.set(...a.pos);
    P1.set(...b.pos);
    L0.set(...a.look);
    L1.set(...b.look);
    TARGET_POS.lerpVectors(P0, P1, local);
    TARGET_LOOK.lerpVectors(L0, L1, local);
    // Load dolly: start pulled back and glide in once (the "reveal").
    intro.current = reduced ? 1 : Math.min(1, intro.current + dt / 2.4);
    const pull = (1 - intro.current) ** 3;
    TARGET_POS.x += pull * 2.5;
    TARGET_POS.y += pull * 1.2;
    TARGET_POS.z += pull * 5;
    // A little parallax from the pointer (desktop), never on the critical path.
    if (!reduced) {
      TARGET_POS.x += pointer.current.x * 0.18;
      TARGET_POS.y += pointer.current.y * 0.1;
    }
    const k = reduced ? 1 : 1 - Math.exp(-6 * dt);
    camera.position.lerp(TARGET_POS, k);
    LOOK.lerp(TARGET_LOOK, k);
    camera.lookAt(LOOK);
  });
  return null;
}

/* ───────────────────────── Scene root ───────────────────────── */

export default function WorkshopScene({ progress, active, reduced, onLost }: { progress: MotionValue<number>; active: boolean; reduced: boolean; onLost: () => void }) {
  const [dpr, setDpr] = useState(1.5);
  const [quality, setQuality] = useState(1);
  const m = useMaterials();

  return (
    <Canvas
      aria-hidden
      dpr={[1, dpr]}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 36, near: 0.1, far: 80, position: [5, 3.3, 9.6] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onLost();
        });
      }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", touchAction: "pan-y" }}
    >
      <color attach="background" args={[NAVY]} />
      <fog attach="fog" args={[NAVY, 11, 34]} />
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setQuality(0.5);
        }}
        onIncline={() => {
          setDpr(1.5);
          setQuality(1);
        }}
      />
      <hemisphereLight args={["#7fa6e6", "#030812", 0.35]} />
      <directionalLight position={[6, 8, 6]} intensity={0.6} color="#b4cbf2" />
      <Environment resolution={256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={3} color="#dff3ff" scale={[18, 0.6, 1]} position={[0, 6, 2]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.6} color="#5ec8ff" scale={[10, 0.4, 1]} position={[-6, 2, 4]} rotation-y={Math.PI / 2.4} />
        <Lightformer form="rect" intensity={1.6} color="#7c9cff" scale={[10, 0.4, 1]} position={[6, 2, 4]} rotation-y={-Math.PI / 2.4} />
        <Lightformer form="ring" intensity={2} color="#8fdcff" scale={3} position={[0, 3, -6]} />
      </Environment>
      <StudioLights reduced={reduced} />
      <CameraRig progress={progress} reduced={reduced} />

      <Lathe m={m} quality={quality} />
      <Gears m={m} />
      <Cnc m={m} />
      <Welding m={m} quality={quality} />

      {/* Showroom floor: dark gloss reflecting the light strips + HUD grid */}
      <mesh rotation-x={-Math.PI / 2} position={[12, -0.001, 0]} receiveShadow>
        <planeGeometry args={[80, 40]} />
        <meshStandardMaterial color="#040a17" metalness={0.75} roughness={0.3} />
      </mesh>
      <Grid
        position={[12, 0.002, 0]}
        args={[80, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#0f2a52"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#1f5fae"
        fadeDistance={34}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      <ContactShadows position={[12, 0.003, 0]} scale={[34, 6]} resolution={512} frames={1} blur={2.4} opacity={0.55} far={3} color="#000000" />
    </Canvas>
  );
}
