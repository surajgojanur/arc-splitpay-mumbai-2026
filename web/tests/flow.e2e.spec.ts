import { test, expect } from "@playwright/test";
import path from "node:path";
const shot = (name: string) =>
  path.resolve(
    process.env.ARCSPLIT_SCREENSHOT_DIR || "public/screenshots/integration",
    `${name}.png`,
  );
test("fixture invoice validation, preview, rejection, pending, recovery and receipt", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("DEMO DATA", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: shot("landing"), fullPage: true });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.locator(".notice[role=alert]").last()).toContainText(
    "No wallet found",
  );
  await page.screenshot({ path: shot("wallet-disconnected"), fullPage: true });
  await page
    .getByRole("button", { name: "Create an invoice", exact: false })
    .click();
  await page.screenshot({ path: shot("invoice-form"), fullPage: true });
  await page
    .getByRole("button", { name: "Create demo invoice", exact: false })
    .click();
  await expect(
    page.getByText("Enter a valid, nonzero wallet address."),
  ).toHaveCount(2);
  await page.screenshot({ path: shot("validation-errors"), fullPage: true });
  await page
    .getByRole("button", { name: "Use demo wallet & sample recipients" })
    .click();
  await expect(page.getByText("70 USDC", { exact: true })).toBeVisible();
  await expect(page.getByText("30 USDC", { exact: true })).toBeVisible();
  await page.screenshot({ path: shot("invoice-preview"), fullPage: true });
  await page
    .getByRole("button", { name: "Create demo invoice", exact: false })
    .click();
  await page.getByLabel("Demo outcome").selectOption("reject");
  await page.getByRole("button", { name: "1. Simulate approval" }).click();
  await expect(page.getByRole("status")).toContainText("Approval pending");
  await expect(page.locator(".notice[role=alert]").last()).toContainText(
    "Wallet request rejected",
  );
  await page.getByLabel("Demo outcome").selectOption("success");
  await page.getByRole("button", { name: "1. Simulate approval" }).click();
  await expect(
    page.getByRole("button", { name: "2. Confirm demo payment" }),
  ).toBeEnabled();
  await page.getByLabel("Demo outcome").selectOption("fail");
  await page.getByRole("button", { name: "2. Confirm demo payment" }).click();
  await expect(page.getByRole("status")).toContainText("Payment pending");
  await page.screenshot({ path: shot("payment-pending"), fullPage: true });
  await expect(page.locator(".notice[role=alert]").last()).toContainText(
    "transaction failed",
  );
  await page.getByLabel("Demo outcome").selectOption("success");
  await page.getByRole("button", { name: "2. Confirm demo payment" }).click();
  await expect(page.getByText("Both payouts simulated.")).toBeVisible();
  await expect(page.getByText("None — fixture simulation")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2. Confirm demo payment" }),
  ).toHaveCount(0);
  await page.screenshot({ path: shot("receipt"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: shot("mobile-receipt"), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("mobile invoice form and split preview fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an invoice", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Use demo wallet & sample recipients" })
    .click();
  await expect(page.getByText("70 USDC", { exact: true })).toBeVisible();
  await expect(page.getByText("30 USDC", { exact: true })).toBeVisible();
  await page.screenshot({ path: shot("mobile-invoice-form"), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByRole("button", { name: "Create demo invoice", exact: false })
      .evaluate((button) => {
        const { left, right } = button.getBoundingClientRect();
        return left >= 0 && right <= window.innerWidth;
      }),
  ).toBe(true);
});
test("lookup, cancellation and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: shot("mobile-landing"), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Invoice ID", { exact: true }).fill("999");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.locator(".notice[role=alert]").last()).toContainText(
    "not found",
  );
  await page.getByRole("button", { name: "Explore demo" }).click();
  await page.getByRole("button", { name: "Cancel demo invoice" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2. Confirm demo payment" }),
  ).toHaveCount(0);
});
test("injected wallet wrong network and rejected switch", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", {
      value: {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_requestAccounts")
            return ["0x1111111111111111111111111111111111111111"];
          if (method === "eth_chainId") return "0x1";
          if (method === "wallet_switchEthereumChain")
            throw Object.assign(new Error("User rejected network switch"), {
              code: 4001,
            });
          throw new Error(method);
        },
        on: () => {},
        removeListener: () => {},
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(
    page.getByText("Your wallet is on another network.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to Arc Testnet" }).click();
  await expect(page.getByRole("alert").first()).toContainText("rejected");
});

test("live payments stay disabled without a deployment on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Live payments", exact: true })
    .click();
  await expect(
    page.getByText("Contract not deployed — testnet payments unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("DEMO DATA", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create invoice on Arc Testnet" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Read invoice from chain" }),
  ).toBeDisabled();
  await page.screenshot({ path: shot("live-not-deployed"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: shot("mobile-live-not-deployed"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
