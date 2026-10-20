// 生成可以发成 Artifact 的预览页（示例数据，用单独的存储，不碰正式数据）。
// 用法：node scripts/build-preview.mjs <输出文件>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'preview.html');
const html = readFileSync(join(root, 'site', 'index.html'), 'utf8');
const head = html.split('<head>')[1].split('</head>')[0]
  .replace(/<meta charset[^>]*>\n?/, '')
  .replace(/<meta name="viewport"[^>]*>\n?/, '')
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?/g, '')
  .replace('<title>错题本</title>', '<title>错题本预览</title>');
const body = html.split(/<body>/)[1].split('</body>')[0]
  .replace('<script>\n(function(){', "<script>window.CUOTI_MODE='demo';</script>\n<script>\n(function(){");
writeFileSync(out, head + body);
console.log('✓ 预览页：' + out);
