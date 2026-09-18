// 把 build/icon.svg 渲染成 build/icon.png（1024x1024），供 electron-builder 使用。
// 用法：node scripts/generate-icon.js
const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'build', 'icon.svg');
const out = path.join(__dirname, '..', 'build', 'icon.png');

(async () => {
  await sharp(src).resize(1024, 1024).png().toFile(out);
  console.log('Generated:', out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
