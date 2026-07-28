"use client";

import { UserProfile, useUser } from "@clerk/nextjs";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useAuthConfigured } from "./auth-provider";

function AccountContent() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="account-loading">Loading your account…</div>;
  }

  if (!isSignedIn) {
    return (
      <section className="account-locked">
        <LockKeyhole size={34} aria-hidden="true" />
        <span>USER MANAGEMENT</span>
        <h1>Sign in to manage your account.</h1>
        <p>Your profile, connected identities, sessions, and security settings live here.</p>
        <Link href="/login">Log in</Link>
      </section>
    );
  }

  return (
    <UserProfile
      path="/manage-account"
      routing="path"
      appearance={{
        elements: {
          rootBox: { width: "100%" },
          cardBox: { width: "100%", boxShadow: "none" },
          card: { boxShadow: "none", border: "1px solid rgba(16,35,74,.14)" },
        },
      }}
    />
  );
}

export function AccountScreen() {
  const configured = useAuthConfigured();

  return (
    <main className="account-page">
      <Link className="auth-back" href="/">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to the playground
      </Link>
      {configured ? (
        <AccountContent />
      ) : (
        <section className="account-locked">
          <LockKeyhole size={34} aria-hidden="true" />
          <span>USER MANAGEMENT</span>
          <h1>Your account space is ready.</h1>
          <p>Connect the Clerk environment to enable profile and session management.</p>
          <Link href="/login">View login</Link>
        </section>
      )}
    </main>
  );
}
