"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type Point = { x: number; y: number };
type LogicNode = {
  x: number;
  y: number;
  size: number;
  depth: number;
  color: string;
  shape: "circle" | "square" | "pill";
  mark: number;
};

const COLORS = {
  ink: "#10234a",
  blue: "#185dd8",
  teal: "#14a8a0",
  orange: "#ff9f1c",
  violet: "#a890e8",
  white: "#fffefb",
};

const NODES: LogicNode[] = [
  { x: 0.12, y: 0.22, size: 34, depth: 0.7, color: COLORS.orange, shape: "circle", mark: 0 },
  { x: 0.31, y: 0.16, size: 54, depth: 1, color: COLORS.white, shape: "square", mark: 1 },
  { x: 0.57, y: 0.23, size: 68, depth: 1.35, color: COLORS.blue, shape: "square", mark: 2 },
  { x: 0.83, y: 0.14, size: 42, depth: 0.65, color: COLORS.white, shape: "pill", mark: 3 },
  { x: 0.18, y: 0.5, size: 64, depth: 1.2, color: COLORS.white, shape: "square", mark: 4 },
  { x: 0.43, y: 0.47, size: 42, depth: 0.85, color: COLORS.teal, shape: "circle", mark: 0 },
  { x: 0.69, y: 0.5, size: 58, depth: 1.45, color: COLORS.white, shape: "square", mark: 5 },
  { x: 0.88, y: 0.43, size: 32, depth: 0.8, color: COLORS.violet, shape: "circle", mark: 0 },
  { x: 0.12, y: 0.78, size: 38, depth: 0.7, color: COLORS.violet, shape: "pill", mark: 3 },
  { x: 0.36, y: 0.75, size: 72, depth: 1.5, color: COLORS.white, shape: "square", mark: 6 },
  { x: 0.65, y: 0.8, size: 36, depth: 0.9, color: COLORS.orange, shape: "circle", mark: 0 },
  { x: 0.88, y: 0.73, size: 56, depth: 1.1, color: COLORS.white, shape: "square", mark: 1 },
];

const ROUTES = [
  [[0, 1], [1, 2], [2, 4], [4, 5], [5, 6], [6, 7], [6, 10], [10, 11]],
  [[0, 4], [4, 1], [1, 5], [5, 2], [2, 7], [7, 6], [6, 9], [9, 10], [10, 11]],
  [[0, 1], [1, 4], [4, 9], [9, 5], [5, 2], [2, 3], [2, 6], [6, 11], [11, 10]],
] as const;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawMark(
  context: CanvasRenderingContext2D,
  node: LogicNode,
  x: number,
  y: number,
  size: number,
) {
  const dark = node.color === COLORS.white;
  context.strokeStyle = dark ? "rgba(16,35,74,.48)" : "rgba(255,255,255,.82)";
  context.fillStyle = context.strokeStyle;
  context.lineWidth = 1.5;
  context.lineCap = "round";

  if (node.mark === 1) {
    for (let index = -1; index <= 1; index += 1) {
      context.beginPath();
      context.arc(x + index * size * 0.19, y, size * 0.045, 0, Math.PI * 2);
      context.fill();
    }
  } else if (node.mark === 2) {
    context.beginPath();
    context.moveTo(x - size * 0.17, y - size * 0.12);
    context.lineTo(x, y);
    context.lineTo(x - size * 0.17, y + size * 0.12);
    context.moveTo(x, y);
    context.lineTo(x + size * 0.2, y);
    context.stroke();
  } else if (node.mark === 3) {
    context.beginPath();
    context.moveTo(x - size * 0.2, y);
    context.lineTo(x + size * 0.2, y);
    context.stroke();
  } else if (node.mark === 4) {
    for (let row = -1; row <= 1; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        context.beginPath();
        context.arc(x + column * size * 0.15, y + row * size * 0.15, size * 0.025, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (node.mark === 5) {
    context.beginPath();
    context.arc(x, y, size * 0.2, Math.PI * 0.15, Math.PI * 1.35);
    context.stroke();
    context.beginPath();
    context.arc(x + size * 0.08, y - size * 0.03, size * 0.055, 0, Math.PI * 2);
    context.fill();
  } else if (node.mark === 6) {
    [-0.17, 0, 0.17].forEach((offset, index) => {
      context.strokeStyle = [COLORS.blue, COLORS.teal, COLORS.orange][index];
      context.beginPath();
      context.moveTo(x - size * 0.2, y + size * offset);
      context.lineTo(x + size * 0.2, y + size * offset);
      context.stroke();
    });
  }
}

export function LogicPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const pointerTarget = useRef<Point>({ x: 0, y: 0 });
  const tilt = useRef<Point>({ x: 0, y: 0 });
  const tiltTarget = useRef<Point>({ x: 0, y: 0 });
  const pulseStarted = useRef(performance.now());
  const routeRef = useRef(0);
  const [route, setRoute] = useState(0);
  const [tiltPermission, setTiltPermission] = useState<
    "unavailable" | "available" | "enabled" | "denied"
  >("unavailable");

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    tiltTarget.current = {
      x: Math.max(-1, Math.min(1, (event.gamma || 0) / 28)),
      y: Math.max(-1, Math.min(1, ((event.beta || 0) - 35) / 34)),
    };
  }, []);

  const reroute = useCallback(() => {
    const next = (routeRef.current + 1) % ROUTES.length;
    routeRef.current = next;
    pulseStarted.current = performance.now();
    setRoute(next);
  }, []);

  useEffect(() => {
    const permissionEvent = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    setTiltPermission(typeof permissionEvent.requestPermission === "function" ? "available" : "enabled");

    if (typeof permissionEvent.requestPermission !== "function") {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [handleOrientation]);

  async function enableTilt() {
    const permissionEvent = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (!permissionEvent.requestPermission) return;
    try {
      const permission = await permissionEvent.requestPermission();
      if (permission === "granted") {
        window.addEventListener("deviceorientation", handleOrientation, true);
        setTiltPermission("enabled");
      } else {
        setTiltPermission("denied");
      }
    } catch {
      setTiltPermission("denied");
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const maybeContext = canvas.getContext("2d");
    if (!maybeContext) return;
    const context: CanvasRenderingContext2D = maybeContext;

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const bounds = frame.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(density, 0, 0, density, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    resize();

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    reducedMotionQuery.addEventListener("change", updateMotion);

    function pointFor(node: LogicNode, time: number): Point {
      const drift = reducedMotion ? 0 : Math.sin(time * 0.0007 + node.x * 12) * 2.5;
      const influenceX = pointer.current.x * 11 + tilt.current.x * 16;
      const influenceY = pointer.current.y * 11 + tilt.current.y * 16;
      return {
        x: node.x * width + influenceX * node.depth + drift,
        y: node.y * height + influenceY * node.depth + drift * 0.45,
      };
    }

    function draw(time: number) {
      pointer.current.x += (pointerTarget.current.x - pointer.current.x) * 0.065;
      pointer.current.y += (pointerTarget.current.y - pointer.current.y) * 0.065;
      tilt.current.x += (tiltTarget.current.x - tilt.current.x) * 0.04;
      tilt.current.y += (tiltTarget.current.y - tilt.current.y) * 0.04;
      context.clearRect(0, 0, width, height);

      const glow = context.createRadialGradient(
        width * (0.58 + pointer.current.x * 0.08),
        height * (0.45 + pointer.current.y * 0.08),
        10,
        width * 0.55,
        height * 0.48,
        Math.max(width, height) * 0.75,
      );
      glow.addColorStop(0, "rgba(255,159,28,.14)");
      glow.addColorStop(0.44, "rgba(143,221,235,.09)");
      glow.addColorStop(1, "rgba(251,248,241,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      context.fillStyle = "rgba(16,35,74,.095)";
      const grid = Math.max(28, width / 12);
      for (let x = grid * 0.5; x < width; x += grid) {
        for (let y = grid * 0.5; y < height; y += grid) {
          context.beginPath();
          context.arc(x, y, 1, 0, Math.PI * 2);
          context.fill();
        }
      }

      const nodePoints = NODES.map((node) => pointFor(node, time));
      const routePairs = ROUTES[routeRef.current];
      const elapsed = (time - pulseStarted.current) / 1000;

      routePairs.forEach(([fromIndex, toIndex], index) => {
        const from = nodePoints[fromIndex];
        const to = nodePoints[toIndex];
        const bend = Math.max(18, Math.abs(to.x - from.x) * 0.34);
        context.lineWidth = 1.3;
        context.strokeStyle = "rgba(16,35,74,.23)";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.bezierCurveTo(from.x + bend, from.y, to.x - bend, to.y, to.x, to.y);
        context.stroke();

        const pulse = elapsed * 0.58 - index * 0.11;
        if (pulse >= 0 && pulse <= 1) {
          const inverse = 1 - pulse;
          const x =
            inverse ** 3 * from.x +
            3 * inverse ** 2 * pulse * (from.x + bend) +
            3 * inverse * pulse ** 2 * (to.x - bend) +
            pulse ** 3 * to.x;
          const y =
            inverse ** 3 * from.y +
            3 * inverse ** 2 * pulse * from.y +
            3 * inverse * pulse ** 2 * to.y +
            pulse ** 3 * to.y;
          context.fillStyle = index % 2 ? COLORS.orange : COLORS.teal;
          context.shadowColor = context.fillStyle;
          context.shadowBlur = 12;
          context.beginPath();
          context.arc(x, y, 4.5, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
        }
      });

      NODES.forEach((node, index) => {
        const point = nodePoints[index];
        const scale = Math.min(1.1, Math.max(0.72, width / 430));
        const size = node.size * scale;
        const distance = Math.hypot(
          point.x - width * (pointer.current.x * 0.5 + 0.5),
          point.y - height * (pointer.current.y * 0.5 + 0.5),
        );
        const lift = Math.max(0, 1 - distance / 120) * 7;
        context.shadowColor = "rgba(43,84,149,.17)";
        context.shadowBlur = 16 + lift;
        context.shadowOffsetY = 8 + lift;
        context.fillStyle = node.color;
        context.strokeStyle = node.color === COLORS.white ? "rgba(16,35,74,.12)" : "rgba(255,255,255,.45)";
        context.lineWidth = 1;

        if (node.shape === "circle") {
          context.beginPath();
          context.arc(point.x, point.y - lift, size * 0.42, 0, Math.PI * 2);
        } else {
          const nodeWidth = node.shape === "pill" ? size * 1.32 : size;
          const nodeHeight = node.shape === "pill" ? size * 0.56 : size;
          roundedRect(
            context,
            point.x - nodeWidth / 2,
            point.y - nodeHeight / 2 - lift,
            nodeWidth,
            nodeHeight,
            node.shape === "pill" ? nodeHeight / 2 : size * 0.24,
          );
        }
        context.fill();
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        context.stroke();
        drawMark(context, node, point.x, point.y - lift, size);
      });

      if (elapsed > routePairs.length * 0.11 + 1.8) pulseStarted.current = time;
      animationFrame = requestAnimationFrame(draw);
    }

    animationFrame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      reducedMotionQuery.removeEventListener("change", updateMotion);
    };
  }, []);

  function updatePointer(clientX: number, clientY: number) {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds) return;
    pointerTarget.current = {
      x: Math.max(-1, Math.min(1, ((clientX - bounds.left) / bounds.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((clientY - bounds.top) / bounds.height - 0.5) * 2)),
    };
  }

  return (
    <section className={styles.playgroundShell} aria-label="Interactive logic playground">
      <div
        ref={frameRef}
        className={styles.playground}
        onPointerMove={(event) => updatePointer(event.clientX, event.clientY)}
        onPointerLeave={() => {
          pointerTarget.current = { x: 0, y: 0 };
        }}
        onPointerDown={(event) => {
          updatePointer(event.clientX, event.clientY);
          reroute();
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className={styles.playgroundTop}>
          <span><i aria-hidden="true" />live logic</span>
          <span>route 0{route + 1}</span>
        </div>
        <button
          className={styles.reroute}
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={reroute}
        >
          Reroute <span aria-hidden="true">↗</span>
        </button>
        {tiltPermission === "available" && (
          <button
            className={styles.tilt}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={enableTilt}
          >
            Enable phone tilt
          </button>
        )}
        {tiltPermission === "denied" && (
          <span className={styles.tiltDenied}>Tilt permission was declined</span>
        )}
      </div>
    </section>
  );
}
