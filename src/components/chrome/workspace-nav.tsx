"use client";

import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/components/ui/primitives";

export function WorkspaceNav({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-thin" aria-label="Workspace">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
              active ? "bg-paper-sunken font-medium text-ink" : "text-ink-50 hover:text-ink",
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="money rounded-xs bg-ink px-1.5 text-2xs text-ink-text">{item.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
