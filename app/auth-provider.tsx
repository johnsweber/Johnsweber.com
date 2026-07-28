"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";

const AuthConfiguredContext = createContext(false);

export function useAuthConfigured() {
  return useContext(AuthConfiguredContext);
}

export function AuthProvider({
  children,
  publishableKey,
}: {
  children: ReactNode;
  publishableKey?: string;
}) {
  const configured = Boolean(publishableKey);
  const content = (
    <AuthConfiguredContext.Provider value={configured}>
      {children}
    </AuthConfiguredContext.Provider>
  );

  if (!publishableKey) return content;

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/login"
      signUpUrl="/create-account"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      {content}
    </ClerkProvider>
  );
}
