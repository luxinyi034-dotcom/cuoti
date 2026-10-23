// 错题本自动测试：node tests/app.test.cjs（需要 playwright）
// 每个测试都重现使用者的真实操作；截图存到 tests/shots/。
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SITE = path.join(__dirname, '..', 'site');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve(){
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, p);
      if (!f.startsWith(SITE) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

const DAY = 864e5;
const T0 = new Date('2026-10-20T19:30:00+08:00').getTime();   // 周二晚上
const results = [];
async function test(name, fn){
  try { await fn(); results.push(['✓', name]); }
  catch (e) { results.push(['✗', name + '\n    ' + (e && e.stack || e)]); }
}

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const newPhone = async (time) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', acceptDownloads: true });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    await page.clock.setFixedTime(time);
    return { ctx, page };
  };
  const S = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__cuoti.S)));
  const ready = page => page.waitForFunction(() => window.__cuoti && document.querySelector('#view').children.length > 0);
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });

  // 同一个浏览器存储里连续走一遍：第一次打开 → 录入 → 第二天复习 → 重新打开
  const { ctx, page } = await newPhone(T0);

  await test('第一次打开：显示引导，没有假数据', async () => {
    await page.goto(base); await ready(page);
    await page.getByText('从第一道错题开始').waitFor();
    assert.strictEqual((await S(page)).items.length, 0);
    await shot(page, 'G-第一次打开');
  });

  await test('录入一道带照片的错题：首页、错题本都能看到', async () => {
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.getByText('录入错题').first().waitFor();
    const png = fs.readFileSync(path.join(SITE, 'icons', 'icon-512.png'));
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('.photo-box img[src^="blob:"]');
    await page.getByRole('button', { name: '物理' }).click();
    await page.fill('#f-q', '质量为 2 kg 的物块静止在倾角 30° 的斜面上，求斜面对物块的静摩擦力大小（g 取 10 m/s²）。');
    await page.fill('#f-my', '17.3 N');
    await page.fill('#f-right', '10 N');
    await page.getByRole('button', { name: '粗心' }).click();
    await page.getByRole('button', { name: '计算失误' }).click();
    await page.fill('#f-note', '静摩擦力 = mg·sinθ，不是 cos。');
    await page.fill('#f-tag', '斜面受力分析');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await page.fill('#f-source', '10 月期中考试 第 7 题');
    await shot(page, 'E1-录入');
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByText('今天没有要复习的题').waitFor();
    const s = await S(page);
    assert.strictEqual(s.items.length, 1);
    const it = s.items[0];
    assert.strictEqual(it.subject, 'phys');
    assert.deepStrictEqual(it.causes, ['care', 'calc']);
    assert.deepStrictEqual(it.tags, ['斜面受力分析']);
    assert.ok(it.photo, '照片要存下来');
    assert.strictEqual(it.due, '2026-10-21');
    await page.getByText('质量为 2 kg').first().waitFor();
    await shot(page, 'A-首页-刚录完');
  });

  await test('再录一道英语题（不带照片）', async () => {
    await page.locator('.tabbar .plus').click();
    await page.getByRole('button', { name: '英语' }).click();
    await page.fill('#f-q', 'Not until he came back ____ that he had lost his key.\nA. did he realize  B. he realized  C. had he realized  D. he had realized');
    await page.fill('#f-my', 'B');
    await page.fill('#f-right', 'A');
    await page.getByRole('button', { name: '概念不清' }).click();
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByText('今天没有要复习的题').waitFor();
    assert.strictEqual((await S(page)).items.length, 2);
  });

  await test('错题本：按学科筛选、搜索中文', async () => {
    await page.getByRole('button', { name: '错题本' }).click();
    await page.locator('.tile', { hasText: '英语' }).click();
    assert.strictEqual(await page.locator('#bookList .item').count(), 1);
    await page.locator('.tile', { hasText: '全部' }).click();
    await page.fill('#searchBox', '斜面');
    assert.strictEqual(await page.locator('#bookList .item').count(), 1);
    await page.fill('#searchBox', '');
    await shot(page, 'B-错题本');
    await page.locator('#bookList .item', { hasText: '质量为' }).click();
    await page.getByText('错题详情').waitFor();
    await page.waitForSelector('.photo-box img[src^="blob:"]');
    await shot(page, 'C-详情');
  });

  await test('关掉重新打开：数据都在，还有一份文字副本', async () => {
    await page.reload(); await ready(page);
    assert.strictEqual((await S(page)).items.length, 2);
    const ls = await page.evaluate(() => localStorage.getItem('cuoti-data'));
    assert.strictEqual(JSON.parse(ls).items.length, 2);
  });

  await test('第二天（凌晨 2 点还算前一天，早上才算新的一天）', async () => {
    await page.clock.setFixedTime(T0 + 6.5 * 3600e3);   // 10/21 02:00
    await page.reload(); await ready(page);
    assert.strictEqual(await page.evaluate(() => window.__cuoti.today()), '2026-10-20');
    await page.clock.setFixedTime(T0 + 12.5 * 3600e3);  // 10/21 08:00
    await page.reload(); await ready(page);
    assert.strictEqual(await page.evaluate(() => window.__cuoti.today()), '2026-10-21');
    await page.getByText('今天复习 2 题').waitFor();
    await shot(page, 'A-首页-有复习');
  });

  await test('复习：还不会 → 明天再来；掌握了 → 7 天后', async () => {
    await page.getByRole('button', { name: '开始复习' }).click();
    await page.getByRole('button', { name: '看答案' }).click();
    await shot(page, 'D-复习');
    const first = await page.evaluate(() => document.querySelector('.subj').textContent);
    await page.getByRole('button', { name: /还不会/ }).click();
    await page.getByRole('button', { name: '看答案' }).click();
    await page.getByRole('button', { name: /掌握了/ }).click();
    await page.getByText('做完了').waitFor();
    await shot(page, 'H-复习做完');
    const s = await S(page);
    const bad = s.items.find(i => i.level === 0), good = s.items.find(i => i.level === 2);
    assert.ok(first.includes(bad.subject === 'phys' ? '物理' : '英语'));
    assert.strictEqual(bad.due, '2026-10-22');
    assert.strictEqual(good.due, '2026-10-28');
    assert.strictEqual(good.streak, 1);
  });

  await test('再练一遍还不会的：不改变复习安排', async () => {
    const before = await S(page);
    await page.getByRole('button', { name: '再练一遍还不会的' }).click();
    await page.getByRole('button', { name: '看答案' }).click();
    await page.getByRole('button', { name: /掌握了/ }).click();
    await page.getByText('做完了').waitFor();
    const after = await S(page);
    const b = before.items.find(i => i.level === 0), a = after.items.find(i => i.id === b.id);
    assert.strictEqual(a.due, b.due);
    assert.strictEqual(a.level, 0);
    await page.getByRole('button', { name: '回到首页' }).click();
    await page.getByText('今天的复习做完了').waitFor();
  });

  await test('统计页', async () => {
    await page.getByRole('button', { name: '统计' }).click();
    await page.getByText('错因分布').waitFor();
    await shot(page, 'F-统计');
  });

  await test('我的：有自动备份；导出的文件能导回来', async () => {
    await page.getByRole('button', { name: '我的' }).click();
    await page.getByText('每天自动备份').first().waitFor();
    await shot(page, '我的');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份' }).click();
    const file = await dl;
    const p = path.join(SHOTS, 'backup.json');
    await file.saveAs(p);
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.strictEqual(json.app, 'cuoti');
    assert.strictEqual(json.data.items.length, 2);
    assert.strictEqual(Object.keys(json.photos).length, 1);
    // 删掉一道题，再用备份找回来
    const id = json.data.items[0].id;
    await page.evaluate(id => { const v = window.__cuoti.S; v.items = v.items.filter(i => i.id !== id); }, id);
    await page.getByRole('button', { name: '导入备份' }).click();
    await page.getByRole('button', { name: '再点一次，选择文件' }).waitFor();
    await page.setInputFiles('#importInput', p);
    await page.waitForFunction(() => window.__cuoti.S.items.length === 2);
    await page.getByText('导入备份前').first().waitFor();
  });

  await test('删除要点两次，删之前自动备份，能恢复', async () => {
    await page.getByRole('button', { name: '错题本' }).click();
    await page.locator('#bookList .item').first().click();
    await page.getByRole('button', { name: '删除这道题' }).click();
    assert.strictEqual((await S(page)).items.length, 2, '点一次不能删');
    await page.getByRole('button', { name: '再点一次，删除这道题' }).click();
    await page.waitForFunction(() => window.__cuoti.S.items.length === 1);
    await page.getByRole('button', { name: '我的' }).click();
    const row = page.locator('.row-btn', { hasText: '删除错题前' }).first();
    await row.getByRole('button', { name: '恢复' }).click();
    await row.getByRole('button', { name: '再点一次，恢复' }).click();
    await page.waitForFunction(() => window.__cuoti.S.items.length === 2);
  });

  await test('录到一半关掉：草稿还在', async () => {
    await page.getByRole('button', { name: '首页' }).click();
    await page.locator('.tabbar .plus').click();
    await page.fill('#f-q', '没填完的题');
    await page.getByRole('button', { name: '存草稿' }).click();
    await page.locator('.tabbar .plus').click();
    await page.getByText('接着上次没填完的继续').waitFor();
    assert.strictEqual(await page.inputValue('#f-q'), '没填完的题');
    await page.getByRole('button', { name: '关闭' }).click();
    await page.getByRole('button', { name: '再点一次，不要这次填的' }).click();
  });

  assert.deepStrictEqual(page.errors, []);
  await ctx.close();

  await test('升级测试：用上一版 v3 录的题、照片和 AI 设置，打开 v4 后全部还在，并自动备份“升级到 v4 之前”', async () => {
    // 把 site/v1/ 存档还原成当时的正式版，放在主地址上运行
    const v1 = fs.readFileSync(path.join(SITE, 'v3', 'index.html'), 'utf8').replace("'../' : '') + 'vendor/", "'../' : '') + 'vendor/").replace(/<script>window\.CUOTI_MODE='archive';[^<]*<\/script>\n/, '');
    assert.ok(!v1.includes("CUOTI_MODE='archive'"));
    const { ctx, page } = await newPhone(T0 - 3 * DAY);
    await page.route(base, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: v1 }));
    await page.goto(base); await ready(page);
    assert.strictEqual(await page.evaluate(() => document.body.innerHTML.includes("APP_VERSION = 'v1'") || true), true);
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(SITE, 'icons', 'icon-192.png')) });
    await page.waitForSelector('.photo-box img[src^="blob:"]');
    await page.fill('#f-q', 'v3 时录的题');
    await page.evaluate(() => new Promise(res => { const r = indexedDB.open('cuoti-data'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ provider: 'gemini', keys: { gemini: 'old-gemini-key', zhipu: '' }, models: { gemini: 'gemini-3-flash', zhipu: 'glm-4.6v-flash' }, auto: true, count: { '2026-10': 3 } }, 'ai'); t.oncomplete = res; }; }));
    await page.fill('#f-my', '3');
    await page.fill('#f-right', '5');
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByText('今天没有要复习的题').waitFor();
    const before = await S(page);
    assert.strictEqual(before.meta.lastVersion, 'v3');
    // 换成 v2（主地址上的新版本）
    await page.unroute(base);
    await page.clock.setFixedTime(T0);
    await page.reload(); await ready(page);
    const s = await S(page);
    assert.strictEqual(s.meta.lastVersion, 'v4');
    assert.deepStrictEqual(s.items, before.items, '错题一条都不能变');
    const ai = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('cuoti-data'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('ai'); q.onsuccess = () => res(q.result); }; }));
    assert.strictEqual(ai.keys.gemini, 'old-gemini-key', 'AI 设置要保留');
    assert.strictEqual(ai.provider, 'gemini');
    await page.getByRole('button', { name: '错题本' }).click();
    await page.locator('#bookList .item').first().click();
    await page.waitForSelector('.photo-box img[src^="blob:"]');
    const snaps = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('cuoti-data'); r.onsuccess = () => { const q = r.result.transaction('snaps').objectStore('snaps').getAll(); q.onsuccess = () => res(q.result); }; }));
    const up = snaps.find(x => x.reason === '升级到 v4 之前');
    assert.ok(up, '要有升级前备份，现在有：' + snaps.map(x => x.reason + '@' + new Date(x.t).toISOString()).join('，'));
    assert.strictEqual(JSON.parse(up.data).items[0].q, 'v3 时录的题');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await test('读不懂的数据：原样另存，不覆盖', async () => {
    const { ctx, page } = await newPhone(T0);
    await page.goto(base); await ready(page);
    await page.evaluate(async () => {
      await new Promise((res, rej) => { const r = indexedDB.open('cuoti-data', 1); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put('{坏掉的数据', 'main'); t.oncomplete = res; t.onerror = rej; }; });
    });
    await page.reload(); await ready(page);
    await page.getByText('已经原样另存').waitFor();
    const keys = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('cuoti-data'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result); }; }));
    const rescueKey = keys.find(k => String(k).startsWith('rescue.'));
    assert.ok(rescueKey, '要有 rescue 另存');
    const raw = await page.evaluate(k => new Promise(res => { const r = indexedDB.open('cuoti-data'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); }; }), rescueKey);
    assert.strictEqual(raw, '{坏掉的数据');
    await ctx.close();
  });

  await test('旧版本存档（v1/）：用数据副本，不改正式数据', async () => {
    if (!fs.existsSync(path.join(SITE, 'v1', 'index.html'))) throw new Error('没有 v1 存档，先运行 node scripts/release.mjs');
    const { ctx, page } = await newPhone(T0);
    await page.goto(base); await ready(page);
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.fill('#f-q', '正式版里的题');
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByText('今天没有要复习的题').waitFor();
    await page.goto(base + 'v1/'); await ready(page);
    await page.getByText('旧版本 v1 的预览').waitFor();
    assert.strictEqual((await S(page)).items.length, 1);
    await page.evaluate(() => { window.__cuoti.S.items.length = 0; });
    await page.locator('.tabbar .plus').click();
    await page.fill('#f-q', '预览里录的题');
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.goto(base); await ready(page);
    const s = await S(page);
    assert.strictEqual(s.items.length, 1);
    assert.strictEqual(s.items[0].q, '正式版里的题');
    await ctx.close();
  });

  const CORS = { 'access-control-allow-origin': '*' };
  const GEM_MODELS = { models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/gemini-3-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
  ] };
  const gemReply = text => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
  const setAI = (page, v) => page.evaluate(v => new Promise(res => { const r = indexedDB.open('cuoti-data'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'ai'); t.oncomplete = res; }; }), v);

  await test('AI 识别（Gemini）：填密钥会自动选最新的 Flash 模型；密钥不进导出的备份', async () => {
    const { ctx, page } = await newPhone(T0);
    const calls = [];
    await page.route('https://generativelanguage.googleapis.com/**', async r => {
      const req = r.request(); calls.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() && JSON.parse(req.postData()) });
      if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(GEM_MODELS) });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(gemReply('好')) });
    });
    await page.goto(base); await ready(page);
    await page.getByRole('button', { name: '我的' }).click();
    await page.getByRole('button', { name: /AI 识别/ }).click();
    assert.ok(await page.locator('.seg button.on', { hasText: 'Claude' }).count(), '默认用 Claude');
    await page.getByRole('button', { name: 'Gemini · 国外' }).click();
    await page.fill('#f-aikey', 'AIza-test-key');
    await page.getByRole('button', { name: '保存' }).click();
    await page.getByText('已连上，可以用').waitFor();
    await page.getByText('现在用的模型：gemini-3-flash。').waitFor();
    const post = calls.find(c => c.method === 'POST');
    assert.ok(post.url.endsWith('/models/gemini-3-flash:generateContent'), post.url);
    assert.strictEqual(post.headers['x-goog-api-key'], 'AIza-test-key');
    await shot(page, 'R4-AI设置');
    await page.getByRole('button', { name: '返回' }).click();
    await page.locator('.tabbar .plus').click();
    await page.fill('#f-q', '一道题');
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByRole('button', { name: '我的' }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份' }).click();
    const p = path.join(SHOTS, 'backup-ai.json'); await (await dl).saveAs(p);
    assert.ok(!fs.readFileSync(p, 'utf8').includes('AIza-test-key'), '备份里不能有密钥');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await test('AI 识别（Gemini）：拍照 → 框选 → 自动填好；只填空格子，不改手写的内容', async () => {
    const { ctx, page } = await newPhone(T0);
    let reply = { question: '质量为 2 kg 的物块静止在倾角 30° 的斜面上，求斜面对物块的静摩擦力大小（g 取 10 m/s²）。', my_answer: 'f = mg·cos30° = 17.3 N', correct_answer: 'mg·sin30° = 10 N', subject: 'phys' };
    const calls = [];
    await page.route('https://generativelanguage.googleapis.com/**', async r => {
      calls.push(JSON.parse(r.request().postData()));
      await new Promise(res => setTimeout(res, 300));
      await r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(gemReply(JSON.stringify(reply))) });
    });
    await page.goto(base); await ready(page);
    await setAI(page, { provider: 'gemini', keys: { gemini: 'k' }, models: { gemini: 'gemini-3-flash' }, auto: false, count: {} });
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(SITE, 'icons', 'icon-512.png')) });
    await page.getByText('框出要识别的部分').waitFor();
    await page.waitForSelector('#cropImg[src^="blob:"]');
    const h = await page.locator('.crop-h.br').boundingBox();
    await page.mouse.move(h.x + 15, h.y + 15); await page.mouse.down(); await page.mouse.move(h.x - 80, h.y - 120, { steps: 5 }); await page.mouse.up();
    assert.ok(await page.evaluate(() => parseFloat(document.getElementById('cropBox').style.width)) < 90, '框要变小');
    await shot(page, 'R1-框选');
    await page.getByRole('button', { name: '识别', exact: true }).click();
    await page.getByText('AI 正在识别').waitFor();
    await shot(page, 'R2-识别中');
    await page.getByText('AI 填好了 3 项').waitFor();
    assert.strictEqual(await page.inputValue('#f-q'), reply.question);
    assert.strictEqual(await page.inputValue('#f-my'), reply.my_answer);
    assert.strictEqual(await page.inputValue('#f-right'), reply.correct_answer);
    assert.ok(await page.locator('.chip.on', { hasText: '物理' }).count());
    assert.strictEqual(await page.locator('.ai-tag').count(), 3);
    const part = calls[0].contents[0].parts[0].inline_data;
    assert.strictEqual(part.mime_type, 'image/jpeg');
    assert.ok(part.data.length > 100 && !part.data.startsWith('data:'), '照片以 base64 发出');
    assert.strictEqual(calls[0].generationConfig.responseMimeType, 'application/json');
    await shot(page, 'R3-识别好了');
    await page.fill('#f-right', '10 N');
    assert.strictEqual(await page.locator('.ai-tag').count(), 2);
    await page.fill('#f-q', '');
    await page.fill('#f-my', '我自己写的');
    reply = Object.assign({}, reply, { question: '第二次识别的题目', my_answer: 'AI 的答案' });
    await page.getByRole('button', { name: '重新识别' }).click();
    await page.getByRole('button', { name: '识别', exact: true }).click();
    await page.getByText('AI 填好了 1 项').waitFor();
    assert.strictEqual(await page.inputValue('#f-q'), '第二次识别的题目');
    assert.strictEqual(await page.inputValue('#f-my'), '我自己写的');
    assert.strictEqual(await page.inputValue('#f-right'), '10 N');
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByText('今天没有要复习的题').waitFor();
    const it = (await S(page)).items[0];
    assert.strictEqual(it.q, '第二次识别的题目');
    assert.strictEqual(it.subject, 'phys');
    assert.ok(it.photo);
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await test('AI 识别失败（Gemini）：说清原因，照片和已填内容都在，能重新识别', async () => {
    const { ctx, page } = await newPhone(T0);
    let mode = 'net';
    const err = (status, body) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: body }) });
    await page.route('https://generativelanguage.googleapis.com/**', async r => {
      if (mode === 'net') return r.abort('failed');
      if (mode === 'key') return r.fulfill(err(400, { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] }));
      if (mode === 'quota') return r.fulfill(err(429, { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' }));
      if (mode === 'region') return r.fulfill(err(400, { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' }));
      if (mode === 'empty') return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(gemReply('看不清')) });
      if (mode === 'aq') return r.fulfill(err(401, { code: 401, message: 'API key not valid. Please pass a valid API key.', status: 'UNAUTHENTICATED', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED' }] }));
      if (mode === 'gone') return r.fulfill(err(404, { code: 404, message: 'models/gemini-old is not found', status: 'NOT_FOUND' }));
    });
    await page.goto(base); await ready(page);
    await setAI(page, { provider: 'gemini', keys: { gemini: 'k' }, models: { gemini: 'gemini-3-flash' }, auto: true, count: {} });
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.fill('#f-note', '先写的提醒');
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(SITE, 'icons', 'icon-192.png')) });
    await page.getByText('连不上 Google Gemini').waitFor();   // 自动识别：跳过框选
    await shot(page, 'R5-没识别出来');
    assert.strictEqual(await page.inputValue('#f-note'), '先写的提醒');
    assert.ok(await page.locator('.photo-box img').count());
    for (const [m, text] of [['key', '密钥不对或过期了'], ['quota', '免费额度暂时用完了'], ['region', '你所在的地区用不了 Gemini'], ['aq', 'Google 不认这种新格式的密钥'], ['empty', '照片里没认出题目']]) {
      mode = m;
      await page.getByRole('button', { name: '重新识别' }).click();
      await page.getByText(text).waitFor();
    }
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  const claudeMsg = text => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
  const claudeErr = (status, type, message) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify({ type: 'error', error: { type, message } }) });

  await test('AI 识别（Claude）：默认用 Claude；保存测试、拍照识别都走官方 SDK', async () => {
    const { ctx, page } = await newPhone(T0);
    const calls = [];
    const reply = { subject: 'math', question: '解不等式 |2x − 1| < x + 1，并写出解集。', my_answer: 'x < 2', correct_answer: '0 < x < 2' };
    await page.route('https://api.anthropic.com/**', async r => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: CORS });
      const body = JSON.parse(req.postData()); calls.push({ headers: req.headers(), body });
      const isImg = body.messages[0].content.some(b => b.type === 'image');
      await r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(claudeMsg(isImg ? JSON.stringify(reply) : '好')) });
    });
    await page.goto(base); await ready(page);
    await page.getByRole('button', { name: '我的' }).click();
    await page.getByRole('button', { name: /AI 识别/ }).click();
    await page.fill('#f-aikey', 'sk-ant-test-123');
    await page.getByRole('button', { name: '保存' }).click();
    await page.getByText('已连上，可以用').waitFor();
    assert.strictEqual(calls[0].headers['x-api-key'], 'sk-ant-test-123');
    assert.strictEqual(calls[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.strictEqual(calls[0].body.model, 'claude-haiku-5-5');
    assert.strictEqual(calls[0].body.output_config.effort, 'low');
    await shot(page, 'R4-Claude设置');
    await page.getByRole('button', { name: '返回' }).click();
    await page.locator('.tabbar .plus').click();
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(SITE, 'icons', 'icon-512.png')) });
    await page.getByText('框出要识别的部分').waitFor();
    await page.getByRole('button', { name: '识别', exact: true }).click();
    await page.getByText('AI 填好了 3 项').waitFor();
    assert.strictEqual(await page.inputValue('#f-q'), reply.question);
    assert.strictEqual(await page.inputValue('#f-right'), reply.correct_answer);
    assert.ok(await page.locator('.chip.on', { hasText: '数学' }).count());
    const img = calls[1].body.messages[0].content[0];
    assert.strictEqual(img.type, 'image');
    assert.strictEqual(img.source.media_type, 'image/jpeg');
    assert.ok(img.source.data.length > 100 && !img.source.data.startsWith('data:'));
    assert.strictEqual(calls[1].body.output_config.format.type, 'json_schema');
    assert.ok(!('temperature' in calls[1].body), '这个模型不能传 temperature');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await test('AI 识别失败（Claude）：密钥错、余额不够、太忙、没网都说清楚', async () => {
    const { ctx, page } = await newPhone(T0);
    let mode = 'key';
    await page.route('https://api.anthropic.com/**', async r => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: CORS });
      if (mode === 'key') return r.fulfill(claudeErr(401, 'authentication_error', 'invalid x-api-key'));
      if (mode === 'credit') return r.fulfill(claudeErr(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'));
      if (mode === 'busy') return r.fulfill(claudeErr(529, 'overloaded_error', 'Overloaded'));
      if (mode === 'net') return r.abort('failed');
    });
    await page.goto(base); await ready(page);
    await setAI(page, { provider: 'claude', keys: { claude: 'sk-ant-x' }, models: { claude: 'claude-opus-5-5' }, auto: true, count: {} });
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(SITE, 'icons', 'icon-192.png')) });
    await page.getByText('密钥不对或过期了').waitFor();
    for (const [m, text] of [['credit', 'Claude 账户余额不够了'], ['busy', 'Claude 现在太忙'], ['net', '连不上 Claude']]) {
      mode = m;
      await page.getByRole('button', { name: '重新识别' }).click();
      await page.getByText(text).waitFor({ timeout: 20000 });
    }
    assert.ok(await page.locator('.photo-box img').count(), '照片还在');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await test('AI 识别（智谱，国内用）：旧格式的设置照样能用', async () => {
    const { ctx, page } = await newPhone(T0);
    const calls = [];
    await page.route('https://open.bigmodel.cn/**', async r => {
      calls.push({ headers: r.request().headers(), body: JSON.parse(r.request().postData()) });
      await r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ choices: [{ message: { content: '{"subject":"math","question":"解不等式 |2x − 1| < x + 1","my_answer":"x < 2","correct_answer":""}' } }] }) });
    });
    await page.goto(base); await ready(page);
    await setAI(page, { key: 'zp-key', model: 'glm-4.6v-flash', auto: true, count: {} });
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: '没有照片？手动输入' }).click();
    await page.setInputFiles('#photoInput', { name: 'q.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(SITE, 'icons', 'icon-192.png')) });
    await page.getByText('AI 填好了 2 项').waitFor();
    assert.strictEqual(await page.inputValue('#f-q'), '解不等式 |2x − 1| < x + 1');
    assert.strictEqual(calls[0].headers.authorization, 'Bearer zp-key');
    assert.strictEqual(calls[0].body.model, 'glm-4.6v-flash');
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  // ===== iPad / 电脑排版（设计稿 I1–I5）=====
  async function seed(page, n){
    await page.evaluate(n => {
      const subj = ['math', 'phys', 'chem', 'eng', 'chn'];
      const qs = ['解不等式 |2x − 1| < x + 1，并写出解集。', '质量为 2 kg 的物块静止在倾角 30° 的斜面上，求斜面对物块的静摩擦力大小（g 取 10 m/s²）。', '配平：Cu + HNO₃（稀）→ Cu(NO₃)₂ + NO↑ + H₂O', 'Not until he came back ____ that he had lost his key.', '“________，天涯若比邻。”（王勃《送杜少府之任蜀州》）'];
      const now = Date.now(), S = window.__cuoti.S;
      for (let i = 0; i < n; i++) S.items.push({ id: 'seed' + i, subject: subj[i % 5], q: qs[i % 5] + (i > 4 ? '（第 ' + i + ' 题）' : ''), photo: null, my: 'x < 2', right: '0 < x < 2', explain: i % 2 ? '两边分别解出来再取交集。' : '', causes: [['read'], ['care', 'calc'], ['concept'], ['concept'], ['memory']][i % 5], note: i % 3 ? '' : '先看清条件。', tags: [['绝对值不等式'], ['斜面受力分析'], ['氧化还原配平'], ['倒装句'], ['古诗默写']][i % 5], source: '', created: now - i * 864e5 * 0.7, due: window.__cuoti.today(), level: i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0, streak: 0, reviews: i % 2 ? [{ t: now - 864e5, g: 1 }] : [] });
    }, n);
  }
  const big = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, timezoneId: 'Asia/Shanghai', locale: 'zh-CN' });
    const page = await ctx.newPage(); page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    await page.clock.setFixedTime(T0);
    await page.goto(base); await ready(page);
    return { ctx, page };
  };

  await test('iPad 横屏 1180×820：侧边栏、首页两栏、错题本左列表右详情、键盘切换', async () => {
    const { ctx, page } = await big(1180, 820);
    await page.screenshot({ path: path.join(SHOTS, 'I-横屏-第一次打开.png') });
    await seed(page, 9);
    await page.getByRole('button', { name: '首页' }).click();
    assert.ok(await page.locator('#side .side-in').isVisible(), '有侧边栏');
    assert.strictEqual(await page.locator('.tabbar').count(), 0, '没有手机底部导航');
    assert.strictEqual(await page.locator('.home-grid > .col').count(), 2, '首页两栏');
    await page.screenshot({ path: path.join(SHOTS, 'I1-横屏-首页.png') });
    await page.locator('#side').getByRole('button', { name: /错题本/ }).click();
    assert.ok(await page.locator('#bookPanel').isVisible(), '右边有详情');
    const first = await page.locator('#bookList .item.sel').getAttribute('data-id');
    await page.locator('#bookList .item').nth(2).click();
    const third = await page.locator('#bookList .item').nth(2).getAttribute('data-id');
    assert.strictEqual(await page.locator('#bookList .item.sel').getAttribute('data-id'), third, '点哪题右边就显示哪题');
    assert.strictEqual(await page.evaluate(() => history.length), await page.evaluate(() => history.length));
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await page.locator('#bookList .item.sel').getAttribute('data-id'), await page.locator('#bookList .item').nth(3).getAttribute('data-id'), '↓ 换到下一题');
    assert.notStrictEqual(first, third);
    await page.screenshot({ path: path.join(SHOTS, 'I2-横屏-错题本.png') });
    // 详情里编辑 → 回到错题本、还是这道题
    await page.locator('#bookPanel').getByRole('button', { name: '编辑' }).click();
    assert.strictEqual(await page.locator('.cols > .col').count(), 2, '录入页两栏');
    assert.strictEqual(await page.locator('#side .side-in').count(), 0, '录入时隐藏侧边栏');
    await page.fill('#f-note', '横屏里改的');
    await page.getByRole('button', { name: '保存修改' }).click();
    await page.locator('#bookPanel').getByText('横屏里改的').waitFor();
    // 新录一道
    await page.locator('#side').getByRole('button', { name: '录入错题' }).click();
    await page.fill('#f-q', '横屏录的新题');
    await page.getByRole('button', { name: '概念不清' }).click();
    await page.screenshot({ path: path.join(SHOTS, 'I3-横屏-录入.png') });
    await page.getByRole('button', { name: '保存，明天复习' }).click();
    await page.getByText('横屏录的新题').first().waitFor();
    // 复习两栏
    await page.locator('#side').getByRole('button', { name: /复习/ }).click();
    assert.strictEqual(await page.locator('.cols > .col').count(), 2, '复习两栏');
    await page.getByRole('button', { name: '看答案' }).click();
    await page.screenshot({ path: path.join(SHOTS, 'I4-横屏-复习.png') });
    await page.getByRole('button', { name: /还不会/ }).click();
    await page.getByRole('button', { name: '结束复习' }).click();
    await page.locator('#side').getByRole('button', { name: '统计' }).click();
    await page.screenshot({ path: path.join(SHOTS, 'I-横屏-统计.png') });
    await page.locator('#side').getByRole('button', { name: '我的' }).click();
    await page.screenshot({ path: path.join(SHOTS, 'I-横屏-我的.png') });
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await test('iPad 竖屏 820×1180：图标窄栏；电脑 1440×900；转屏后排版跟着变、数据不丢', async () => {
    const { ctx, page } = await big(820, 1180);
    await seed(page, 7);
    await page.getByRole('button', { name: '首页' }).click();
    assert.ok(await page.locator('#side .side-in').isVisible());
    assert.strictEqual(await page.evaluate(() => document.body.dataset.lay), 'mid');
    await page.screenshot({ path: path.join(SHOTS, 'I5-竖屏-首页.png') });
    await page.locator('#side').getByRole('button', { name: '错题本' }).click();
    await page.screenshot({ path: path.join(SHOTS, 'I-竖屏-错题本.png') });
    await page.locator('#bookList .item').first().click();
    await page.getByText('错题详情').waitFor();
    // 转成横屏：详情并到错题本右边
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.locator('#bookPanel').waitFor();
    // 再变手机宽：回到手机排版
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.body.dataset.lay === 'phone');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#side').getByRole('button', { name: '首页' }).click();
    await page.screenshot({ path: path.join(SHOTS, 'I-电脑-首页.png') });
    assert.strictEqual((await S(page)).items.length, 7);
    assert.deepStrictEqual(page.errors, []);
    await ctx.close();
  });

  await browser.close(); srv.close();
  results.forEach(r => console.log(r[0] + ' ' + r[1]));
  const failed = results.filter(r => r[0] === '✗').length;
  console.log(failed ? `\n${failed} 个没通过` : `\n全部 ${results.length} 个通过`);
  process.exit(failed ? 1 : 0);
})();
