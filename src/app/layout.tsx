import type { ReactNode } from "react";

// The real <html>/<body> shell lives in `[locale]/layout.tsx` so that `dir`
// and `lang` are set from the resolved locale. This root simply passes through.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
