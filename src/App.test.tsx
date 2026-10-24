// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const THEME_BTN = "Toggle Light/Dark Theme";
const ROOT = "min-h-screen";

function rootDiv(): HTMLElement {
  return document.querySelector(`.${ROOT}`) as HTMLElement;
}

function setStoredTheme(value: string | null) {
  if (value === null) localStorage.removeItem("formatshift_theme");
  else localStorage.setItem("formatshift_theme", value);
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  setStoredTheme(null);
  localStorage.removeItem("formatshift_history");
});

describe("theme toggle", () => {
  it("defaults to dark and paints the root with the dark palette", async () => {
    render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(rootDiv()).toHaveClass("bg-[#0b1120]");
    expect(rootDiv()).toHaveClass("text-slate-100");
    expect(localStorage.getItem("formatshift_theme")).toBe("dark");
  });

  it("switches to a real light palette and back", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    await user.click(screen.getByRole("button", { name: THEME_BTN }));
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
    expect(rootDiv()).toHaveClass("bg-slate-100");
    expect(rootDiv()).toHaveClass("text-slate-900");
    expect(localStorage.getItem("formatshift_theme")).toBe("light");

    await user.click(screen.getByRole("button", { name: THEME_BTN }));
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(rootDiv()).toHaveClass("bg-[#0b1120]");
    expect(localStorage.getItem("formatshift_theme")).toBe("dark");
  });

  it("persists the chosen theme across remounts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    await user.click(screen.getByRole("button", { name: THEME_BTN }));
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
    unmount();
    cleanup();

    // A fresh mount must start light because the preference was persisted.
    render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
    expect(rootDiv()).toHaveClass("bg-slate-100");
  });
});
describe("unsupported source formats", () => {
  it("shows the detection error and offers no Convert action for a PDF", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(["%PDF-1.4 fake"], "doc.pdf", { type: "application/pdf" });
    await user.upload(input, pdf);

    await waitFor(() => expect(screen.getByText("doc.pdf")).toBeInTheDocument());
    expect(screen.getByText(/PDF files are not supported/i)).toBeInTheDocument();
    // No per-item Convert button: without targets the old code would have run
    // the raw PDF bytes through the text pipeline and produced junk.
    expect(screen.queryByRole("button", { name: /^Convert$/ })).toBeNull();
  });
});
