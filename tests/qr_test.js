// The EntryPortal draws its setup code with one library and reads pictures of it with another; they
// must agree, including for the longest setup link.

import assert from "node:assert/strict";
import { qrcodegen } from "../shared/qrcodegen.js";
import { jsQR } from "../shared/jsqr.js";

/** Draw a QR code as RGBA pixels, `scale` pixels per module, with a white border. @param {string} text */
function pixels(text, scale = 4) {
  const code = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  const size = (code.size + 8) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dark = code.getModule(Math.floor(x / scale) - 4, Math.floor(y / scale) - 4);
      if (dark) data.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
  }
  return { data, size };
}

Deno.test("a setup code drawn by the encoder is read back by the reader", () => {
  const words = Array(24).fill("abandon").join("+");
  const link = `https://portal.endlessmind.com/#words=${words}&name=Whimsical+Wandering+Voyager+Dumpling`;
  const { data, size } = pixels(link);
  assert.equal(jsQR(data, size, size)?.data, link);
});
