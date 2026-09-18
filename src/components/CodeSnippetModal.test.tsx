// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CodeSnippetModal } from "./CodeSnippetModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SERVER_PAYLOAD = {
  category: "image",
  sourceFormat: "png",
  targetFormat: "jpg",
  code: { python: "# from server", node: "// from server", html: "<!-- from server -->" },
};

function renderModal({
  category = "image",
  sourceFormat = "png",
  targetFormat = "jpg",
}: { category?: string; sourceFormat?: string; targetFormat?: string } = {}) {
  return render(
    <CodeSnippetModal
      isOpen
      onClose={vi.fn()}
      category={category}
      sourceFormat={sourceFormat}
      targetFormat={targetFormat}
    />
  );
}

describe("CodeSnippetModal (D-4 fallback notice + tab semantics)", () => {
  it("shows a category-aware starter and a visible notice when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    renderModal({ category: "video", sourceFormat: "mp4", targetFormat: "mkv" });

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/Server unreachable/i);

    // The default (Python) snippet must be the media toolchain, not an image one.
    expect(screen.getByText(/ffmpeg/)).toBeInTheDocument();
    expect(screen.queryByText(/from server/)).not.toBeInTheDocument();
  });

  it("passes the selected data category through to the offline starter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderModal({ category: "data", sourceFormat: "csv", targetFormat: "json" });

    await screen.findByRole("status");
    expect(screen.getByText(/csv\.reader/)).toBeInTheDocument();
  });

  it("shows server templates without the notice when the API responds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => SERVER_PAYLOAD }));

    renderModal();

    expect(await screen.findByText(/# from server/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("treats a non-2xx response as a failure instead of parsing an error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));

    renderModal();

    expect(await screen.findByRole("status")).toHaveTextContent(/Server unreachable/i);
  });

  it("exposes tab semantics and moves between snippets with clicks and arrow keys", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderModal();

    const pythonTab = screen.getByRole("tab", { name: "Python" });
    const nodeTab = screen.getByRole("tab", { name: "Node.js" });
    const htmlTab = screen.getByRole("tab", { name: "HTML5 / JS" });

    expect(pythonTab).toHaveAttribute("aria-selected", "true");
    expect(pythonTab).toHaveAttribute("tabindex", "0");
    expect(nodeTab).toHaveAttribute("aria-selected", "false");
    expect(nodeTab).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "snippet-tab-python");

    await user.click(nodeTab);
    expect(nodeTab).toHaveAttribute("aria-selected", "true");
    expect(pythonTab).toHaveAttribute("aria-selected", "false");

    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(htmlTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "snippet-tab-html");

    // Left moves back to the previous tab.
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(nodeTab).toHaveAttribute("aria-selected", "true");

    await waitFor(() => expect(htmlTab).toHaveAttribute("tabindex", "-1"));
  });
});
