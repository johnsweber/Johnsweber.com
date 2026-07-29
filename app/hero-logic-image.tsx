"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type MotionStyle = CSSProperties & {
  "--mx": string;
  "--my": string;
  "--tx": string;
  "--ty": string;
  "--sx": string;
  "--sy": string;
  "--stx": string;
  "--sty": string;
};

export function HeroLogicImage() {
  const frameRef = useRef<HTMLDivElement>(null);
  const gestureStart = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const bursting = useRef(false);
  const burstTimer = useRef<number | undefined>(undefined);
  const [route, setRoute] = useState(0);
  const [tiltAvailable, setTiltAvailable] = useState(false);

  const setActive = useCallback((active: boolean) => {
    if (frameRef.current) {
      frameRef.current.dataset.active = active ? "true" : "false";
    }
  }, []);

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    const x = Math.max(-1.35, Math.min(1.35, ((clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1.35, Math.min(1.35, ((clientY - bounds.top) / bounds.height - 0.5) * 2));
    frame.style.setProperty("--mx", `${x * 16}px`);
    frame.style.setProperty("--my", `${y * 16}px`);
    frame.style.setProperty("--sx", `${x * 4}px`);
    frame.style.setProperty("--sy", `${y * 4}px`);
  }, []);

  const resetPointer = useCallback(() => {
    frameRef.current?.style.setProperty("--mx", "0px");
    frameRef.current?.style.setProperty("--my", "0px");
    frameRef.current?.style.setProperty("--sx", "0px");
    frameRef.current?.style.setProperty("--sy", "0px");
  }, []);

  const applyTilt = useCallback((tiltX: number, tiltY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--tx", `${tiltX * 22}px`);
    frame.style.setProperty("--ty", `${tiltY * 22}px`);
    frame.style.setProperty("--stx", `${tiltX * 5}px`);
    frame.style.setProperty("--sty", `${tiltY * 5}px`);
  }, []);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    applyTilt(
      Math.max(-1, Math.min(1, (event.gamma || 0) / 26)),
      Math.max(-1, Math.min(1, ((event.beta || 0) - 35) / 32)),
    );
  }, [applyTilt]);

  useEffect(() => {
    const followPointer = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        applyPointer(event.clientX, event.clientY);
      }
    };
    window.addEventListener("pointermove", followPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", followPointer);
      if (burstTimer.current) window.clearTimeout(burstTimer.current);
    };
  }, [applyPointer]);

  useEffect(() => {
    const orientationEvent = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof orientationEvent?.requestPermission === "function") {
      setTiltAvailable(true);
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [handleOrientation]);

  async function enableTilt() {
    const orientationEvent = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (!orientationEvent?.requestPermission) return;
    try {
      if ((await orientationEvent.requestPermission()) === "granted") {
        window.addEventListener("deviceorientation", handleOrientation, true);
        setTiltAvailable(false);
      }
    } catch {
      setTiltAvailable(true);
    }
  }

  function beginGesture(event: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    gestureStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    applyPointer(event.clientX, event.clientY);
    setActive(true);
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const movement = Math.hypot(
      event.clientX - gestureStart.current.x,
      event.clientY - gestureStart.current.y,
    );
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (movement < 8) setRoute((current) => (current + 1) % 3);
    if (event.pointerType !== "mouse") {
      bursting.current = true;
      setActive(true);
      if (burstTimer.current) window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => {
        bursting.current = false;
        setActive(false);
        resetPointer();
      }, 1200);
    }
  }

  const initialMotion = {
    "--mx": "0px",
    "--my": "0px",
    "--tx": "0px",
    "--ty": "0px",
    "--sx": "0px",
    "--sy": "0px",
    "--stx": "0px",
    "--sty": "0px",
  } as MotionStyle;

  return (
    <div
      ref={frameRef}
      className="network-card logic-image-card"
      style={initialMotion}
      data-route={route}
      data-active="false"
      role="img"
      aria-label="An interactive abstract watercolor circuit portrait of hands-on, playful, logical work"
      onPointerEnter={(event) => {
        applyPointer(event.clientX, event.clientY);
        setActive(true);
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse" || dragging.current) {
          applyPointer(event.clientX, event.clientY);
          setActive(true);
        }
      }}
      onPointerLeave={() => {
        if (!dragging.current && !bursting.current) {
          setActive(false);
          resetPointer();
        }
      }}
      onPointerDown={beginGesture}
      onPointerUp={endGesture}
      onPointerCancel={(event) => {
        dragging.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setActive(false);
        resetPointer();
      }}
    >
      <div className="logic-page-bloom" aria-hidden="true" />
      <div className="logic-photo-surface" aria-hidden="true" />

      <div className="logic-watercolor" aria-hidden="true">
        <i className="logic-wash logic-wash-1" />
        <i className="logic-wash logic-wash-2" />
        <i className="logic-wash logic-wash-3" />
        <i className="logic-wash logic-wash-4" />
        <i className="logic-wash logic-wash-5" />
      </div>

      <div className="logic-orbit logic-orbit-a" aria-hidden="true" />
      <div className="logic-orbit logic-orbit-b" aria-hidden="true" />
      <div className="logic-path logic-path-a" aria-hidden="true" />
      <div className="logic-path logic-path-b" aria-hidden="true" />
      <div className="logic-path logic-path-c" aria-hidden="true" />
      <div className="logic-path logic-path-d" aria-hidden="true" />

      {Array.from({ length: 8 }, (_, index) => (
        <i className={`logic-node logic-node-${index + 1}`} aria-hidden="true" key={index} />
      ))}

      <div className="logic-core" aria-hidden="true">
        <span>→</span>
        <i />
        <i />
        <i />
      </div>

      <span className="logic-image-label">
        <i aria-hidden="true" />
        LOGIC IN MOTION
      </span>
      <span className="logic-route-label" aria-hidden="true">0{route + 1}</span>

      {tiltAvailable && (
        <button
          type="button"
          className="logic-tilt-button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={enableTilt}
        >
          Enable tilt
        </button>
      )}
    </div>
  );
}
