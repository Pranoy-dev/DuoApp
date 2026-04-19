"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DuoRuntimePublicEnv } from "@/lib/duo-cloud";

const defaultEnv: DuoRuntimePublicEnv = {
  clerkPublishableKey: "",
  clerkSignInUrl: "/sign-in",
  clerkSignUpUrl: "/sign-up",
  duoUseServerData: false,
  duoSupabaseJwtExchange: false,
  supabaseUrl: "",
  supabasePublishableKey: "",
  supabaseAnonKey: "",
};

const DuoRuntimeEnvContext = createContext<DuoRuntimePublicEnv>(defaultEnv);

export function DuoRuntimeEnvProvider({
  value,
  children,
}: {
  value: DuoRuntimePublicEnv;
  children: ReactNode;
}) {
  const merged = useMemo(() => ({ ...defaultEnv, ...value }), [value]);
  return (
    <DuoRuntimeEnvContext.Provider value={merged}>
      {children}
    </DuoRuntimeEnvContext.Provider>
  );
}

export function useDuoRuntimeEnv(): DuoRuntimePublicEnv {
  return useContext(DuoRuntimeEnvContext);
}
