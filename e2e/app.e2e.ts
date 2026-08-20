import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 1x1 red PNG, base64-encoded (no binary committed to the repo).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const makePngFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "format-shift-e2e-"));
  const file = join(dir, "fixture.png");
  writeFileSync(file, Buffer.from(PNG_BASE64, "base64"));
  return file;
};

const DROPDOWN = "button[aria-haspopup='listbox']";

const convertSelectedFile = async (page: Page, targetFormat: string) => {
  // ArrowDown opens the menu and highlights the current selection; keep
  // pressing until the target is highlighted, then Enter to pick it.
  const dropdown = page.locator(DROPDOWN).first();
  await dropdown.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  let guard = 0;
  while (!(await dropdown.getAttribute("aria-activedescendant"))?.endsWith(`-${targetFormat}`)) {
    await dropdown.press("ArrowDown");
    guard += 1;
    expect(guard).toBeLessThan(12);
  }
  await dropdown.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
};

test.describe("FormatShift critical user flows", () => {
  test("dropzone is keyboard-operable and opens the file picker on Enter", async ({ page }) => {
    await page.goto("/");

    const dropzone = page.getByRole("button", { name: /choose files to convert/i });
    await expect(dropzone).toBeVisible();
    await expect(dropzone).toHaveAttribute("tabindex", "0");

    const chooserPromise = page.waitForEvent("filechooser");
    await dropzone.press("Enter");
    const chooser = await chooserPromise;
    await chooser.setFiles(makePngFixture());

    // The queue accepts the file and detects it as an image.
    await expect(page.getByText("fixture.png")).toBeVisible();
    await expect(page.getByText("IMAGE", { exact: true })).toBeVisible();
  });

  test("format dropdown is keyboard-navigable as a listbox", async ({ page }) => {
    await page.goto("/");

    // Upload via the hidden input (chooser-driven, not keyboard).
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /choose files to convert/i }).click(),
    ]);
    await chooser.setFiles(makePngFixture());
    await expect(page.getByText("fixture.png")).toBeVisible();

    const dropdown = page.locator(DROPDOWN).first();
    await expect(dropdown).toHaveAttribute("aria-haspopup", "listbox");

    // Open with ArrowDown, highlight moves, option announces selection.
    await dropdown.press("ArrowDown");
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option", { name: /JPG/i })).toHaveAttribute("aria-selected", "true");

    await dropdown.press("ArrowDown");
    await dropdown.press("ArrowDown");
    await expect(dropdown).toHaveAttribute("aria-activedescendant", /-png$/);

    // Escape closes the menu without changing the selection (still jpg).
    await dropdown.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(dropdown).toContainText("jpg");
  });

  test("format dropdown switches target format on mouse click", async ({ page }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /choose files to convert/i }).click(),
    ]);
    await chooser.setFiles(makePngFixture());
    await expect(page.getByText("fixture.png")).toBeVisible();

    const dropdown = page.locator(DROPDOWN).first();
    await expect(dropdown).toHaveAttribute("aria-label", /currently jpg/);

    // Open with a click and pick PNG by mouse. This used to do nothing: the
    // trigger's blur handler closed the menu on mousedown (before the option's
    // click completed), so the selection never changed.
    await dropdown.click();
    await page.getByRole("option", { name: /PNG Image/i }).click();
    await expect(dropdown).toHaveAttribute("aria-label", /currently png/);
  });

  test("full image -> ico conversion via keyboard, then preview modal Esc closes", async ({ page }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /choose files to convert/i }).click(),
    ]);
    await chooser.setFiles(makePngFixture());
    await expect(page.getByText("fixture.png")).toBeVisible();

    await convertSelectedFile(page, "ico");

    await page.getByRole("button", { name: "Convert", exact: true }).click();

    // Wait for the server-side conversion to complete (Save button appears).
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Preview modal opens with dialog semantics.
    await page.getByRole("button", { name: "Preview Before / After Quality" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // Escape closes the modal.
    await dialog.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("code snippet modal opens as a dialog and Escape closes it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "API Snippets" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    await dialog.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
