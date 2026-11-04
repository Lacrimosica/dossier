"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";
import { PRIVACY_COOKIE, rememberPreference } from "@/lib/ui-preferences";

import { useSidebarCollapsed } from "./sidebar-frame";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isOn = () => document.documentElement.dataset.privacy === "on";

/**
 * The sidebar's privacy switch, for working with someone beside you: it blurs
 * whatever is tagged `data-private` (globals.css). It's only a screen, so the
 * data stays in the page. It remembers the choice in a cookie that the root
 * layout reads, so a reload can't lay everything open again.
 */
export function PrivacyToggle({ serverOn }: { serverOn: boolean }) {
  const collapsed = useSidebarCollapsed();
  const on = useSyncExternalStore(subscribe, isOn, () => serverOn);
  const pathname = usePathname();
  const router = useRouter();
  const Icon = on ? EyeOff : Eye;

  const toggle = () => {
    if (on) delete document.documentElement.dataset.privacy;
    else document.documentElement.dataset.privacy = "on";
    rememberPreference(PRIVACY_COOKIE, on ? "off" : "on");
    listeners.forEach((listener) => listener());
    // An application's browser tab names the role, and only the server can
    // retitle it. No other screen needs the refresh, so none gets it.
    if (pathname.startsWith("/applications/")) router.refresh();
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      title="Blur your name, photo and applications, for when someone's beside you"
      className={cn(
        "flex w-full items-center gap-1.5 rounded-control px-3 py-1.5 text-left text-sm font-medium hover:bg-hover hover:text-ink motion-safe:transition-colors",
        on ? "text-ink" : "text-muted",
        collapsed && "justify-center px-1.5",
      )}
    >
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span className={cn("flex-1", collapsed && "sr-only")}>Privacy mode</span>
      {!collapsed && (
        <span aria-hidden="true" className={cn("flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 motion-safe:transition-colors", on ? "bg-primary" : "bg-toggle-off")}>
          <span className={cn("block size-3 rounded-full bg-white shadow-knob motion-safe:transition-transform", on && "translate-x-3")} />
        </span>
      )}
    </button>
  );
}
