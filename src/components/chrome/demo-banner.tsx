"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const KEY = "aqary.demoBannerDismissed";

export function DemoBanner() {
  const t = useTranslations("common");
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  return (
    <div className="rule-b bg-ink px-4 py-1.5 text-ink-text">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
        <p className="font-mono text-2xs tracking-wide text-ink-text-70">{t("demoBanner")}</p>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, "1");
            } catch {
              /* private mode — dismiss for this view only */
            }
            setHidden(true);
          }}
          className="shrink-0 font-mono text-2xs uppercase tracking-wider text-ink-text-50 hover:text-ink-text"
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
