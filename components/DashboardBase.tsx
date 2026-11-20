"use client";

import { createContext, useContext } from "react";

// Where the current workspace and account live (lib/paths.ts), for links in
// client components inside the dashboard: useBase().ws + "/policies".
// components/AppShell.tsx provides it.
export const BaseContext = createContext<{ ws: string; account: string }>({ ws: "/app", account: "/app/org" });

export function useBase() {
  return useContext(BaseContext);
}
