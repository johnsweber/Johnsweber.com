"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type MotionStyle = CSSProperties & {
  "--mx": string;
  "--my": string;
  "--tx": string;
  "--ty": string;
};

export function HeroLogicImage() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [route, setRoute] = useState(0);
  const [tiltAvailable, setTiltAvailable] = useState(false);

  const applyPointer = useCallback((mouseX: number, mouseY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--mx", `${mouseX * 8}px`);
    frame.style.setProperty("--my", `${mouseY * 8}px`);
  }, []);

  const applyTilt = useCallback((tiltX: number, tiltY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--tx", `${tiltX * 13}px`);
    frame.style.setProperty("--ty", `${tiltY * 13}px`);
  }, []);

  const handleOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const tiltX = Math.max(-1, Math.min(1, (event.gamma || 0) / 28));
      const tiltY = Math.max(-1, Math.min(1, ((event.beta || 0) - 35) / 35));
      applyTilt(tiltX, tiltY);
    },
    [applyTilt],
  );

  useEffect(() => {
    const orientationEvent = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof orientationEvent?.requestPermission === "function") {
      setTiltAvailable(true);
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation, true);
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

  const initialMotion = {
    "--mx": "0px",
    "--my": "0px",
    "--tx": "0px",
    "--ty": "0px",
  } as MotionStyle;

  return (
    <div
      ref={frameRef}
      className="network-card logic-image-card"
      style={initialMotion}
      data-route={route}
      role="img"
      aria-label="An interactive visual portrait of hands-on, playful, logical work"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        applyPointer(
          ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
          ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
        );
      }}
      onPointerLeave={() => applyPointer(0, 0)}
      onPointerDown={() => setRoute((current) => (current + 1) % 3)}
    >
      <div className="logic-grid" aria-hidden="true" />
      <div className="logic-path logic-path-a" aria-hidden="true" />
      <div className="logic-path logic-path-b" aria-hidden="true" />
      <div className="logic-path logic-path-c" aria-hidden="true" />

      <i className="logic-node logic-node-1" aria-hidden="true" />
      <i className="logic-node logic-node-2" aria-hidden="true" />
      <i className="logic-node logic-node-3" aria-hidden="true" />
      <i className="logic-node logic-node-4" aria-hidden="true" />
      <i className="logic-node logic-node-5" aria-hidden="true" />
      <i className="logic-node logic-node-6" aria-hidden="true" />

      <div className="logic-core" aria-hidden="true">
        <span>{"{ }"}</span>
        <i />
        <i />
        <i />
      </div>

      <span className="logic-image-label">
        <i aria-hidden="true" />
        HANDS / LOGIC / PLAY
      </span>
      <span className="logic-route-label" aria-hidden="true">
        0{route + 1}
      </span>

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
