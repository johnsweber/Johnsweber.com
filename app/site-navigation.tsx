"use client";

import {
  BriefcaseBusiness,
  FileText,
  FlaskConical,
  Grid3X3,
  House,
  LogIn,
  LogOut,
  Sparkles,
  UserRoundCog,
  Video,
  X,
} from "lucide-react";
import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthConfigured } from "./auth-provider";
import { useSiteTheme, type SiteTheme } from "./site-theme";
import { useProductionMode } from "@/lib/use-production-mode";

const navItems = [
  { label: "Home", detail: "The starting point", href: "/#top", icon: House },
  { label: "AI Video", detail: "Private generative video lab", href: "/experiments/ai-video", icon: Video },
  { label: "Portfolio", detail: "Selected work and case notes", href: "/portfolio", icon: BriefcaseBusiness },
  { label: "Résumé", detail: "Career history and capabilities", href: "/resume", icon: FileText },
  { label: "Work", detail: "Projects and directions", href: "/#work", icon: Sparkles },
  { label: "Live lab", detail: "Edge-to-GPU experiments", href: "/#lab", icon: FlaskConical },
];

function MenuShell({
  open,
  setOpen,
  accountHeader,
  accountItem,
  modeControl,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  accountHeader: ReactNode;
  accountItem: ReactNode;
  modeControl: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("menu-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("menu-open");
    };
  }, [open, setOpen]);

  return (
    <>
      <button
        className="grid-menu-trigger"
        type="button"
        aria-label="Open site menu"
        aria-expanded={open}
        aria-controls="site-grid-menu"
        onClick={() => setOpen(true)}
      >
        <Grid3X3 size={21} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open && (
        <div className="grid-menu-backdrop" role="presentation">
          <section
            className="grid-menu"
            id="site-grid-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            <div className="grid-menu-top">
              {accountHeader}
              <button
                className="grid-menu-close"
                type="button"
                aria-label="Close site menu"
                onClick={() => setOpen(false)}
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="grid-menu-heading">
              <span>EXPLORE THE SITE</span>
              <h2>Pick a direction.</h2>
            </div>
            <div className="menu-preference-controls">
              <ThemeControl />
              {modeControl}
            </div>
            <div className="icon-nav-grid">
              {navItems.map(({ label, detail, href, icon: Icon }) => {
                const content = (
                  <>
                  <span className="icon-nav-mark">
                    <Icon size={25} aria-hidden="true" />
                  </span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                  </>
                );
                return href.startsWith("/") ? (
                  <Link key={`${label}-${href}`} href={href} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <a key={`${label}-${href}`} href={href} onClick={() => setOpen(false)}>
                    {content}
                  </a>
                );
              })}
              {accountItem}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ThemeControl() {
  const { theme, setTheme } = useSiteTheme();
  const themes: Array<{ value: SiteTheme; label: string }> = [
    { value: "main", label: "Main" },
    { value: "new", label: "New" },
  ];

  return (
    <div className="production-mode-control theme-mode-control">
      <div>
        <strong>Theme</strong>
        <small>{theme === "new" ? "A new look is coming. For now, it matches Main." : "The original site color and motion system."}</small>
      </div>
      <div className="production-mode-pill" role="group" aria-label="Site theme">
        {themes.map(option => (
          <button
            key={option.value}
            type="button"
            className={theme === option.value ? "selected" : ""}
            aria-pressed={theme === option.value}
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductionModeControl({ userId }: { userId?: string | null }) {
  const { useProduction, setUseProduction } = useProductionMode(userId);
  return (
    <div className="production-mode-control">
      <div>
        <strong>Use Production</strong>
        <small>
          {useProduction
            ? "Live models are enabled and may incur usage charges."
            : "Creates return free example media without calling a model."}
        </small>
      </div>
      <div className="production-mode-pill" role="group" aria-label="Generation mode">
        <button
          type="button"
          className={!useProduction ? "selected" : ""}
          aria-pressed={!useProduction}
          onClick={() => setUseProduction(false)}
        >
          Demo
        </button>
        <button
          type="button"
          className={useProduction ? "selected" : ""}
          aria-pressed={useProduction}
          onClick={() => setUseProduction(true)}
        >
          Production
        </button>
      </div>
    </div>
  );
}

function ConfiguredNavigation({ triggerOnly = false }: { triggerOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const displayName = user?.fullName || user?.firstName || "Your account";
  const email = user?.primaryEmailAddress?.emailAddress;

  const accountHeader = isLoaded && isSignedIn ? (
    <div className="menu-user">
      {user.imageUrl ? <img src={user.imageUrl} alt="" /> : <UserRoundCog aria-hidden="true" />}
      <div>
        <span>SIGNED IN</span>
        <strong>{displayName}</strong>
        {email && <small>{email}</small>}
      </div>
      <button type="button" onClick={() => openUserProfile()}>
        Manage account
      </button>
    </div>
  ) : (
    <div className="menu-guest">
      <span>YOUR PLAYGROUND</span>
      <strong>Sign in to make it yours.</strong>
    </div>
  );

  const accountItem = isLoaded && isSignedIn ? (
    <div className="account-grid-group">
      <Link href="/manage-account" onClick={() => setOpen(false)}>
        <span className="icon-nav-mark">
          <UserRoundCog size={25} aria-hidden="true" />
        </span>
        <strong>User management</strong>
        <small>Profile, security, and sessions</small>
      </Link>
      <button type="button" onClick={() => signOut({ redirectUrl: "/" })}>
        <LogOut size={18} aria-hidden="true" />
        Sign out
      </button>
    </div>
  ) : (
    <Link href="/create-account" onClick={() => setOpen(false)}>
      <span className="icon-nav-mark">
        <UserRoundCog size={25} aria-hidden="true" />
      </span>
      <strong>User management</strong>
      <small>Create or access your account</small>
    </Link>
  );

  if (triggerOnly) {
    return (
      <MenuShell
        open={open}
        setOpen={setOpen}
        accountHeader={accountHeader}
        accountItem={accountItem}
        modeControl={<ProductionModeControl userId={user?.id} />}
      />
    );
  }

  return (
    <nav className="nav">
      <MenuShell
        open={open}
        setOpen={setOpen}
        accountHeader={accountHeader}
        accountItem={accountItem}
        modeControl={<ProductionModeControl userId={user?.id} />}
      />
      <div className="nav-links">
        <Link href="/portfolio">Portfolio</Link>
        <Link href="/resume">Résumé</Link>
        <a href="/#lab">Live lab</a>
      </div>
      {isLoaded && isSignedIn ? (
        <button className="nav-account" type="button" onClick={() => openUserProfile()}>
          <UserRoundCog size={18} aria-hidden="true" />
          <span>{user.firstName || "Account"}</span>
        </button>
      ) : (
        <Link className="nav-login" href="/login">
          <LogIn size={17} aria-hidden="true" />
          Log in
        </Link>
      )}
    </nav>
  );
}

function UnconfiguredNavigation({ triggerOnly = false }: { triggerOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  if (triggerOnly) {
    return (
      <MenuShell
        open={open}
        setOpen={setOpen}
        accountHeader={<div className="menu-guest"><span>YOUR PLAYGROUND</span><strong>Sign in to make it yours.</strong></div>}
        accountItem={<Link href="/create-account" onClick={() => setOpen(false)}><span className="icon-nav-mark"><UserRoundCog size={25} aria-hidden="true" /></span><strong>User management</strong><small>Create or access your account</small></Link>}
        modeControl={<ProductionModeControl />}
      />
    );
  }
  return (
    <nav className="nav">
      <MenuShell
        open={open}
        setOpen={setOpen}
        accountHeader={
          <div className="menu-guest">
            <span>YOUR PLAYGROUND</span>
            <strong>Sign in to make it yours.</strong>
          </div>
        }
        accountItem={
          <Link href="/create-account" onClick={() => setOpen(false)}>
            <span className="icon-nav-mark">
              <UserRoundCog size={25} aria-hidden="true" />
            </span>
            <strong>User management</strong>
            <small>Create or access your account</small>
          </Link>
        }
        modeControl={<ProductionModeControl />}
      />
      <div className="nav-links">
        <Link href="/portfolio">Portfolio</Link>
        <Link href="/resume">Résumé</Link>
        <a href="/#lab">Live lab</a>
      </div>
      <Link className="nav-login" href="/login">
        <LogIn size={17} aria-hidden="true" />
        Log in
      </Link>
    </nav>
  );
}

export function SiteNavigation({ triggerOnly = false }: { triggerOnly?: boolean }) {
  const configured = useAuthConfigured();
  return configured
    ? <ConfiguredNavigation triggerOnly={triggerOnly} />
    : <UnconfiguredNavigation triggerOnly={triggerOnly} />;
}
