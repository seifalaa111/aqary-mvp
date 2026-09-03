import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/services/notifications";
import { Wordmark } from "./wordmark";
import { LocaleToggle } from "./locale-toggle";
import { WorkspaceNav } from "./workspace-nav";
import { UserMenu } from "./user-menu";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

/**
 * The shell every signed-in workspace shares. The nav is built from the user's
 * actual roles — a buyer never sees seller navigation, and the switcher only
 * appears for an account that genuinely holds both roles.
 */
export async function WorkspaceShell({
  locale,
  role,
  nav,
  children,
  title,
}: {
  locale: string;
  role: Role;
  nav: NavItem[];
  children: ReactNode;
  title?: string;
}) {
  const user = await getSessionUser();
  const t = await getTranslations({ locale, namespace: "nav" });
  const ta = await getTranslations({ locale, namespace: "auth" });
  const unread = user ? await unreadCount(user.id) : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-5 px-4 md:px-6">
          <Link href="/" className="shrink-0 text-base" aria-label="Aqary">
            <Wordmark />
          </Link>
          <span className="hidden font-mono text-2xs uppercase tracking-wider text-ink-50 sm:inline">
            {role.replace(/_/g, " ").toLowerCase()}
          </span>

          <WorkspaceNav items={nav} />

          <div className="ms-auto flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative inline-flex size-9 items-center justify-center rounded-sm border border-rule-strong text-ink-70 hover:text-ink"
              aria-label={`${t("notifications")}${unread > 0 ? ` (${unread})` : ""}`}
            >
              <BellMark />
              {unread > 0 ? (
                <span className="money absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brass text-[9px] font-semibold text-ink">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
            <LocaleToggle locale={locale} label={t("language")} />
            {user ? (
              <UserMenu
                name={user.fullNameEn}
                color={user.avatarColor}
                roles={user.roles}
                activeRole={user.activeRole}
                labels={{ signOut: t("signOut"), switchRole: ta("switchRole") }}
              />
            ) : null}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 md:py-8">
        {title ? <h1 className="mb-6 display-section text-ink">{title}</h1> : null}
        {children}
      </main>
    </div>
  );
}

function BellMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path
        d="M8 2a3.6 3.6 0 0 0-3.6 3.6c0 3-1.1 4-1.1 4h9.4s-1.1-1-1.1-4A3.6 3.6 0 0 0 8 2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6.6 12a1.5 1.5 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
