// 发布前检查并生成这一版的存档（site/vN/）。用法：node scripts/release.mjs
// 检查：版本号 = changelog 第一项；数据库名没被改；sw 缓存名带版本号；这一版的存档还不存在（存在就拒绝，绝不覆盖）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const html = readFileSync(join(site, 'index.html'), 'utf8');
const sw = readFileSync(join(site, 'sw.js'), 'utf8');
const changelog = JSON.parse(readFileSync(join(site, 'changelog.json'), 'utf8'));

const fail = msg => { console.error('✗ ' + msg); process.exit(1); };
const version = (html.match(/var APP_VERSION = '([^']+)'/) || [])[1];
if (!version) fail('index.html 里找不到 APP_VERSION');
if (changelog[0].v !== version) fail(`changelog.json 第一项是 ${changelog[0].v}，但 APP_VERSION 是 ${version}`);
const inline = (html.match(/var CHANGELOG = \[\s*\{ v: '([^']+)'/) || [])[1];
if (inline !== version) fail(`index.html 里的 CHANGELOG 第一项是 ${inline}，但 APP_VERSION 是 ${version}`);
if (!html.includes("var MAIN_DB = 'cuoti-data';")) fail('正式数据库名必须是 cuoti-data，不能改');
if (!sw.includes(`const CACHE = 'cuoti-${version}';`)) fail(`sw.js 的缓存名要改成 cuoti-${version}`);
const dir = join(site, version);
if (existsSync(dir)) fail(`${version}/ 已经存在：已发布的版本不能覆盖，请先升版本号`);

const archive = html
  .replace('<script>\n(function(){', `<script>window.CUOTI_MODE='archive';window.CUOTI_ARCHIVE='${version}';</script>\n<script>\n(function(){`)
  .replace('href="manifest.webmanifest"', 'href="../manifest.webmanifest"')
  .replace('href="icons/icon-192.png"', 'href="../icons/icon-192.png"')
  .replace('href="icons/apple-touch-icon.png"', 'href="../icons/apple-touch-icon.png"')
  .replace(/<a href="' \+ c\.v \+ '\/"/, `<a href="../' + c.v + '/"`);
if (!archive.includes("window.CUOTI_MODE='archive'")) fail('没能生成存档页面');
mkdirSync(dir);
writeFileSync(join(dir, 'index.html'), archive);
console.log(`✓ ${version} 检查通过，存档已生成：site/${version}/index.html`);
