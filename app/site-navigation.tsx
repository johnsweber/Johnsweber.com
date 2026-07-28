"use client";

import {
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

const navItems = [
  { label: "Home", detail: "The starting point", href: "#top", icon: House },
  { label: "Work", detail: "Projects and directions", href: "#work", icon: Sparkles },
  { label: "Live lab", detail: "Edge-to-GPU experiments", href: "#lab", icon: FlaskConical },
  { label: "Video workflows", detail: "Generative motion studies", href: "#work", icon: Video },
];

function MenuShell({
  open,
  setOpen,
  accountHeader,
  accountItem,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  accountHeader: ReactNode;
  accountItem: ReactNode;
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
            <div className="icon-nav-grid">
              {navItems.map(({ label, detail, href, icon: Icon }) => (
                <a key={`${label}-${href}`} href={href} onClick={() => setOpen(false)}>
                  <span className="icon-nav-mark">
                    <Icon size={25} aria-hidden="true" />
                  </span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </a>
              ))}
              {accountItem}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ConfiguredNavigation() {
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

  return (
    <nav className="nav">
      <MenuShell
        open={open}
        setOpen={setOpen}
        accountHeader={accountHeader}
        accountItem={accountItem}
      />
      <div className="nav-links">
        <a href="#work">Work</a>
        <a href="#lab">Live lab</a>
        <a href="#about">About</a>
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

function UnconfiguredNavigation() {
  const [open, setOpen] = useState(false);
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
      />
      <div className="nav-links">
        <a href="#work">Work</a>
        <a href="#lab">Live lab</a>
        <a href="#about">About</a>
      </div>
      <Link className="nav-login" href="/login">
        <LogIn size={17} aria-hidden="true" />
        Log in
      </Link>
    </nav>
  );
}

export function SiteNavigation() {
  const configured = useAuthConfigured();
  return configured ? <ConfiguredNavigation /> : <UnconfiguredNavigation />;
}
