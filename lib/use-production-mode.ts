"use client";

import { useCallback, useEffect, useState } from "react";

export const USE_PRODUCTION_EVENT = "johnsweber:use-production";

function storageKey(userId?: string | null) {
  return `johnsweber.useProduction.${userId || "guest"}`;
}

export function readUseProduction(userId?: string | null) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(storageKey(userId)) === "true";
}

export function useProductionMode(userId?: string | null) {
  const [useProduction, setUseProductionState] = useState(false);

  useEffect(() => {
    const update = () => setUseProductionState(readUseProduction(userId));
    update();
    window.addEventListener(USE_PRODUCTION_EVENT, update);
    return () => window.removeEventListener(USE_PRODUCTION_EVENT, update);
  }, [userId]);

  const setUseProduction = useCallback(
    (value: boolean) => {
      window.sessionStorage.setItem(storageKey(userId), String(value));
      setUseProductionState(value);
      window.dispatchEvent(new Event(USE_PRODUCTION_EVENT));
    },
    [userId],
  );

  return { useProduction, setUseProduction };
}

