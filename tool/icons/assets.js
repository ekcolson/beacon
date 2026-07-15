// Renders the final Battlement beacon into every asset the app needs.
// Re-run after any change to gen.js: node assets.js
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { brazier, mono, CFG } = require('./gen');

const APP = path.resolve(__dirname, '..', '..', 'app');
const cfg = CFG.battlement;

const SVG = {
  litFlat: brazier(true, cfg, 'l', { bg: 'flat' }),
  unlitFlat: brazier(false, cfg, 'u', { bg: 'flat' }),
  litAlpha: brazier(true, cfg, 'la', { bg: 'none' }),
  unlitAlpha: brazier(false, cfg, 'ua', { bg: 'none' }),
  litMaskable: brazier(true, cfg, 'mk', { bg: 'flat', inset: 0.72 }),
  notification: mono(cfg),
};

let count = 0;
function emit(svg, size, dest) {
  const abs = path.join(APP, dest);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const buf = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(abs, buf);
  count++;
}

// ---- in-app artwork (transparent; sits on the app's own surface) ----
for (const [scale, dir] of [[1, ''], [2, '2.0x/'], [3, '3.0x/']]) {
  emit(SVG.unlitAlpha, 180 * scale, `assets/beacon/${dir}beacon_unlit.png`);
  emit(SVG.litAlpha, 180 * scale, `assets/beacon/${dir}beacon_lit.png`);
}

// ---- web ----
emit(SVG.litFlat, 32, 'web/favicon.png');
emit(SVG.litFlat, 192, 'web/icons/Icon-192.png');
emit(SVG.litFlat, 512, 'web/icons/Icon-512.png');
emit(SVG.litMaskable, 192, 'web/icons/Icon-maskable-192.png');
emit(SVG.litMaskable, 512, 'web/icons/Icon-maskable-512.png');

// ---- android launcher ----
for (const [density, size] of [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
]) {
  emit(SVG.litFlat, size, `android/app/src/main/res/mipmap-${density}/ic_launcher.png`);
}

// ---- android notification (alpha-only; Android tints it) ----
for (const [density, size] of [
  ['mdpi', 24], ['hdpi', 36], ['xhdpi', 48], ['xxhdpi', 72], ['xxxhdpi', 96],
]) {
  emit(SVG.notification, size, `android/app/src/main/res/drawable-${density}/ic_stat_beacon.png`);
}

// ---- ios (opaque: the App Store rejects alpha in app icons) ----
for (const [name, size] of [
  ['Icon-App-20x20@1x', 20], ['Icon-App-20x20@2x', 40], ['Icon-App-20x20@3x', 60],
  ['Icon-App-29x29@1x', 29], ['Icon-App-29x29@2x', 58], ['Icon-App-29x29@3x', 87],
  ['Icon-App-40x40@1x', 40], ['Icon-App-40x40@2x', 80], ['Icon-App-40x40@3x', 120],
  ['Icon-App-60x60@2x', 120], ['Icon-App-60x60@3x', 180],
  ['Icon-App-76x76@1x', 76], ['Icon-App-76x76@2x', 152],
  ['Icon-App-83.5x83.5@2x', 167],
  ['Icon-App-1024x1024@1x', 1024],
]) {
  emit(SVG.litFlat, size, `ios/Runner/Assets.xcassets/AppIcon.appiconset/${name}.png`);
}

// ---- source of truth, kept in-repo next to the generated art ----
const srcDir = path.join(APP, 'assets/beacon/src');
fs.mkdirSync(srcDir, { recursive: true });
for (const [name, svg] of Object.entries(SVG)) {
  fs.writeFileSync(path.join(srcDir, `${name}.svg`), svg);
  count++;
}

console.log(`wrote ${count} files`);
