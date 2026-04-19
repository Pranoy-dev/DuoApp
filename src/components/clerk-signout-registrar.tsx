"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";
import { setClerkSignOut } from "@/lib/clerk-signout-ref";

export function ClerkSignOutRegistrar() {
  const { signOut } = useClerk();
  useEffect(() => {
    setClerkSignOut(() => signOut());
    return () => setClerkSignOut(null);
  }, [signOut]);
  return null;
}
