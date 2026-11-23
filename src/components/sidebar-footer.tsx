"use client";

import packageJson from "../../package.json";
import { useSidebar } from "./sidebar-state";
import { useShortcuts } from "./shortcuts";
import { Keyboard } from "@/components/icons";
import { useLanguage } from "./language-provider";

export function SidebarFooter() {
	const { t } = useLanguage();
	const { minimal } = useSidebar();
	const { openHelpModal, shortcutsEnabled, shortcutsPreferenceLoading } = useShortcuts();
	if (minimal) return null;

  return (
    <div className="px-3 pt-3 flex flex-col gap-2">
      {shortcutsEnabled && !shortcutsPreferenceLoading && (
        <button
          type="button"
          onClick={openHelpModal}
          className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-neutral-400" />
            {t("navigation.shortcuts")}
          </span>
          <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-white border border-neutral-200 rounded text-neutral-500 shadow-2xs">
            ?
          </kbd>
        </button>
      )}
      <PoweredBy />
    </div>
  );
}

/**
 * The "FlareSuite vX" credit, shared by the mail and Drive sidebars. It also
 * carries the AGPL-3.0 source offer (section 13): set NEXT_PUBLIC_SOURCE_CODE_URL
 * to the public repository of the code this server runs.
 */
export function PoweredBy({ className = "px-1" }: { className?: string }) {
	const { t } = useLanguage();
	const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_CODE_URL || "https://github.com/quanlt/flaresuite";
	return (
      <p className={`${className} text-[11px] text-neutral-500`}>
        {t("navigation.poweredBy")}{" "}
        <a href={sourceUrl} target="_blank" className="hover:underline text-neutral-500" rel="noreferrer">
          FlareSuite v{packageJson.version}
        </a>
        {" · "}
        <a href={sourceUrl} target="_blank" className="hover:underline text-neutral-500" rel="noreferrer">
          Source (AGPL-3.0)
        </a>
      </p>
	);
}
