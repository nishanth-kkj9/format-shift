// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { FormatDropdown } from "./FormatDropdown";

afterEach(cleanup);

describe("FormatDropdown", () => {
  it("renders the trigger with the current value and opens a listbox on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FormatDropdown value="png" onChange={onChange} category="image" />);

    const trigger = screen.getByRole("button", { name: /choose output format, currently png/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("navigates with ArrowDown and selects on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FormatDropdown value="png" onChange={onChange} category="image" />);

    const trigger = screen.getByRole("button", { name: /choose output format, currently png/i });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());

    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-jpeg$/))
    );

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("jpeg");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes the listbox on Escape without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FormatDropdown value="png" onChange={onChange} category="image" />);

    const trigger = screen.getByRole("button", { name: /choose output format, currently png/i });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("selects an option by clicking it", () => {
    const onChange = vi.fn();
    render(<FormatDropdown value="png" onChange={onChange} category="image" />);

    fireEvent.click(screen.getByRole("button", { name: /choose output format, currently png/i }));
    const jpgOption = screen.getByRole("option", { name: /JPEG \/ JPG/i });
    fireEvent.click(jpgOption);
    expect(onChange).toHaveBeenCalledWith("jpg");
  });
});
