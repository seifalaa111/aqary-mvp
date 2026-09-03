"use client";

import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Role } from "@prisma/client";
import { signOut, switchWorkspace } from "@/app/actions/auth";
import { initials } from "@/lib/format";

export function UserMenu({
  name,
  color,
  roles,
  activeRole,
  labels,
}: {
  name: string;
  color: string;
  roles: Role[];
  activeRole: Role;
  labels: { signOut: string; switchRole: string };
}) {
  const [pending, startTransition] = useTransition();
  const others = roles.filter((r) => r !== activeRole);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex size-9 items-center justify-center rounded-full text-2xs font-semibold text-white"
        style={{ backgroundColor: color }}
        aria-label={name}
      >
        {initials(name)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 w-56 rounded-md border border-rule bg-paper-raised p-1 shadow-e3"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="font-mono text-2xs uppercase tracking-wider text-ink-50">
              {activeRole.replace(/_/g, " ").toLowerCase()}
            </p>
          </div>

          {others.length > 0 ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-rule" />
              <p className="px-3 py-1 font-mono text-2xs uppercase tracking-wider text-ink-30">
                {labels.switchRole}
              </p>
              {others.map((r) => (
                <DropdownMenu.Item
                  key={r}
                  disabled={pending}
                  onSelect={() => startTransition(() => void switchWorkspace(r))}
                  className="cursor-pointer rounded-xs px-3 py-2 text-sm text-ink-70 outline-none data-[highlighted]:bg-paper-sunken data-[highlighted]:text-ink"
                >
                  {r.replace(/_/g, " ").toLowerCase()}
                </DropdownMenu.Item>
              ))}
            </>
          ) : null}

          <DropdownMenu.Separator className="my-1 h-px bg-rule" />
          <DropdownMenu.Item
            disabled={pending}
            onSelect={() => startTransition(() => void signOut())}
            className="cursor-pointer rounded-xs px-3 py-2 text-sm text-ink-70 outline-none data-[highlighted]:bg-paper-sunken data-[highlighted]:text-ink"
          >
            {labels.signOut}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
