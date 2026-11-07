import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, role: "customer" | "seller") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@velapal.demo`);
  await page.getByLabel("Password", { exact: true }).fill("demo12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/workspace");
  await expect(
    page.getByRole("heading", {
      name:
        role === "seller"
          ? "A good day to move things forward."
          : "Your overview",
      exact: true,
    }),
  ).toBeVisible();
}
test("Customer P1 previews preserve billing, consent, private library access and notification choices", async ({
  page,
}) => {
  await login(page, "customer");
  await page.goto("/workspace/subscriptions");
  await page.getByRole("button", { name: "Remind me tomorrow" }).click();
  await expect(
    page.getByText("Billing date unchanged.", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel subscription", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Make room for something else?",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Confirm demo cancellation" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Confirm demo cancellation" })
    .click();
  await expect(
    page
      .locator(".vp-subscription-card")
      .getByText("Cancelled", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(".vp-subscription-card")
      .getByText("Cancelled", { exact: true }),
  ).toBeVisible();
  await page.goto("/workspace/library");
  await page.getByRole("button", { name: "Open your guide" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download demo excerpt" }).click();
  expect((await download).suggestedFilename()).toBe(
    "velapal-demo-guide-excerpt.txt",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View purchase agreement" }).click();
  await expect(
    page.getByRole("dialog", { name: "Sample purchase agreement" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/workspace/notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mark all as read" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Open account security", exact: true })
    .click();
  await page.getByRole("switch", { name: "In-app reminders" }).click();
  await page.getByLabel("Default purchase limit · USD").fill("5.00");
  await page.getByRole("button", { name: "Save limit" }).click();
  await page.goto("/workspace/catalog");
  await expect(page.getByLabel("Spending limit · USD")).toHaveValue("5.00");
  await page
    .getByRole("button", { name: "256GB · $59.00", exact: true })
    .click();
  await page.getByRole("button", { name: "Get quote" }).click();
  await expect(page.getByText("OVER_LIMIT", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review checkout preview" }),
  ).toBeDisabled();
  await page.goto("/workspace/settings");
  await page.getByText("Prototype controls", { exact: true }).click();
  await page
    .getByRole("button", { name: "Reset demo workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset local preview", exact: true })
    .click();
  await expect(
    page.getByLabel("Default purchase limit \u00b7 USD"),
  ).toHaveValue("75.00");
  await page.goto("/workspace/subscriptions");
  await expect(
    page.locator(".vp-subscription-card").getByText("Active", { exact: true }),
  ).toBeVisible();
  await page.goto("/workspace/products");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "A Seller workspace is required.",
  );
});
test("Seller catalogue and fulfilment previews preserve actual payment records and restrict unconfirmed orders", async ({
  page,
}) => {
  await login(page, "seller");
  await page.goto("/workspace/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add a product" });
  await dialog.getByLabel("Product name").fill("Demo notebook");
  await dialog.getByLabel("Variant or plan").fill("Digital edition");
  await dialog.getByLabel("SKU", { exact: true }).fill("DEMO-NOTE-001");
  await dialog.getByLabel("Price · USD").fill("9.99");
  await dialog
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await page.getByLabel("Search products or SKU…").fill("DEMO-NOTE-001");
  const product = page
    .getByRole("article")
    .filter({ hasText: "Demo notebook" });
  await expect(product).toBeVisible();
  await product.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(product.getByText("Archived", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Search products or SKU…").fill("DEMO-NOTE-001");
  await expect(product.getByText("Archived", { exact: true })).toBeVisible();
  await page.goto("/workspace/orders");
  await page
    .getByRole("row")
    .filter({ hasText: "tx_demo_unconfirmed_0422" })
    .getByRole("button", { name: "Open order" })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Do not fulfil this order", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save fulfilment preview" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("row")
    .filter({ hasText: "tx_vp_1028" })
    .getByRole("button", { name: "Open order" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tracking reference").fill("TRACK-DEMO-001");
  await expect(
    dialog.getByRole("button", { name: "Save fulfilment preview" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save fulfilment preview" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "tx_vp_1028" })
      .getByText("Shipped · preview"),
  ).toBeVisible();
  await page.goto("/workspace/payments");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "tx_vp_1028" })
      .getByText("PAID", { exact: true }),
  ).toBeVisible();
  await page.goto("/workspace/assistant");
  await page.getByRole("button", { name: "Summarize pending orders" }).click();
  await page.getByRole("button", { name: "Prepare a draft" }).click();
  await expect(
    page.getByText("Scripted preparation preview.", { exact: false }),
  ).toBeVisible();
  await page.goto("/workspace/cases");
  await page
    .getByRole("button", { name: "Incoming disputes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Incoming disputes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/workspace/library");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "A personal workspace is required.",
  );
});
test("Recovery, application resubmission, checkout review and official handoff disclose their exact limits", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("fictional@example.test");
  await page.getByRole("button", { name: "Preview recovery email" }).click();
  await page.getByRole("link", { name: "Preview reset link" }).click();
  await page
    .getByLabel("New password", { exact: true })
    .fill("a-fictional-reset-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("a-fictional-reset-password");
  await page
    .getByRole("button", { name: "Preview password reset", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A fresh start, previewed." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain("a-fictional-reset-password");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Preview password reset", exact: true }),
  ).toHaveCount(0);
  await login(page, "customer");
  await page.goto("/workspace/merchant-application");
  await page.getByText("Prototype review states", { exact: true }).click();
  await page
    .getByRole("button", { name: "Preview rejected", exact: true })
    .click();
  await page.getByLabel("Business display name").fill("Fictional workshop");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Resubmit application" }).click();
  await expect(
    page.locator(".vp-admin-badge").getByText("Pending", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Switch workspace", exact: true }),
  ).toHaveValue("ws_cust_01");
  await page.goto("/workspace/catalog");
  await page
    .getByRole("button", { name: "256GB · $59.00", exact: true })
    .click();
  await page.getByRole("button", { name: "Get quote" }).click();
  await page.getByRole("button", { name: "Review checkout preview" }).click();
  let dialog = page.getByRole("dialog", { name: "Review this purchase" });
  await expect(
    dialog.getByRole("button", { name: "Preview provider approval" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Preview provider approval" })
    .click();
  await dialog
    .getByRole("button", { name: "Check provider availability" })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "No capture was requested" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/workspace/cases/case_vp_0421");
  await page
    .getByRole("button", { name: "Mediation & consent", exact: true })
    .click();
  await page.getByRole("button", { name: "Review handoff checklist" }).click();
  dialog = page.getByRole("dialog", {
    name: "Prepared handoff · not submitted",
  });
  await expect(
    dialog.getByRole("button", { name: "Mark checklist reviewed" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Mark checklist reviewed" }).click();
  await expect(
    page.getByText("Nothing was submitted or shared with the provider.", {
      exact: false,
    }),
  ).toBeVisible();
});
test("All Customer and Seller design destinations fit 360, 390, 768 and 1440 pixels", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const role of ["customer", "seller"] as const) {
    await login(page, role);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of role === "customer"
        ? [
            "subscriptions",
            "library",
            "notifications",
            "settings",
            "merchant-application",
          ]
        : [
            "products",
            "orders",
            "payments",
            "subscriptions",
            "insights",
            "assistant",
            "notifications",
            "settings",
          ]) {
        await page.goto(`/workspace/${route}`);
        await expect(page.locator("h1")).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: `.visual-audit/local-${role}-${route}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
});

test("Public exception pages preserve branded navigation and the missing route returns 404", async ({
  page,
}) => {
  await page.goto("/forbidden");
  await expect(
    page.getByRole("heading", { name: "This workspace needs permission." }),
  ).toBeVisible();
  await page.goto("/session-expired");
  await page.getByRole("link", { name: "Sign in again", exact: true }).click();
  await expect(page).toHaveURL("/login");
  const response = await page.goto("/not-a-velapal-route");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page has sailed out of view." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to VelaPal", exact: true })
    .click();
  await expect(page).toHaveURL("/");
});
