import { expect, test } from '@playwright/test';
import path from 'node:path';

test('a framed vector chart stays between its lead paragraph and its caption in reflow', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Choose books')
    .setInputFiles(path.resolve('tests/fixtures/framed-bar-chart.pdf'));
  await page.getByRole('button', { name: 'Open Rain gauge', exact: true }).click();
  const body = page.getByLabel('Book text');
  const chart = body.locator('figure img');
  await expect(chart).toHaveAttribute('alt', /Diagram on page 1.*January.*February.*March/);
  await expect(chart).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(body.locator('p + figure + p')).toContainText('Figure 1. Rainfall observed');
  await expect(body).not.toContainText('January');
});
