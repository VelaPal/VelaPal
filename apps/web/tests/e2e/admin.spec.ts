import { test, expect, type Page } from "@playwright/test";
async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@velapal.demo");
  await page.getByLabel("Password", { exact: true }).fill("demo12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Authentication code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL("/workspace");
  await expect(
    page.getByRole("heading", { name: "A clear view of operations." }),
  ).toBeVisible();
}
async function confirm(
  page: Page,
  title: string,
  reason = "Reviewed the fictional record and approved this local change.",
) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.getByLabel("Reason for this action").fill(reason);
  await dialog.getByLabel("Verify with authenticator code").fill("123456");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: title, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test("Admin user, merchant and staff reviews persist locally and appear in audit without changing real access", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAdmin(page);
  await page.goto("/workspace/admin/users");
  const user = page.getByRole("row").filter({ hasText: "daffa@example.test" });
  await user.getByRole("button", { name: "Suspend", exact: true }).click();
  let dialog = page.getByRole("dialog", {
    name: "Suspend account",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Suspend account", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Reason for this action")
    .fill("Review suspicious access in this fictional account.");
  await dialog.getByLabel("Verify with authenticator code").fill("000000");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Use demo authenticator code 123456.",
  );
  await dialog.getByLabel("Verify with authenticator code").fill("123456");
  await dialog
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  await expect(user.getByText("Suspended", { exact: true })).toBeVisible();
  await page.reload();
  await expect(user.getByText("Suspended", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Account status" })
    .selectOption("Suspended");
  await expect(page.getByRole("row")).toHaveCount(2);
  await user.getByRole("button", { name: "Restore access" }).click();
  await confirm(page, "Restore account");
  await expect(page.getByText("No accounts match this search.")).toBeVisible();
  await page.goto("/workspace/admin/merchants");
  await page
    .getByRole("combobox", { name: "Merchant status" })
    .selectOption("Pending");
  await page
    .getByRole("row")
    .filter({ hasText: "Northstar Studio" })
    .getByRole("button", { name: "Review details" })
    .click();
  dialog = page.getByRole("dialog", { name: "Northstar Studio", exact: true });
  await expect(
    dialog.getByText("PayPal authorization", { exact: false }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Review approval" }).click();
  await confirm(page, "Approve merchant");
  await expect(
    page.getByText("No businesses match this search."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Merchant status" })
    .selectOption("Approved");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Northstar Studio" })
      .getByText("Approved", { exact: true }),
  ).toBeVisible();
  await page.goto("/workspace/admin/roles");
  await page
    .getByRole("checkbox", { name: "audit.read", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Review changes" }).click();
  await confirm(page, "Update staff permissions");
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "audit.read", exact: true }),
  ).not.toBeChecked();
  await page.goto("/workspace/admin/audit");
  for (const text of [
    "Account suspended",
    "Account restored",
    "Merchant approved",
    "Staff permissions updated",
  ])
    await expect(
      page.getByRole("cell", { name: text, exact: true }),
    ).toBeVisible();
  await page
    .getByLabel("Search action, actor or target…")
    .fill("Merchant approved");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.screenshot({
    path: ".visual-audit/local-admin-audit-actions.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("Admin AI controls, trace, exports, invitations and reset complete their preview journeys", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/workspace/admin/ai");
  await page
    .getByRole("button", { name: "Inspect sample trace" })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Personal Agent · sample trace" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pause new runs" }).click();
  await confirm(page, "Pause new runs");
  await expect(page.getByText("Paused", { exact: true })).toHaveCount(5);
  await page.getByRole("button", { name: "Resume new runs" }).click();
  await confirm(page, "Resume new runs");
  await expect(page.getByText("Available", { exact: true })).toHaveCount(5);
  await page.goto("/workspace/admin/transactions");
  await page.getByLabel("Transaction status").selectOption("Refunded");
  await expect(page.getByRole("row")).toHaveCount(2);
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export demo" }).click();
  expect((await download).suggestedFilename()).toBe(
    "velapal-demo-transactions.csv",
  );
  await page.goto("/workspace/admin/analytics");
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export report" }).click();
  expect((await download).suggestedFilename()).toBe("velapal-demo-report.csv");
  await page.goto("/workspace/admin/settings");
  await page
    .getByRole("button", { name: "Preview internal invitation" })
    .click();
  await page.getByLabel("Staff email").fill("new-auditor@example.test");
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  await confirm(page, "Record invitation preview");
  await expect(
    page.getByText("1 local invitation preview(s). No email sent."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke other session" }).click();
  await confirm(page, "Revoke sample session");
  await expect(
    page.getByText("Revoked · local fixture", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview session expiry" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your session has expired." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByText("Prototype controls", { exact: true }).click();
  await page
    .getByRole("button", { name: "Reset prototype records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset local preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke other session" }),
  ).toBeEnabled();
  await page.goto("/workspace/admin/audit");
  await expect(
    page.getByRole("cell", {
      name: "Internal invitation previewed",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("Every Admin menu and dialog fits 360, 390, 768 and 1440 pixel screens", async ({
  page,
}) => {
  test.setTimeout(120000);
  await loginAdmin(page);
  const routes = [
    ["users", "User management"],
    ["merchants", "Merchant verification"],
    ["transactions", "Transaction monitoring"],
    ["", "A clear view. A careful intervention."],
    ["ai", "AI agent monitoring"],
    ["analytics", "Operational reporting"],
    ["audit", "Audit logs & security"],
    ["roles", "Roles & permissions"],
    ["settings", "Administrative settings"],
  ];
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [slug, title] of routes) {
      await page.goto(`/workspace/admin${slug ? "/" + slug : ""}`);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.visual-audit/local-admin-${slug || "disputes"}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto("/workspace/admin/users");
    const trigger = page
      .getByRole("row")
      .filter({ hasText: "daffa@example.test" })
      .getByRole("button", { name: "Suspend", exact: true });
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "Suspend account" }),
    ).toBeVisible();
    await page.screenshot({
      path: `.visual-audit/local-admin-confirm-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    if (width < 1024) {
      await page.getByRole("button", { name: "More navigation" }).click();
      const nav = page.getByRole("dialog", { name: "Workspace navigation" });
      await expect(
        nav.getByRole("link", { name: "Roles & permissions", exact: true }),
      ).toBeVisible();
      await nav
        .getByRole("link", { name: "Roles & permissions", exact: true })
        .click();
      await expect(nav).not.toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Roles & permissions", exact: true }),
      ).toBeVisible();
    }
  }
});

test("Admin investigation tabs preserve scoped source access and fit every requested width", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/workspace/admin/case_vp_0421");
  await expect(
    page.getByRole("heading", {
      name: "Two perspectives. One case.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Assignment / intervention reason")
    .fill("Review the shared case before deciding the next step.");
  await page
    .getByLabel("I declare no conflict of interest", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Assign myself", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Shared evidence investigation",
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [tab, heading] of [
      ["Evidence", "Shared evidence investigation"],
      ["Mediation", "Shared assessment"],
      ["Activity", "Case activity"],
      ["Overview", "Two perspectives. One case."],
    ]) {
      await page
        .getByRole("navigation", { name: "Investigation views" })
        .getByRole("button", { name: new RegExp("^" + tab) })
        .click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.visual-audit/local-admin-investigation-${tab.toLowerCase()}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page
    .getByRole("link", { name: "Open account security", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Administrative settings" }),
  ).toBeVisible();
});
