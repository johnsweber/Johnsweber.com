"use client";

import { useCallback, useEffect, useState } from "react";

export type SiteTheme = "main" | "new";

const SITE_THEME_KEY = "johnsweber.siteTheme";
const SITE_THEME_EVENT = "johnsweber:site-theme";

function readSiteTheme(): SiteTheme {
  if (typeof window === "undefined") return "main";
  return window.localStorage.getItem(SITE_THEME_KEY) === "new" ? "new" : "main";
}

function applySiteTheme(theme: SiteTheme) {
  document.documentElement.dataset.siteTheme = theme;
}

export function useSiteTheme() {
  const [theme, setThemeState] = useState<SiteTheme>("main");

  useEffect(() => {
    const update = () => {
      const selected = readSiteTheme();
      setThemeState(selected);
      applySiteTheme(selected);
    };
    update();
    window.addEventListener(SITE_THEME_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SITE_THEME_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const setTheme = useCallback((nextTheme: SiteTheme) => {
    window.localStorage.setItem(SITE_THEME_KEY, nextTheme);
    applySiteTheme(nextTheme);
    setThemeState(nextTheme);
    window.dispatchEvent(new Event(SITE_THEME_EVENT));
  }, []);

  return { theme, setTheme };
}

export function SiteThemeController() {
  useSiteTheme();
  return null;
}
