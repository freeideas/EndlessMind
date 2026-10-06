// QR codes as SVG images, for realms (sign-in and claim codes) and EntryPortals (the secret phrase as a
// link). The encoder is Project Nayuki's, in qrcodegen.js.

import { qrcodegen } from "./qrcodegen.js";

const qr = qrcodegen;

/** A QR code for the text, as an SVG image with a white border. @param {string} text */
export function qrSvg(text) {
  const code = qr.QrCode.encodeText(text, qr.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = code.size + border * 2;
  let path = "";
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) if (code.getModule(x, y)) path += `M${x + border},${y + border}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
