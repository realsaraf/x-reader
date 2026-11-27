import { expect, test } from '@playwright/test';
import path from 'node:path';

test('a PDF keeps its two reading positions, bookmark and theme after reopening', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pdf = path.resolve('public/books/the-quiet-atlas.pdf');
  await page.goto('/');
  await page.getByLabel('Choose books').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Open The Quiet Atlas', exact: true }).click();
  await expect(page.getByLabel('Book text')).toContainText('The first mark in my notebook');
  await page.getByRole('button', { name: 'Table of contents' }).click();
  await page.getByRole('button', { name: 'A measure of distance', exact: true }).click();
  await page.getByRole('button', { name: 'Close Contents' }).click();
  await page.getByRole('button', { name: 'Add bookmark' }).click();
  await page.getByRole('button', { name: 'Reading settings' }).click();
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await page.getByRole('button', { name: 'View original PDF' }).click();
  await expect(page.getByRole('img', { name: 'Original PDF, page 3 of 6' })).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('img', { name: 'Original PDF, page 4 of 6' })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Continue reading' }).click();
  await expect(page.getByRole('img', { name: 'Original PDF, page 4 of 6' })).toBeVisible();
  await expect(page.locator('.xr-reader')).toHaveAttribute('data-theme', 'Night');
  await page.getByRole('button', { name: 'Switch to reading view' }).click();
  await expect(page.locator('.xr-top-chapter')).toHaveText('A measure of distance');
  await expect(page.getByRole('button', { name: 'Remove bookmark', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Your notebook' }).click();
  await expect(
    page.getByLabel('Your notebook', { exact: true }).filter({ hasText: 'Bookmarks' }),
  ).toContainText('A measure of distance');
  expect(errors).toEqual([]);
});

test('duplicate imports, filtering, finishing and removing keep the shelf consistent', async ({
  page,
}) => {
  const title = 'A Garden Log';
  const file = {
    name: title + '.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Chapter One\n\nThe apple tree flowered today.'),
  };
  await page.goto('/');
  const picker = page.getByLabel('Choose books');
  await picker.setInputFiles(file);
  const book = page.getByRole('button', { name: 'Open ' + title, exact: true });
  await expect(book).toBeVisible();
  await picker.setInputFiles({ ...file, name: 'another-name.txt' });
  await expect(page.getByRole('status')).toContainText('already in your library');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('missing title');
  await expect(page.getByText('No matching books')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Options for ' + title }).click();
  await page.getByRole('button', { name: 'Mark as finished' }).click();
  await page.getByRole('button', { name: /^Finished/ }).click();
  await expect(book).toBeVisible();
  await page.getByRole('button', { name: 'Options for ' + title }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  await page.getByRole('button', { name: 'Keep book' }).click();
  await expect(book).toBeVisible();
  await page.getByRole('button', { name: 'Options for ' + title }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  await page.getByRole('button', { name: 'Remove book', exact: true }).click();
  await expect(page.locator('.book-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Make this shelf yours')).toBeVisible();
});
