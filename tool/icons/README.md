# Beacon icon generator

Draws the beacon — a crenellated stone brazier, dark or alight — and renders it
into every size the app needs.

```bash
npm install
npm run build    # writes the whole icon set into app/
npm run preview  # writes SVGs to out/ without touching app/
```

`npm run build` overwrites, in `app/`:

| Output | What it is |
| --- | --- |
| `assets/beacon/{,2.0x/,3.0x/}beacon_{lit,unlit}.png` | In-app artwork, transparent |
| `assets/beacon/src/*.svg` | Vector source of each variant |
| `web/favicon.png`, `web/icons/*` | Web icons, including maskable |
| `android/.../mipmap-*/ic_launcher.png` | Android launcher |
| `android/.../drawable-*/ic_stat_beacon.png` | Android notification, alpha-only |
| `ios/.../AppIcon.appiconset/*.png` | iOS app icon |

`gen.js` is the drawing; `assets.js` is the size/format matrix. To restyle the
beacon, edit `gen.js` and re-run — don't hand-edit the PNGs or the SVGs under
`assets/beacon/src`, both are generated.

## Things that are load-bearing

- **The lit and unlit pair share a silhouette.** Unlit is not "the icon minus
  fire": it's kindling waiting in the basket. Bare stone reads as a chess rook,
  and the kindling is the only thing that makes it a beacon instead of a turret.
- **`notification` is alpha-only.** Android throws away colour and keeps the
  alpha channel, so white fire on white stone would flatten into one blob. The
  gap around the parapet is masked *out of the flame* to hold the shape, and the
  kindling is dropped because at 24px it's just noise. Don't give this variant a
  background.
- **iOS icons must be opaque** — the App Store rejects alpha — which is why the
  launcher variants paint a flat ground and the in-app ones don't.
- **Maskable icons are inset to 72%.** Android crops them to a circle; art at
  full bleed loses its parapet.
- **The fire is discrete tongues, not one path**, so it can animate on light-up.
- **Crenellations dissolve below ~32px.** They're a large-size flourish; the
  flame is what carries the shape in a notification tray.
