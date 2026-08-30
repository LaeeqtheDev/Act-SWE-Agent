"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// The hero's ambient signature: a small cluster of nodes connected by thin
// lines, slowly rotating — a minimal stand-in for "a fleet of services being
// watched." Deliberately quiet (low opacity, slow motion, no bloom/particles)
// so it reads as atmosphere behind the headline, not a centerpiece fighting it.
export function NodeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // Node positions: a handful of points scattered on a rough sphere shell —
    // reads as "distributed services," not a generic geometric primitive.
    const NODE_COUNT = 14;
    const nodePositions: THREE.Vector3[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const phi = Math.acos(-1 + (2 * i) / NODE_COUNT);
      const theta = Math.sqrt(NODE_COUNT * Math.PI) * phi;
      const r = 3.4;
      nodePositions.push(
        new THREE.Vector3(
          r * Math.cos(theta) * Math.sin(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(phi)
        )
      );
    }

    const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
    const healthyMaterial = new THREE.MeshBasicMaterial({ color: 0x35c7c0 });
    const warnMaterial = new THREE.MeshBasicMaterial({ color: 0xf5a623 });

    // One node runs "degraded" (amber) — a quiet visual echo of the product's
    // actual concept, without needing any text to explain it.
    const degradedIndex = 4;
    nodePositions.forEach((pos, i) => {
      const mesh = new THREE.Mesh(nodeGeometry, i === degradedIndex ? warnMaterial : healthyMaterial);
      mesh.position.copy(pos);
      group.add(mesh);
    });

    // Connect each node to its two nearest neighbors with a faint line.
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2a3644, transparent: true, opacity: 0.5 });
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
    const clock = new THREE.Clock();

    function animate() {
      const t = clock.getElapsedTime();
      group.rotation.y = t * 0.08;
      group.rotation.x = Math.sin(t * 0.05) * 0.15;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

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
      nodeGeometry.dispose();
      healthyMaterial.dispose();
      warnMaterial.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 -z-10" aria-hidden="true" />;
}
