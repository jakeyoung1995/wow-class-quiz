// drive_quiz.js - steps file for the cargo drive.js helper in INTREPID-2.
// Answers every question of a Forever quiz and checks the results screen
// renders, which is the cheapest proof that forever-data.js still parses.
//   PICK=2,1,3,0,... node ../../../.claude/skills/cargo/scripts/drive.js \
//     http://127.0.0.1:8901/wow-forever-class-quiz.html scripts/drive_quiz.js
// env: PICK = comma list of option indexes per question (default 0),
//      SHOT = optional path for a results screenshot.
module.exports = async ({ page, click, count, check, sleep, shoot, log }) => {
  const picks = (process.env.PICK || '').split(',').filter(Boolean).map(Number);
  await click('.btn-start');
  await sleep(400);
  check('quiz visible', await page.isVisible('#quiz'), true);
  let i = 0;
  while (await page.isVisible('#quiz') && i < 40) {
    const opts = await page.$$('#qContent .opt');
    check('q' + (i + 1) + ' has at most 4 answers', opts.length <= 4, true);
    const idx = picks[i] !== undefined ? Math.min(picks[i], opts.length - 1) : 0;
    await opts[idx].click();
    await sleep(120);
    await click('#nextBtn');
    await sleep(250);
    i++;
  }
  log('answered ' + i + ' questions');
  check('results visible', await page.isVisible('#results'), true);
  check('3 result cards', await count('.result-card'), 3);
  const name = await page.textContent('.result-card.rank-1 .card-name');
  log('top result: ' + name.trim().split('\n')[0]);
  await sleep(500);
  if (process.env.SHOT) await shoot(process.env.SHOT);
};
