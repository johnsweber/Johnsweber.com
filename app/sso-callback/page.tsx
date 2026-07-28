"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { useAuthConfigured } from "../auth-provider";

export default function SsoCallbackPage() {
  const configured = useAuthConfigured();

  if (!configured) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>SSO is not configured yet.</h1>
          <a href="/login">Return to login</a>
        </section>
      </main>
    );
  }

  return <AuthenticateWithRedirectCallback />;
}
