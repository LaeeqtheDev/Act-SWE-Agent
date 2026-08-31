"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// The landing page's signature piece, rebuilt from scratch: a continuous
// particle flow — thousands of points drifting along curved telemetry-like
// paths, most a quiet neutral gray, a handful pulsing amber (an "event"
// being caught) before settling back to neutral (resolved). This animates
// on its own via requestAnimationFrame — it isn't just a camera move tied to
// scroll position. Scrolling subtly increases flow speed and amber density
// as a secondary, not primary, effect.
export function FlowField() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 11);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const PARTICLE_COUNT = 900;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT); // per-particle phase offset
    const lanes = new Float32Array(PARTICLE_COUNT); // which flow lane (y-band)
    const isEvent = new Float32Array(PARTICLE_COUNT); // 1 for the rare amber "caught event" particles

    const LANES = 7;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const lane = Math.floor(Math.random() * LANES);
      lanes[i] = lane;
      positions[i * 3] = (Math.random() - 0.5) * 16; // x: spread along the flow direction
      positions[i * 3 + 1] = (lane - LANES / 2) * 0.9 + (Math.random() - 0.5) * 0.3; // y: lane band
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4; // z: depth
      seeds[i] = Math.random() * Math.PI * 2;
      isEvent[i] = Math.random() < 0.035 ? 1 : 0; // ~3.5% are "events"
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const neutral = new THREE.Color(0xb8bcc2);
    const amber = new THREE.Color(0xe0a850);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const c = isEvent[i] ? amber : neutral;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let scrollIntensity = 0; // 0..1, driven by how far the user has scrolled
    function handleScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollIntensity = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    let frameId: number;
    const clock = new THREE.Clock();

    function animate() {
      const t = clock.getElapsedTime();
      const speed = 0.55 + scrollIntensity * 0.9; // scroll only ever nudges speed, never drives position directly

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        let x = posAttr.array[ix] as number;
        x += speed * 0.012;
        if (x > 8) x = -8;
        posAttr.array[ix] = x;
        // gentle vertical drift per-particle so lanes aren't perfectly rigid
        posAttr.array[ix + 1] = (lanes[i] - LANES / 2) * 0.9 + Math.sin(t * 0.4 + seeds[i]) * 0.15;
      }
      posAttr.needsUpdate = true;

      points.rotation.y = Math.sin(t * 0.05) * 0.08;
      camera.position.x = Math.sin(t * 0.03) * 0.6;
      camera.lookAt(0, 0, 0);

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
      window.removeEventListener("scroll", handleScroll);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 -z-10" aria-hidden="true" />;
}
