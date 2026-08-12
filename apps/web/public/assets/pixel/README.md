# Pixel assets

These assets were created specifically for **Inforgeneses Campus**. They use the visual grammar
of 32-bit-era handheld RPGs—small tiles, limited colors, strong silhouettes, and top-down
perspective—without copying any character, map, sprite, palette, trademark, or other protected
material from an existing game.

## Files

| File | Native size | Grid | Contents |
| --- | ---: | --- | --- |
| `campus-tiles.png` | 128×80 px | 8×5 frames of 16×16 px | 26 canonical campus tiles and 14 reserved original variants |
| `avatar-base.png` | 48×96 px | 3×4 frames of 16×24 px | Body, hair, face, legs, shoes, and shadow |
| `avatar-outfit-mask.png` | 48×96 px | 3×4 frames of 16×24 px | Aligned grayscale outfit layer for runtime tinting |

Avatar rows are ordered `down`, `left`, `right`, `up`. In each row, the center frame is idle and
the outer frames form the two-step walk cycle. Base and mask have identical dimensions, frame
order, foot pivot, and transparent background.

The canonical tile-to-frame mapping lives in `apps/web/src/game/assets.ts`. Frames after index 25
are original variants reserved for later map detailing; game code must use semantic tile IDs
instead of indexing the sheet directly.

## Palette

The palette is original and intentionally compact: institutional greens, warm cream stone,
aged gold, terracotta, blue-gray technology tones, dark plum for Administration, and neutral
skin/hair colors. Transparency is preserved for props and every avatar frame.

## Rebuild

From the repository root, run:

```sh
node scripts/generate-pixel-assets.mjs
```

The generator uses only built-in Node.js APIs (`node:zlib` for compression) and writes PNG files
deterministically. It prints dimensions, alpha presence, byte size, and SHA-256 for verification.

## Authorship and usage

Artwork and generator: original work produced for Inforgeneses Campus contributors, 2026. No
third-party asset or generative image service was used.

The assets may be used and modified inside Inforgeneses Campus. This repository does not yet
grant a public license or dedicate the artwork to the public domain; the rights holders should
choose a root license before any external distribution.
