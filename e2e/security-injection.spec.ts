import { test, expect, Page } from '@playwright/test';
import { installMockSupabase, defaultMockState } from './fixtures/mockSupabase';

/**
 * XSS injection probes.
 *
 * React auto-escapes any string interpolated as `{value}` — the only attack
 * surface left is `dangerouslySetInnerHTML`, raw href/src attributes, or
 * sneaky innerHTML usage. These tests ram script payloads through every
 * persistent text surface (program name, exercise name, day name, notes)
 * and assert nothing executes. We monitor:
 *
 *   - window.alert (overridden to flag if it ever fires)
 *   - page.on('dialog') (browser-native alert dispatch)
 *   - page.on('pageerror') (script-related runtime explosions)
 *   - presence of literal injected strings as text vs. as DOM nodes
 *
 * The mock layer carries the typing through the exact same React + setState
 * paths a real save would, so what we render here is what would render in
 * production after the saved value round-trips through Supabase.
 */

const PAYLOADS = [
  `<script>alert('hack-script')</script>`,
  `<img src=x onerror="alert('hack-onerror')">`,
  `"><img src=x onerror=alert('hack-attr')>`,
  `javascript:alert('hack-href')`,
  `<svg onload=alert('hack-svg')>`,
  `<iframe src="javascript:alert('hack-iframe')"></iframe>`,
];

async function gotoAdminEditor(page: Page) {
  await installMockSupabase(page, defaultMockState());
  await page.goto('/');
  await expect(page.getByText('Sarah Cohen').first()).toBeVisible({ timeout: 10_000 });
  await page.getByText('Sarah Cohen').first().click();
  await page.getByTestId('admin-btn').click();
  await expect(page.getByText(/Admin Panel/i)).toBeVisible({ timeout: 10_000 });
}

/**
 * Wire up alert / pageerror / dialog spies BEFORE injecting. Returns a
 * `triggered()` predicate the test can call to assert nothing fired.
 */
async function armXssSpies(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error — test instrumentation
    window.__xssAlerts = [];
    const original = window.alert;
    window.alert = (msg) => {
      // Capture and swallow — letting real alerts through would block the
      // test runner.
      // @ts-expect-error — test instrumentation
      window.__xssAlerts.push(String(msg));
      try { original.call(window, msg); } catch { /* noop */ }
    };
  });

  const dialogTexts: string[] = [];
  page.on('dialog', (d) => {
    dialogTexts.push(d.message());
    void d.dismiss();
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  return {
    async getAlertCount(): Promise<number> {
      return await page.evaluate(() => {
        // @ts-expect-error — test instrumentation
        return (window.__xssAlerts as string[]).length;
      });
    },
    dialogTexts,
    pageErrors,
  };
}

test.describe('XSS — Program Editor inputs', () => {
  for (const payload of PAYLOADS) {
    test(`exercise name input rejects: ${payload.slice(0, 40)}`, async ({ page }) => {
      const spies = await armXssSpies(page);
      await gotoAdminEditor(page);

      // First exercise name input. We use the same structural locator the
      // hardening sprint settled on so future renames don't break us.
      const exNameInput = page.locator('.space-y-2 > div.grid').first().locator('input').first();
      await exNameInput.click();
      await exNameInput.fill(payload);

      // Wait through the debounce + a render tick so the DOM reflects the
      // saved value as React would re-render it.
      await page.waitForTimeout(800);

      // Hard assertion 1: the input still holds the literal payload as a
      // STRING value — meaning React put it in .value (safe), not into the
      // DOM as HTML.
      // (maxLength=150 from the previous sprint — every payload here is
      // under that, so the full string survives.)
      const liveValue = await exNameInput.inputValue();
      expect(liveValue).toBe(payload);

      // Hard assertion 2: no attack-shaped DOM nodes materialized. The dev
      // bundle ships its own `<script type="module" src="/src/main.tsx">`
      // tags so we can't just count `body script` — instead we look for
      // elements that ONLY a successful XSS could have produced: image /
      // svg / iframe nodes carrying inline event handlers or `javascript:`
      // URLs, and inline script tags whose body contains an `alert(` call.
      const injected = await page.locator(
        'body img[onerror], body svg[onload], body iframe[src^="javascript:"], body a[href^="javascript:"]',
      ).count();
      expect(injected).toBe(0);
      const dangerousScript = await page.evaluate(() => {
        const scripts = Array.from(document.body.querySelectorAll('script'));
        return scripts.some((s) => /alert\s*\(/i.test(s.textContent ?? ''));
      });
      expect(dangerousScript).toBe(false);

      // Hard assertion 3: no alert call, no dialog event, no pageerror.
      expect(await spies.getAlertCount()).toBe(0);
      expect(spies.dialogTexts, `unexpected alert dialogs: ${spies.dialogTexts.join('|')}`).toEqual([]);
      // Filter out unrelated dev-tool noise.
      const realPageErrors = spies.pageErrors.filter(
        (e) => !/React DevTools/i.test(e),
      );
      expect(realPageErrors, `unexpected page errors: ${realPageErrors.join('|')}`).toEqual([]);
    });
  }

  test('program name input rejects a script tag payload', async ({ page }) => {
    const spies = await armXssSpies(page);
    await gotoAdminEditor(page);

    const programInput = page.locator('input').first();
    const payload = `<script>alert('program-name-xss')</script>`;
    await programInput.click();
    await programInput.fill(payload);
    await page.waitForTimeout(700);

    expect(await programInput.inputValue()).toBe(payload);
    const dangerous = await page.evaluate(() => {
      const scripts = Array.from(document.body.querySelectorAll('script'));
      return scripts.some((s) => /alert\s*\(/i.test(s.textContent ?? ''));
    });
    expect(dangerous).toBe(false);
    expect(await spies.getAlertCount()).toBe(0);
    expect(spies.dialogTexts).toEqual([]);
  });
});

test.describe('XSS — Trainee notes / actuals', () => {
  test('trainee notes column rejects HTML payloads on render', async ({ page }) => {
    // Seed an exercise whose notes ALREADY contain the malicious string,
    // so the test exercises the RENDER path (not just the input path).
    // We do this by adjusting the mock state before installing.
    const state = defaultMockState();
    const payload = `<img src=x onerror="alert('notes-render-xss')">`;
    state.programs[0].weeks[0].days[0].exercises[0].notes = payload;

    await installMockSupabase(page, state);
    const spies = await armXssSpies(page);

    await page.goto('/');
    // Coach view — but we're testing the program editor's render of the
    // saved notes, since the trainee logger renders the field too.
    await page.getByText('Sarah Cohen').first().click();
    await page.getByTestId('admin-btn').click();
    await expect(page.getByText(/Admin Panel/i)).toBeVisible({ timeout: 10_000 });

    // The text appears in the editor (as a column value or readonly
    // display). Either way, no alert / pageerror should fire.
    await page.waitForTimeout(800);

    expect(await page.locator('body img[onerror]').count()).toBe(0);
    expect(await spies.getAlertCount()).toBe(0);
    expect(spies.dialogTexts).toEqual([]);
  });
});
