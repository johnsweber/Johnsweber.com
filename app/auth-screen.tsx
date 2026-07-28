"use client";

import { Apple, ArrowLeft, LoaderCircle } from "lucide-react";
import { useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { useAuthConfigured } from "./auth-provider";

type Mode = "login" | "create";
type Strategy = "oauth_google" | "oauth_apple";

function OAuthForm({ mode }: { mode: Mode }) {
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const [pending, setPending] = useState<Strategy | null>(null);
  const [error, setError] = useState("");
  const loaded = mode === "login" ? signInLoaded : signUpLoaded;

  async function continueWith(strategy: Strategy) {
    if (!loaded) return;
    setPending(strategy);
    setError("");
    try {
      const params = {
        strategy,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
      } as const;
      if (mode === "login") {
        await signIn.authenticateWithRedirect(params);
      } else {
        await signUp.authenticateWithRedirect({ ...params, legalAccepted: true });
      }
    } catch {
      setPending(null);
      setError("That sign-in could not be started. Please try again.");
    }
  }

  if (userLoaded && isSignedIn) {
    return (
      <div className="auth-already-in">
        <span>YOU&apos;RE SIGNED IN</span>
        <h1>Welcome back, {user.firstName || "friend"}.</h1>
        <p>Your account is already connected to this playground.</p>
        <Link href="/manage-account">Manage your account</Link>
        <Link className="quiet-link" href="/">Return home</Link>
      </div>
    );
  }

  return (
    <>
      <button
        className="sso-button google"
        type="button"
        disabled={!loaded || pending !== null}
        onClick={() => continueWith("oauth_google")}
      >
        {pending === "oauth_google" ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : (
          <span className="google-g">G</span>
        )}
        Continue with Google
      </button>
      <button
        className="sso-button apple"
        type="button"
        disabled={!loaded || pending !== null}
        onClick={() => continueWith("oauth_apple")}
      >
        {pending === "oauth_apple" ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : (
          <Apple aria-hidden="true" />
        )}
        Continue with Apple
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </>
  );
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const configured = useAuthConfigured();
  const creating = mode === "create";

  return (
    <main className="auth-page">
      <Link className="auth-back" href="/">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to the playground
      </Link>
      <section className="auth-card">
        <div className="auth-mark" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
        <span className="auth-eyebrow">{creating ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</span>
        <h1>{creating ? "One identity. Every experiment." : "Pick up where you left off."}</h1>
        <p>
          {creating
            ? "Use a trusted account you already have. No new password to remember."
            : "Sign in to manage your profile and access personalized playground features."}
        </p>

        <div className="sso-stack">
          {configured ? (
            <OAuthForm mode={mode} />
          ) : (
            <>
              <button className="sso-button google" type="button" disabled>
                <span className="google-g">G</span>
                Continue with Google
              </button>
              <button className="sso-button apple" type="button" disabled>
                <Apple aria-hidden="true" />
                Continue with Apple
              </button>
              <p className="auth-setup-note">SSO is ready for its Clerk connection.</p>
            </>
          )}
        </div>

        <div className="auth-switch">
          {creating ? "Already have an account?" : "New to the playground?"}
          <Link href={creating ? "/login" : "/create-account"}>
            {creating ? "Log in" : "Create account"}
          </Link>
        </div>
        <small className="auth-legal">
          By continuing, you agree to the site terms and acknowledge the privacy policy.
        </small>
      </section>
    </main>
  );
}
