"""QR codes as SVG images, the same as shared/qr.js.

The encoder is Project Nayuki's QR Code generator for Python (the `qrcodegen` package), the same
library and version as shared/qrcodegen.js, so the same text gives the same picture, byte for byte.
"""

from __future__ import annotations

from qrcodegen import QrCode


def qr_svg(text: str) -> str:
    """A QR code for the text, as an SVG image with a white border."""
    code = QrCode.encode_text(text, QrCode.Ecc.MEDIUM)
    border = 4
    n = code.get_size()
    size = n + border * 2
    path = "".join(
        f"M{x + border},{y + border}h1v1h-1z" for y in range(n) for x in range(n) if code.get_module(x, y)
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges">'
        f'<rect width="{size}" height="{size}" fill="#fff"/><path d="{path}" fill="#000"/></svg>'
    )
