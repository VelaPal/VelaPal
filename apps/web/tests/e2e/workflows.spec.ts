import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, role: "customer" | "seller" | "admin") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@velapal.demo`);
  await page.getByLabel("Password", { exact: true }).fill("demo12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (role === "admin") {
    await page.getByLabel("Authentication code").fill("123456");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await expect(page).toHaveURL("/workspace");
  await expect(
    page.getByRole("combobox", { name: "Switch workspace", exact: true }),
  ).toHaveValue(
    role === "customer"
      ? "ws_cust_01"
      : role === "seller"
        ? "ws_sell_01"
        : "ws_adm_01",
  );
}

test("protected navigation, session recovery, quotes and responsive workspaces", async ({
  page,
}) => {
  await page.goto("/workspace/cases");
  await expect(page).toHaveURL("/login");
  await login(page, "customer");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your overview" }),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/workspace/transactions/tx_vp_1028"]'),
  ).toBeVisible();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/cases/case_vp_0421");
    await expect(
      page.getByRole("heading", { name: "case_vp_0421", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/resolution-${width}.png`,
      fullPage: true,
    });
    if (width < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page.getByRole("dialog", { name: "Workspace navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Workspace navigation" }),
      ).not.toBeVisible();
    }
  }
  await page.goto("/workspace/catalog");
  await page
    .getByRole("button", { name: "256GB · $59.00", exact: true })
    .click();
  await page.getByRole("button", { name: "Get quote" }).click();
  await expect(page.getByText("READY", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Checkout submission is unavailable:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/workspace");
  await expect(page).toHaveURL("/login");
});

test("Customer issue, private evidence, Seller response, AI, proposal consent and Admin scoped intervention", async ({
  browser,
}) => {
  const customer = await browser.newContext();
  const seller = await browser.newContext();
  const admin = await browser.newContext();
  const cp = await customer.newPage(),
    sp = await seller.newPage(),
    ap = await admin.newPage();
  const browserErrors: string[] = [];
  for (const p of [cp, sp, ap])
    p.on("pageerror", (e) => browserErrors.push(e.message));
  await login(cp, "customer");
  await cp.goto("/workspace/cases");
  await cp.getByRole("link", { name: "Create dispute", exact: true }).click();
  await cp
    .getByRole("combobox", { name: "Transaction or order", exact: true })
    .selectOption("tx_demo_unconfirmed_0422");
  await cp
    .getByRole("combobox", { name: "Reason for this report", exact: true })
    .selectOption("CONTESTED_CLAIM");
  await cp
    .getByLabel("Your account of events")
    .fill("Please investigate the unconfirmed payment without assuming fault.");
  await cp.getByRole("checkbox").check();
  await cp.getByRole("button", { name: "Submit dispute", exact: true }).click();
  await expect(cp).toHaveURL(/\/workspace\/cases\/case_/);
  const casePath = new URL(cp.url()).pathname;
  await cp.getByLabel("Evidence file").setInputFiles({
    name: "serial-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic scan fixture"),
  });
  await cp.getByRole("button", { name: "Upload privately" }).click();
  await expect(cp.getByText("CLEAN", { exact: true })).toBeVisible();
  await login(sp, "seller");
  await sp.goto(casePath);
  await expect(
    sp.getByText("No evidence is visible to your workspace."),
  ).toBeVisible();
  await cp
    .getByLabel("I consent to share this source version", { exact: false })
    .check();
  await cp.getByRole("button", { name: "Share with case" }).click();
  await sp.getByRole("button", { name: "Refresh latest case" }).click();
  await expect(sp.getByText("serial-photo.png", { exact: true })).toBeVisible();
  await sp.getByRole("button", { name: "Discussion", exact: true }).click();
  await sp
    .getByRole("combobox", { name: "Audience", exact: true })
    .selectOption("PRIVATE");
  await sp
    .getByLabel("Message", { exact: true })
    .fill("Private Seller defense preparation.");
  await sp.getByRole("button", { name: "Save private note" }).click();
  await cp.getByRole("button", { name: "Discussion", exact: true }).click();
  await expect(cp.getByText("Private Seller defense preparation.")).toHaveCount(
    0,
  );
  await sp
    .getByRole("combobox", { name: "Audience", exact: true })
    .selectOption("CASE_SHARED");
  await sp
    .getByLabel("Message", { exact: true })
    .fill(
      "We will investigate the payment and support a voluntary resolution.",
    );
  await sp.getByRole("button", { name: "Save shared response" }).click();
  await cp.getByRole("button", { name: "AI assessment", exact: true }).click();
  await cp.getByRole("button", { name: "Refresh latest case" }).click();
  await cp.getByRole("button", { name: "Request shared assessment" }).click();
  await expect(cp.getByText("Simulated AI", { exact: true })).toBeVisible();
  await expect(cp.getByText("Uncertainty:", { exact: false })).toBeVisible();
  await sp
    .getByRole("button", { name: "Mediation & consent", exact: true })
    .click();
  await sp.getByRole("button", { name: "Refresh latest case" }).click();
  await sp
    .getByLabel("Exact terms", { exact: true })
    .fill(
      "Investigate through the official channel. No refund of an unconfirmed payment.",
    );
  await sp.getByLabel("Refund amount", { exact: false }).fill("0");
  await sp
    .getByRole("combobox", { name: "Settlement route", exact: true })
    .selectOption("OFFICIAL_HANDOFF");
  await sp.getByRole("button", { name: "Create proposal" }).click();
  await expect(
    sp.getByText("Proposal created. Both parties must review the exact terms."),
  ).toBeVisible();
  await cp
    .getByRole("button", { name: "Mediation & consent", exact: true })
    .click();
  await cp.getByRole("button", { name: "Refresh latest case" }).click();
  await cp.getByLabel("I reviewed these exact terms", { exact: false }).check();
  await cp
    .getByRole("button", { name: "Accept proposal terms", exact: true })
    .click();
  await expect(cp.getByText("Terms acceptance recorded.")).toBeVisible();
  await sp.getByLabel("I reviewed these exact terms", { exact: false }).check();
  await sp
    .getByRole("button", { name: "Accept proposal terms", exact: true })
    .click();
  await sp.getByRole("button", { name: "Start MFA step-up" }).click();
  await sp.getByLabel("MFA code", { exact: true }).fill("123456");
  await sp.getByRole("button", { name: "Verify and submit" }).click();
  await expect(sp.getByText("Verified action recorded.")).toBeVisible();
  await expect(
    sp.getByRole("button", { name: "Submit authorized settlement" }),
  ).toBeDisabled();
  await cp.getByRole("button", { name: "AI assessment", exact: true }).click();
  await cp
    .getByLabel("Reason for human review")
    .fill("Please review the remaining uncertainty and the official handoff.");
  await cp
    .getByRole("button", { name: "Request human review", exact: true })
    .click();
  await expect(cp.getByText("Human review requested.")).toBeVisible();
  await login(ap, "admin");
  await ap.goto(casePath.replace("/cases/", "/admin/"));
  await expect(
    ap.getByText("Metadata-only access", { exact: true }),
  ).toBeVisible();
  await ap
    .getByLabel("Assignment / intervention reason")
    .fill("Review shared records and pause for investigation.");
  await ap
    .getByLabel("I declare no conflict of interest", { exact: false })
    .check();
  await ap.getByRole("button", { name: "Assign myself", exact: true }).click();
  await expect(
    ap.getByRole("heading", { name: "Shared evidence investigation" }),
  ).toBeVisible();
  await ap
    .getByRole("combobox", { name: "Intervention action", exact: true })
    .selectOption("PAUSE");
  await ap.getByLabel("Confirm PAUSE", { exact: false }).check();
  await ap.getByRole("button", { name: "Start MFA step-up" }).click();
  await ap.getByLabel("MFA code", { exact: true }).fill("123456");
  await ap.getByRole("button", { name: "Verify and submit" }).click();
  await expect(ap.getByText("PAUSED", { exact: true })).toBeVisible();
  await ap.goto("/workspace/admin/audit");
  await expect(
    ap.getByText("ADMIN_INTERVENTION_RECORDED", { exact: true }),
  ).toBeVisible();
  await cp.goto("/workspace");
  await cp
    .getByText("Operation reconciliation fixture · synthetic UNKNOWN result", {
      exact: true,
    })
    .click();
  await cp
    .getByRole("button", { name: "Reconcile existing operation", exact: true })
    .click();
  await expect(cp.getByText("UNKNOWN", { exact: true })).toBeVisible();
  await expect(cp.getByText("SIMULATED ONLY:", { exact: false })).toBeVisible();
  await cp.evaluate(() => window.scrollTo(0, 0));
  await ap.evaluate(() => window.scrollTo(0, 0));
  await cp.screenshot({
    path: "test-results/customer-dashboard.png",
    fullPage: true,
  });
  await ap.screenshot({ path: "test-results/admin-audit.png", fullPage: true });
  expect(browserErrors).toEqual([]);
  await customer.close();
  await seller.close();
  await admin.close();
});

for (const role of ["customer", "seller", "admin"] as const) {
  test(`${role} design system and responsive workspace`, async ({ page }) => {
    await login(page, role);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/workspace");
      await expect(
        page.getByRole("heading", {
          name:
            role === "admin"
              ? "A clear view of operations."
              : role === "seller"
                ? "A good day to move things forward."
                : "Your overview",
          exact: true,
        }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      if (width === 1440) {
        await expect(page.locator(".vp-desktop-sidebar")).toBeVisible();
        expect(
          await page
            .locator(".vp-desktop-sidebar")
            .evaluate((el) => el.getBoundingClientRect().width),
        ).toBe(224);
      } else {
        await expect(
          page.getByRole("navigation", {
            name: "Mobile workspace",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "More navigation", exact: true })
          .click();
        await expect(
          page.getByRole("dialog", {
            name: "Workspace navigation",
            exact: true,
          }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("dialog", {
            name: "Workspace navigation",
            exact: true,
          }),
        ).not.toBeVisible();
      }
      await page.screenshot({
        path: `.visual-audit/local-${role}-${width}-viewport.png`,
        fullPage: false,
      });
      await page.screenshot({
        path: `.visual-audit/local-${role}-${width}.png`,
        fullPage: true,
      });
      const target = role === "admin" ? "/workspace/admin" : "/workspace/cases";
      await page.goto(target);
      await expect(
        page.getByRole("heading", {
          name:
            role === "admin"
              ? "A clear view. A careful intervention."
              : "Let’s find a fair way forward.",
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.visual-audit/local-${role}-case-${width}.png`,
        fullPage: true,
      });
      if (role !== "admin" && width === 390) {
        const create = page.getByRole("link", {
          name: role === "seller" ? "Create Seller report" : "Create dispute",
          exact: true,
        });
        await create.click();
        await expect(
          page.getByRole("heading", { name: "Start with what happened." }),
        ).toBeVisible();
        await page.screenshot({
          path: `.visual-audit/local-${role}-create-390.png`,
          fullPage: true,
        });
        await page.getByRole("link", { name: "Go back", exact: true }).click();
        await expect(create).toBeVisible();
      }
    }
  });
}

test("login matches the responsive design and password visibility remains accessible", async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("demo12345");
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Hide password", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "password");
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `.visual-audit/local-login-${width}.png`,
      fullPage: true,
    });
  }
});

test("public landing, registration validation and simulated verification work without a real backend", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer way to buy. And resolve." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await expect(page).toHaveURL("/register");
  await page.getByLabel("Full name", { exact: true }).fill("Alex Morgan");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("alex@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fictional-password-123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-password-123");
  await page.getByRole("button", { name: "Create personal account" }).click();
  await expect(
    page.getByText("Passwords do not match.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("fictional-password-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create personal account" }).click();
  await expect(page).toHaveURL("/verify-email");
  await expect(
    page.getByText("No email is sent in this prototype.", { exact: false }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    sessionStorage.getItem("velapal:registration-preview"),
  );
  expect(saved).not.toContain("password");
  expect(saved).not.toContain("fictional-password-123");
  await page.getByRole("button", { name: "Test expired link" }).click();
  await expect(
    page.getByRole("button", { name: "Simulate verified email" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Resend verification link" }).click();
  await page.getByRole("button", { name: "Simulate verified email" }).click();
  await expect(
    page.getByRole("heading", { name: "Your next step is ready." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your next step is ready." }),
  ).toBeVisible();
  await page.goto("/register");
  await page
    .getByRole("button", { name: "Seller account", exact: false })
    .click();
  await expect(page.getByLabel("Business name", { exact: true })).toBeVisible();
  await page.getByLabel("Owner / responsible person").fill("Alex Morgan");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Alex Demo Store");
  await page
    .getByLabel("Business email", { exact: true })
    .fill("store@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fictional-password-123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("fictional-password-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create seller account" }).click();
  await expect(page).toHaveURL("/verify-email");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("velapal:registration-preview")!)
          .party,
    ),
  ).toBe("SELLER");
});

test("new public pages, assistant and dispute intake fit all requested screen sizes", async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/register", "/verify-email"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.visual-audit/local-${route.replaceAll("/", "") || "landing"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await login(page, "customer");
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/workspace/assistant", "/workspace/cases/new"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.visual-audit/local-${route.endsWith("new") ? "create-case" : "assistant"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto("/workspace/assistant");
  await page
    .getByRole("button", { name: "Check my subscriptions", exact: false })
    .click();
  await expect(page.getByLabel("Your private question")).toHaveValue(
    "Help me review my upcoming subscription renewals.",
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(
    page.getByText("SIMULATED: No Gemini call was performed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.locator(".vp-chat-welcome")).toBeVisible();
  await page.goto("/workspace/cases");
  await page
    .getByLabel("Search case or transaction")
    .fill("no-case-matches-this");
  await expect(page.getByText("No cases match this view.")).toBeVisible();
});
