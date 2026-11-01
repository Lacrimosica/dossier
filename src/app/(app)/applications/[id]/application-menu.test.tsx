import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { deleteApplication, renameApplication, setArchived } from "@/lib/application-actions";

import { ApplicationMenu } from "./application-menu";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => null }));
vi.mock("@/lib/application-actions", () => ({
  renameApplication: vi.fn(async () => ({ ok: true, data: null })),
  setArchived: vi.fn(async () => ({ ok: true, data: null })),
  deleteApplication: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

describe("the application's menu (E9-5)", () => {
  it("renames, starting from the current name", async () => {
    const user = userEvent.setup();
    render(<ApplicationMenu id="app-1" title="Ledgerly · Designer" archived={false} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename…" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Ledgerly · Designer");

    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a name first.");
    expect(renameApplication).not.toHaveBeenCalled();

    await user.type(name, "Ledgerly · Product designer");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(renameApplication).toHaveBeenCalledWith({ id: "app-1", title: "Ledgerly · Product designer" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("archives or unarchives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ApplicationMenu id="app-1" title="Ledgerly · Designer" archived={false} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(setArchived).toHaveBeenLastCalledWith({ id: "app-1", archived: true });

    rerender(<ApplicationMenu id="app-1" title="Ledgerly · Designer" archived />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    expect(setArchived).toHaveBeenLastCalledWith({ id: "app-1", archived: false });
  });

  it("deletes after asking, then goes back to the list", async () => {
    const user = userEvent.setup();
    render(<ApplicationMenu id="app-1" title="Ledgerly · Designer" archived={false} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
    await user.click(screen.getByRole("button", { name: "Delete application" }));
    expect(deleteApplication).toHaveBeenCalledWith({ id: "app-1" });
    expect(router.push).toHaveBeenCalledWith("/applications");
  });
});
