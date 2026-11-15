import { test, expect, type Page } from '@playwright/test';

const BOTS = ['stockfish', 'trapsky', 'crystal', 'worstfish', 'shannon', 'monte', 'meridian', 'dice'];

async function clickSq(page: Page, sq: string, orientation: 'white' | 'black' = 'white') {
  const b = (await page.getByTestId('board').boundingBox())!;
  const s = b.width / 8, f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
  const x = b.x + (orientation === 'white' ? f : 7 - f) * s + s / 2;
  const y = b.y + (orientation === 'white' ? 7 - r : r) * s + s / 2;
  await page.mouse.click(x, y);
}
const moveButtons = (page: Page) => page.getByTestId('moves').locator('button');
async function load(page: Page, text: string) {
  await page.getByLabel('Game settings').click();
  await page.getByLabel('FEN or PGN').fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

test('human vs Stockfish: move, reply, live judge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('judge-eval')).toHaveText(/^[+-]\d/);
  await clickSq(page, 'e2');
  await clickSq(page, 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(moveButtons(page).first()).toHaveText(/^e4\W*$/); // a live rating glyph may follow
  await expect(page.getByTestId('status')).toHaveText(/White to move/);
  // Take back removes both plies.
  await page.getByLabel('Take back').click();
  await expect(moveButtons(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const id of BOTS) {
  test(`${id} plays legal moves as White`, async ({ page }) => {
    await page.goto(`/?white=${id}&black=human`);
    await expect(moveButtons(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('status')).not.toHaveClass(/err/);
    await expect(page.getByTestId('status')).toHaveText(/Black to move/);
  });
}

test('Maia downloads its network and plays a human move', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?white=maia&black=human');
  await expect(page.getByTestId('thinking-white')).toBeVisible();
  await expect(moveButtons(page)).toHaveCount(1, { timeout: 280_000 });
  await expect(page.getByTestId('status')).not.toHaveClass(/err/);
  // HUD shows its policy as percentages.
  await page.getByTestId('hud-white').click();
  await expect(page.getByTestId('eye')).toContainText('%');
  await expect(page.getByTestId('hud-heat')).toBeVisible();
  // As White, Maia's top choice must be a normal human opening move.
  await page.getByTestId('tab-moves').click();
  await expect(moveButtons(page).first()).toHaveText(/^(e4|d4|c4|Nf3|g3|b3|e3|Nc3)\W*$/);

  // As Black (mirrored encoding), it should answer 1.e4 like a human would.
  await page.goto('/?white=human&black=maia');
  await clickSq(page, 'e2');
  await clickSq(page, 'e4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 60_000 });
  await expect(moveButtons(page).nth(1)).toHaveText(/^(e5|c5|e6|c6|d5|d6|Nf6|Nc6|g6)\W*$/);
});

test('HUD: Stockfish lines, Crystal graph, Monte heatmap', async ({ page }) => {
  await page.goto('/?white=human&black=stockfish');
  await page.getByTestId('hud-black').click();
  await clickSq(page, 'e2');
  await clickSq(page, 'e4');
  await expect(page.getByTestId('eye')).toContainText('Depth', { timeout: 15_000 }); // HUD on opens Bot view
  await expect(page.getByTestId('arrow-pick').first()).toBeVisible();
  await page.getByTestId('tab-moves').click();
  await expect(moveButtons(page)).toHaveCount(2);

  await page.goto('/?white=human&black=crystal');
  await page.getByTestId('hud-black').click();
  await expect(page.getByTestId('hud-graph')).toBeVisible(); // live, before Crystal even moves
  expect(await page.getByTestId('hud-graph').locator('path').count()).toBeGreaterThan(10);

  await page.goto('/?white=monte&black=human');
  await page.getByTestId('hud-white').click();
  await expect(page.getByTestId('eye')).toContainText('Simulations', { timeout: 30_000 });
  await expect(page.getByTestId('hud-heat')).toBeVisible();
});

test('bot vs bot runs, pace and pause work', async ({ page }) => {
  await page.goto('/?white=dice&black=shannon');
  await expect.poll(() => moveButtons(page).count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('status')).toHaveText('Paused.', { timeout: 10_000 });
  const n = await moveButtons(page).count();
  await page.waitForTimeout(2500);
  expect(await moveButtons(page).count()).toBe(n);
});

test('PGN load, checkmate verdict, review classifies every move', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?white=human&black=human');
  await load(page, '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  await expect(page.getByTestId('verdict')).toContainText('1-0');
  await expect(page.getByTestId('verdict')).toContainText('Checkmate');
  await expect(page.getByTestId('judge-eval')).toHaveText('#');
  await expect(page.getByTestId('evalbar')).toHaveAttribute('data-wp', '100');
  await page.getByTestId('verdict').getByRole('button', { name: 'Review game' }).click();
  await expect(page.getByTestId('acc-white')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('eval-graph')).toBeVisible();
  // 3...Nf6?? allows mate: must be a blunder or worse.
  await expect(page.getByTestId('review')).toContainText('Blunder');
  // The coach opens on move 1 and explains each move; step to 3...Nf6.
  await expect(page.getByTestId('coach-insight')).toContainText('e4');
  for (let i = 0; i < 5; i++) await page.getByTestId('coach').getByLabel('Next move').click();
  await expect(page.getByTestId('coach-insight')).toContainText('Blunder');
  await expect(page.getByTestId('coach-insight')).toContainText(/Nf6 is a blunder: it allows Qxf7#?, and White mates in 1/);
  await page.getByTestId('eval-graph').click({ position: { x: 5, y: 40 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('review-badge')).toBeVisible();
  // Copy PGN round-trips the moves.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByLabel('Copy PGN').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('4. Qxf7#');
});

test('promotion picker under-promotes', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await load(page, '8/P6k/8/8/8/8/8/K7 w - - 0 1');
  await clickSq(page, 'a7');
  await clickSq(page, 'a8');
  await page.getByLabel('Promote to knight').click();
  await expect(moveButtons(page).first()).toHaveText(/^a8=N/);
});

test('judge announces mate in one', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await load(page, '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  await expect(page.getByTestId('judge-eval')).toHaveText('M1');
  await expect(page.getByTestId('judge')).toContainText('White has mate in 1');
});

test('seat sheet: switch bot and tune settings', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await page.getByLabel('Settings for black').click();
  await page.getByTestId('pick-shannon').click();
  await page.getByLabel('Max depth').fill('3');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('seat-black')).toContainText('Shannon');
  await expect(page.getByTestId('seat-black')).toContainText('Max depth 3 ply');
  await clickSq(page, 'd2');
  await clickSq(page, 'd4');
  await expect(moveButtons(page)).toHaveCount(2, { timeout: 15_000 });
});

test('bots page lists the roster and links into the arena', async ({ page }) => {
  await page.goto('/bots');
  await expect(page.locator('article.bot')).toHaveCount(9);
  await page.getByRole('link', { name: 'Play Boris Trapsky' }).click();
  await expect(page.getByTestId('seat-black')).toContainText('Boris Trapsky');
});

test('human playing Black gets the board flipped automatically', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await page.getByLabel('Settings for white').click();
  await page.getByTestId('pick-dice').click();
  await page.keyboard.press('Escape');
  // Black is now the only human: ranks rail reads 1..8 top to bottom.
  await expect(page.locator('.rail.ranks span').first()).toHaveText('1');
});

test('Stockfish full strength disables the Elo slider', async ({ page }) => {
  await page.goto('/?white=human&black=stockfish');
  await page.getByLabel('Settings for black').click();
  await expect(page.getByLabel('Elo')).toBeEnabled();
  await page.getByRole('switch', { name: 'Full strength' }).click();
  await expect(page.getByLabel('Elo')).toBeDisabled();
});

test('evaluation panel shows White / Draw / Black odds from the engine', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await expect(page.getByTestId('wdl')).toContainText(/White \d+%\s*Draw \d+%\s*Black \d+%/);
  await expect(page.getByTestId('judge')).toContainText(/depth \d+/);
  await expect(page.getByTestId('judge')).toContainText(/equal|better|winning/);
  // Draw share should be the largest at the start position.
  const [w, d] = (await page.getByTestId('wdl').locator('.labels span').allTextContents()).map((t) => +t.replace(/\D/g, ''));
  expect(d).toBeGreaterThan(w);
});

test('captures, material lead and check indicator', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await load(page, '1. e4 d5 2. exd5 Nf6 3. Bb5+');
  await expect(page.getByTestId('caps-white').locator('piece')).toHaveCount(1);
  await expect(page.getByTestId('caps-white')).toContainText('+1');
  await expect(page.getByTestId('check-black')).toBeVisible();
  await expect(page.getByTestId('status')).not.toContainText('Check');
  await expect(page.getByTestId('counter')).toContainText('5 / 5');
});

test('game settings: piece set and judge off persist; judge off hides the evaluation', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await expect(page.getByTestId('judge')).toBeVisible();
  await page.getByLabel('Game settings').click();
  await page.getByTestId('set-kiwen-suwi').click();
  await page.getByTestId('board-sage').click();
  await page.getByRole('switch', { name: 'Win / draw / loss' }).click();
  await page.getByRole('switch', { name: 'Judge' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('judge')).toHaveCount(0);
  await expect(page.getByTestId('evalbar')).toHaveCount(0);
  await expect(page.locator('.arena')).toHaveCSS('--sq-dark', '#8ea488');
  await page.reload();
  await expect(page.getByTestId('judge')).toHaveCount(0);
  // Chessground re-creates piece nodes on resize, so poll rather than hold a handle.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('cg-board piece.knight.white')!).backgroundImage))
    .toContain('/pieces/kiwen-suwi/wN.svg');
  await page.evaluate(() => localStorage.clear());
});

test('judge rates moves live and explains them', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await load(page, '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6');
  await expect(page.getByTestId('insight')).toContainText('Blunder', { timeout: 30_000 });
  await expect(page.getByTestId('insight')).toContainText('White mates in 1');
  await expect(page.getByTestId('moves').locator('.glyph')).toHaveCount(6);
  await expect(page.getByTestId('review-badge')).toBeVisible();
});

test('HUD legends: a sample board that explains each mark on hover', async ({ page }) => {
  await page.goto('/?white=human&black=crystal');
  await page.getByTestId('hud-black').click();
  const legend = page.getByTestId('legend');
  await legend.getByTestId('lm-node').hover();
  await expect(legend.locator('figcaption')).toContainText('PageRank');
  await legend.getByTestId('lm-attack').click();
  await expect(legend.locator('figcaption')).toContainText('attacking');
  await page.getByTestId('legend-black').click();
  await page.getByTestId('legend-pop-black').getByTestId('lm-judge').hover();
  await expect(page.getByTestId('legend-pop-black').locator('figcaption')).toContainText("judge's best move");
  await page.mouse.click(5, 5);
  await expect(page.getByTestId('legend-pop-black')).toHaveCount(0);
  await page.goto('/bots');
  await expect(page.locator('article.bot .legend-board')).toHaveCount(9);
});

test('bots wait while a settings sheet is open', async ({ page }) => {
  await page.goto('/?white=human&black=human');
  await page.getByLabel('Settings for white').click();
  await page.getByTestId('pick-dice').click();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('thinking-white')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(moveButtons(page)).toHaveCount(1, { timeout: 15_000 });
});

test('Meridian shows a live territory map', async ({ page }) => {
  await page.goto('/?white=human&black=meridian');
  await page.getByTestId('hud-black').click();
  await expect(page.getByTestId('hud-field')).toBeVisible();
  await expect(page.getByTestId('eye')).toContainText(/White \d+, Black \d+/);
  await page.getByTestId('legend').getByTestId('lm-field-black').hover();
  await expect(page.getByTestId('legend').locator('figcaption')).toContainText("Black's territory");
});
