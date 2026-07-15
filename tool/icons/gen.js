// Generates lit/unlit beacon icons. Direction: Brazier, crenellated, flat grounds.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// Flat grounds -- no gradients.
const BG_LIT = '#2A1710';
const BG_UNLIT = '#171C22';

const STONE = {
  lit: { face: '#4A382E', lip: '#B08668', seam: '#1E1512', wood: '#2A1F19' },
  // Warm timber against cool stone: grey wood in a grey basket is invisible.
  unlit: { face: '#5C6675', lip: '#98A4B5', seam: '#2A313B', wood: '#7A6249' },
};

// ---------------------------------------------------------------- fire
function tongue(cx, baseY, h, hw, lean) {
  const tipX = cx + lean;
  const tipY = baseY - h;
  return [
    `M ${cx - hw} ${baseY}`,
    `C ${cx - hw} ${baseY - h * 0.5} ${tipX - hw * 0.62} ${baseY - h * 0.72} ${tipX} ${tipY}`,
    `C ${tipX + hw * 0.62} ${baseY - h * 0.72} ${cx + hw} ${baseY - h * 0.5} ${cx + hw} ${baseY}`,
    'Z',
  ].join(' ');
}

// Heights and leans are deliberately uneven -- an even cluster reads as a crown.
function fire(id, cx, baseY, s) {
  const t = (dx, h, hw, lean, layer) =>
    `<path d="${tongue(cx + dx * s, baseY, h * s, hw * s, lean * s)}" fill="url(#${id}-${layer})"/>`;
  return [
    t(-54, 78, 25, -26, 'outer'),
    t(46, 92, 27, 24, 'outer'),
    t(-20, 152, 38, -14, 'outer'),
    t(22, 178, 43, 10, 'outer'),
    t(-32, 96, 19, -14, 'mid'),
    t(28, 116, 21, 12, 'mid'),
    t(-2, 148, 30, 3, 'mid'),
    t(-12, 66, 12, -5, 'core'),
    t(14, 82, 13, 6, 'core'),
    t(0, 102, 17, 0, 'core'),
  ].join('');
}

function fireDefs(id) {
  return `
  <linearGradient id="${id}-outer" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="#C22B0C"/>
    <stop offset="55%" stop-color="#E5401A"/>
    <stop offset="100%" stop-color="#F0631E" stop-opacity="0.85"/>
  </linearGradient>
  <linearGradient id="${id}-mid" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="#FF9A16"/>
    <stop offset="60%" stop-color="#FFB32B"/>
    <stop offset="100%" stop-color="#FF8A1F" stop-opacity="0.9"/>
  </linearGradient>
  <linearGradient id="${id}-core" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="#FFFDF2"/>
    <stop offset="55%" stop-color="#FFE9A3"/>
    <stop offset="100%" stop-color="#FFD24A" stop-opacity="0.75"/>
  </linearGradient>`;
}

// ---------------------------------------------------------------- stonework
const PLINTH = [
  // [yTop, h, leftTop, rightTop, leftBot, rightBot]
  [412, 66, 142, 370, 116, 396],
  [346, 66, 164, 348, 142, 370],
];
const BAND = { x0: 156, x1: 356, yBot: 346 };

function plinth(c) {
  let out = '';
  for (let i = PLINTH.length - 1; i >= 0; i--) {
    const [yTop, h, lT, rT, lB, rB] = PLINTH[i];
    out += `<path d="M ${lT} ${yTop} L ${rT} ${yTop} L ${rB} ${yTop + h} L ${lB} ${yTop + h} Z" fill="${c.face}"/>`;
    out += `<rect x="${lT}" y="${yTop}" width="${rT - lT}" height="11" fill="${c.lip}"/>`;
    out += `<rect x="${lB}" y="${yTop + h - 6}" width="${rB - lB}" height="6" fill="${c.seam}"/>`;
  }
  return out;
}

// The parapet: a coping band with merlons rising from it. Drawn in front of the
// fire so the flames read as contained by the beacon rather than sitting on it.
// gapRatio is crenel width as a fraction of merlon width.
function parapet(c, { n, merlonH, gapRatio, bandH }) {
  const { x0, x1, yBot } = BAND;
  const yTop = yBot - bandH;
  const W = x1 - x0;
  const m = W / (n + (n - 1) * gapRatio);
  const g = m * gapRatio;
  let out = `<path d="M ${x0} ${yTop} L ${x1} ${yTop} L ${x1 - 6} ${yBot} L ${x0 + 6} ${yBot} Z" fill="${c.face}"/>`;
  out += `<rect x="${x0}" y="${yTop}" width="${W}" height="9" fill="${c.lip}"/>`;
  for (let i = 0; i < n; i++) {
    const mx = x0 + i * (m + g);
    const my = yTop - merlonH;
    out += `<rect x="${mx.toFixed(1)}" y="${my}" width="${m.toFixed(1)}" height="${merlonH + 4}" fill="${c.face}"/>`;
    out += `<rect x="${mx.toFixed(1)}" y="${my}" width="${m.toFixed(1)}" height="8" fill="${c.lip}"/>`;
  }
  return out;
}

// Unlit stone alone reads as a castle turret. The kindling waiting in the basket
// is what makes it a beacon: unlit means "ready to light", not "a tower".
// A teepee, not a starburst: sticks that share one origin read as an asterisk,
// so these cross at four different heights with tips at uneven angles.
function kindling(c, bandTop) {
  const y0 = bandTop + 12;
  const top = bandTop - 112;
  const stick = (x1, y1, x2, y2, w) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${c.wood}" stroke-width="${w}" stroke-linecap="round"/>`;
  // Tips sit close to centre and bases spread wide, so the sticks cross high and
  // the silhouette is a teepee. Crossing at mid-height instead reads as an X.
  return [
    stick(186, y0, 272, top + 10, 15),
    stick(326, y0, 240, top, 15),
    stick(222, y0, 288, top + 48, 12),
    stick(294, y0, 230, top + 56, 12),
  ].join('');
}

const wrap = (inner, defs) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>${defs}</defs>
  ${inner}
</svg>`;

// bg 'flat' for launcher icons (iOS forbids alpha); 'none' for in-app artwork,
// which has to sit on whatever surface the app theme provides.
// inset < 1 shrinks the art into the maskable safe zone.
function brazier(lit, cfg, id, { bg = 'flat', inset = 1 } = {}) {
  const c = lit ? STONE.lit : STONE.unlit;
  const bandTop = BAND.yBot - cfg.bandH;
  const art = `
  ${plinth(c)}
  ${kindling(c, bandTop)}
  ${lit ? fire(id, 256, 322, 1.25) : ''}
  ${parapet(c, cfg)}`;
  const k = inset;
  const body =
    k === 1 ? art : `<g transform="translate(${(1 - k) * 256} ${(1 - k) * 256}) scale(${k})">${art}</g>`;
  const ground = bg === 'flat' ? `<rect width="512" height="512" fill="${lit ? BG_LIT : BG_UNLIT}"/>` : '';
  return wrap(`${ground}${body}`, fireDefs(id));
}

// Alpha-only silhouette for Android notifications: colour is stripped, so the
// shape has to survive on its own.
// Android strips colour, so white stone against white fire is one blob. The only
// thing that can carry the crenellations here is negative space: mask a gap out
// of the fire around the parapet, and leave real gaps between the courses.
// Kindling is dropped -- in pure white it only muddies the shape.
function mono(cfg) {
  const white = { face: '#fff', lip: '#fff', seam: '#fff', wood: '#fff' };
  const black = { face: '#000', lip: '#000', seam: '#000', wood: '#000' };
  const flat = ['outer', 'mid', 'core']
    .map((l) => `<linearGradient id="m-${l}"><stop stop-color="#fff"/></linearGradient>`)
    .join('');
  const defs = `${flat}
  <mask id="m-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
    <rect width="512" height="512" fill="#fff"/>
    <g stroke="#000" stroke-width="17" stroke-linejoin="round">${parapet(black, cfg)}</g>
  </mask>`;
  const courses = PLINTH.map(
    ([yTop, h, lT, rT, lB, rB]) =>
      `<path d="M ${lT} ${yTop + 4} L ${rT} ${yTop + 4} L ${rB} ${yTop + h - 5} L ${lB} ${yTop + h - 5} Z" fill="#fff"/>`
  ).join('');
  return wrap(
    `${courses}
     <g mask="url(#m-cut)">${fire('m', 256, 322, 1.25)}</g>
     ${parapet(white, cfg)}`,
    defs
  );
}

const CFG = {
  battlement: { n: 5, merlonH: 34, gapRatio: 0.7, bandH: 44 },
  basket: { n: 4, merlonH: 52, gapRatio: 0.62, bandH: 40 },
};

module.exports = { brazier, mono, CFG };

if (require.main === module) {
  const variants = {};
  for (const [name, cfg] of Object.entries(CFG)) {
    variants[`bz-${name}-lit`] = brazier(true, cfg, `b${name}`);
    variants[`bz-${name}-unlit`] = brazier(false, cfg, `b${name}`);
    variants[`mono-${name}`] = mono(cfg);
  }
  for (const [name, svg] of Object.entries(variants)) {
    fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
  }
  console.log('wrote', Object.keys(variants).length, 'svgs');
}
