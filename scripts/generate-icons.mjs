import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("../client/public/icon.svg", import.meta.url),
);
const output = (name) =>
  fileURLToPath(new URL("../client/public/" + name, import.meta.url));
await Promise.all(
  [192, 512].map((size) =>
    sharp(source, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(output(`icon-${size}.png`)),
  ),
);
await sharp(source, { density: 384 })
  .resize(180, 180)
  .png()
  .toFile(output("apple-touch-icon.png"));
// Keep the complete symbol in the maskable icon's central safe zone.
const safeSymbol = await sharp(source, { density: 384 })
  .resize(360, 360)
  .png()
  .toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#174a3c" },
})
  .composite([{ input: safeSymbol, gravity: "centre" }])
  .png()
  .toFile(output("icon-maskable-512.png"));
const socialSymbol = await sharp(source, { density: 384 })
  .resize(360, 360)
  .png()
  .toBuffer();
await sharp({
  create: { width: 1200, height: 630, channels: 4, background: "#174a3c" },
})
  .composite([{ input: socialSymbol, gravity: "centre" }])
  .png()
  .toFile(output("social-preview.png"));
