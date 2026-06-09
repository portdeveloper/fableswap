// Headless e2e: connect mock wallet -> faucet -> approve -> swap -> verify.
// Run with the dev server up (NEXT_PUBLIC_ENABLE_MOCK_WALLET=1) and Anvil
// seeded by contracts/script/Deploy.s.sol.
import { chromium } from "playwright";

const BASE = process.env.E2E_URL ?? "http://localhost:3000";
const step = (msg) => console.log(`\n=== ${msg}`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

try {
  step("load app");
  await page.goto(BASE, { waitUntil: "networkidle" });

  step("connect mock wallet");
  await page.getByTestId("connect-mock").click();
  await page.getByTestId("account-address").waitFor({ timeout: 15_000 });
  console.log("connected as", await page.getByTestId("account-address").innerText());

  step("faucet: claim WMON and USDC");
  for (const sym of ["WMON", "USDC"]) {
    await page.getByTestId(`faucet-${sym}`).click();
    await page.waitForFunction(
      (s) => document.querySelector(`[data-testid="balance-${s}"]`)?.textContent.startsWith("1000"),
      sym,
      { timeout: 20_000 }
    );
    console.log(`${sym} balance:`, await page.getByTestId(`balance-${sym}`).innerText());
  }

  step("swap 100 WMON -> USDC");
  await page.getByTestId("swap-amount-in").fill("100");
  await page.waitForFunction(
    () => {
      const t = document.querySelector('[data-testid="swap-amount-out"]')?.textContent;
      return t && t !== "0.0" && parseFloat(t) > 0;
    },
    { timeout: 15_000 }
  );
  const quote = await page.getByTestId("swap-amount-out").innerText();
  console.log("UI quote for 100 WMON:", quote, "USDC");
  // Expected: 100*0.997*20000/(10000+100*0.997) = 197.43... USDC
  if (Math.abs(parseFloat(quote) - 197.43) > 0.5) throw new Error(`quote off: ${quote}`);

  step("approve WMON");
  await page.getByTestId("swap-approve").click();
  await page.getByTestId("swap-submit").waitFor({ timeout: 20_000 });
  console.log("approval confirmed, swap button visible");

  step("submit swap");
  await page.getByTestId("swap-submit").click();
  await page.getByTestId("tx-success").first().waitFor({ timeout: 20_000 });
  console.log("swap tx confirmed");

  step("verify balances moved");
  await page.waitForFunction(
    () => {
      const w = parseFloat(document.querySelector('[data-testid="balance-WMON"]')?.textContent ?? "0");
      const u = parseFloat(document.querySelector('[data-testid="balance-USDC"]')?.textContent ?? "0");
      return w === 900 && u > 1190;
    },
    { timeout: 20_000 }
  );
  const wmon = await page.getByTestId("balance-WMON").innerText();
  const usdc = await page.getByTestId("balance-USDC").innerText();
  console.log(`post-swap balances: ${wmon} WMON, ${usdc} USDC`);

  step("check pool reserves reflect the swap");
  await page.getByTestId("tab-pool").click();
  await page.getByTestId("pool-reserves").waitFor({ timeout: 15_000 });
  console.log("pool:", await page.getByTestId("pool-reserves").innerText());

  await page.screenshot({ path: "e2e/after-swap.png", fullPage: true });
  console.log("\nE2E PASSED");
} catch (err) {
  await page.screenshot({ path: "e2e/failure.png", fullPage: true }).catch(() => {});
  console.error("\nE2E FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
