"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// The landing page's actual signature piece: a pinned scroll-scrubbed 3D
// scene, not a looping decoration. As the user scrolls through the hero,
// the camera dollies forward through a small node cluster toward one
// degraded (amber) node — and exactly at the point the headline finishes
// revealing its second line, that node is "repaired": it flips to cyan and
// pulses. The animation is driven entirely by scroll position (GSAP
// ScrollTrigger scrub), tied to the actual content, not autoplaying on a
// timer.
export function HeroScene({ pinWrapperRef }: { pinWrapperRef: React.RefObject<HTMLDivElement | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const pinWrapper = pinWrapperRef.current;
    if (!container || !pinWrapper) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const NODE_COUNT = 22;
    const nodePositions: THREE.Vector3[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const phi = Math.acos(-1 + (2 * i) / NODE_COUNT);
      const theta = Math.sqrt(NODE_COUNT * Math.PI) * phi;
      const r = 5.2;
      nodePositions.push(
        new THREE.Vector3(
          r * Math.cos(theta) * Math.sin(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(phi) * 0.6
        )
      );
    }

    const degradedIndex = 3;
    const degradedTarget = nodePositions[degradedIndex].clone();

    const nodeGeometry = new THREE.SphereGeometry(0.09, 16, 16);
    const healthyMaterial = new THREE.MeshBasicMaterial({ color: 0x2a5a56 });
    const degradedMaterial = new THREE.MeshBasicMaterial({ color: 0xf5a623 });

    const meshes: THREE.Mesh[] = nodePositions.map((pos, i) => {
      const mesh = new THREE.Mesh(nodeGeometry, i === degradedIndex ? degradedMaterial.clone() : healthyMaterial);
      mesh.position.copy(pos);
      group.add(mesh);
      return mesh;
    });

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x1e2630, transparent: true, opacity: 0.7 });
    for (let i = 0; i < nodePositions.length; i++) {
      const distances = nodePositions
        .map((p, j) => ({ j, d: i === j ? Infinity : p.distanceTo(nodePositions[i]) }))
        .sort((a, b) => a.d - b.d);
      for (const { j } of distances.slice(0, 2)) {
        const geo = new THREE.BufferGeometry().setFromPoints([nodePositions[i], nodePositions[j]]);
        group.add(new THREE.Line(geo, lineMaterial));
      }
    }

    let frameId: number;
    function renderLoop() {
      group.rotation.y += 0.0007;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    // Scroll-scrubbed camera dolly + repair moment, pinned to the hero.
    const st = ScrollTrigger.create({
      trigger: pinWrapper,
      start: "top top",
      end: "+=120%",
      scrub: 1,
      pin: true,
      onUpdate: (self) => {
        const p = self.progress;
        camera.position.z = 14 - p * 9; // 14 -> 5, dolly forward
        camera.position.x = degradedTarget.x * p * 0.35;
        camera.position.y = degradedTarget.y * p * 0.35;
        camera.lookAt(degradedTarget.x * Math.min(p * 1.4, 1), degradedTarget.y * Math.min(p * 1.4, 1), degradedTarget.z);

        const degradedMesh = meshes[degradedIndex];
        const repairT = Math.max(0, (p - 0.72) / 0.28); // repair happens in the final stretch
        const mat = degradedMesh.material as THREE.MeshBasicMaterial;
        mat.color.lerpColors(new THREE.Color(0xf5a623), new THREE.Color(0x35c7c0), Math.min(repairT, 1));
        const scale = 1 + Math.sin(Math.min(repairT, 1) * Math.PI) * 0.6;
        degradedMesh.scale.setScalar(scale);
      },
    });

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      st.kill();
      nodeGeometry.dispose();
      healthyMaterial.dispose();
      degradedMaterial.dispose();
      lineMaterial.dispose();
      meshes.forEach((m) => (m.material as THREE.Material).dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="absolute inset-0 -z-10" aria-hidden="true" />;
}
