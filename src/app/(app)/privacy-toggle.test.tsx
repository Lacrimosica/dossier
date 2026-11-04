import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parsePrivacyMode } from "@/lib/ui-preferences";

import { PrivacyToggle } from "./privacy-toggle";

const refresh = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  pathname = "/";
  refresh.mockClear();
});
afterEach(() => {
  delete document.documentElement.dataset.privacy;
  document.cookie = "dossier_privacy=; max-age=0; path=/";
});

describe("PrivacyToggle", () => {
  it("switches on and off, marks the page and remembers", async () => {
    render(<PrivacyToggle serverOn={false} />);
    const toggle = screen.getByRole("switch", { name: "Privacy mode" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.privacy).toBe("on");
    expect(document.cookie).toContain("dossier_privacy=on");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.privacy).toBeUndefined();
    expect(document.cookie).toContain("dossier_privacy=off");
  });

  it("works from the keyboard", async () => {
    render(<PrivacyToggle serverOn={false} />);
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(document.documentElement.dataset.privacy).toBe("on");
  });

  it("leaves other screens alone, as only an application's browser tab names the role", async () => {
    render(<PrivacyToggle serverOn={false} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retitles an application's browser tab", async () => {
    pathname = "/applications/abc";
    render(<PrivacyToggle serverOn={false} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("parsePrivacyMode", () => {
  it("is on only when it was switched on", () => {
    expect(parsePrivacyMode("on")).toBe(true);
    expect(parsePrivacyMode("off")).toBe(false);
    expect(parsePrivacyMode(undefined)).toBe(false);
  });
});
