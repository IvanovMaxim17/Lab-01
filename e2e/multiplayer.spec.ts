import { test, expect } from '@playwright/test';

test('два клієнти заходять в одну кімнату, бачать рух корабля та отримують чат', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await Promise.all([pageA.goto('/'), pageB.goto('/')]);

  await pageA.locator('input[type="text"]').first().fill('PilotAlpha');
  await pageB.locator('input[type="text"]').first().fill('PilotBeta');

  await pageA.getByRole('button', { name: 'Увійти в гру' }).click();
  await pageB.getByRole('button', { name: 'Увійти в гру' }).click();

  await expect(pageA.locator('canvas')).toBeVisible();
  await expect(pageB.locator('canvas')).toBeVisible();
  await expect(pageB.locator('.chat-status')).toContainText('У кімнаті:', { timeout: 5000 });

  // Політ першого гравця вперед та постріл
  await pageA.keyboard.down('KeyW');
  await pageA.keyboard.down('Space');
  await pageA.waitForTimeout(450);
  await pageA.keyboard.up('Space');
  await pageA.keyboard.up('KeyW');

  // Перевірка доставки повідомлення чату іншому гравцю
  const chatInputA = pageA.locator('input[placeholder="Напиши повідомлення..."]');
  await chatInputA.fill('Привіт із E2E тесту!');
  await chatInputA.press('Enter');
  await expect(pageB.locator('.chat-messages')).toContainText('Привіт із E2E тесту!', { timeout: 5000 });

  await ctxA.close();
  await ctxB.close();
});
