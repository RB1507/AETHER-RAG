"""Generate the AETHER RAG Windows app icon (build/icon.ico).

Draws the app's logo mark — three stacked isometric layers (the `BrandMark`
component: a knowledge base / embeddings stack) in white on a brand-indigo
rounded tile, matching the in-app logo (bg-brand-primary + white mark).

Run with any Python that has Pillow:
    python frontend/build/make_icon.py
Produces a multi-resolution .ico used by electron-builder (win.icon).
"""

import os
from PIL import Image, ImageDraw

SIZE = 256
SS = 4                              # supersample factor for crisp small sizes
W = SIZE * SS
S = W / 96.0                        # map the 96-unit logo space to pixels
BG = (79, 70, 229, 255)            # indigo-600 (#4F46E5) — matches --brand-primary
OUT = os.path.join(os.path.dirname(__file__), "icon.ico")
# 512px PNG source that electron-builder converts to mac (.icns) and linux icons.
OUT_PNG = os.path.join(os.path.dirname(__file__), "icon.png")

# Three stacked diamonds in 96-space (identical to BrandMark.tsx), bottom→top.
LAYERS = [
    ([(48, 52), (76, 66), (48, 80), (20, 66)], 115),   # opacity ~0.45
    ([(48, 34), (76, 48), (48, 62), (20, 48)], 184),   # opacity ~0.72
    ([(48, 16), (76, 30), (48, 44), (20, 30)], 255),   # opacity 1.0
]


def make() -> None:
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        [6 * S, 6 * S, 90 * S, 90 * S], radius=int(22 * S), fill=BG
    )

    # Composite each layer separately so overlaps alpha-blend like the SVG.
    for pts, alpha in LAYERS:
        layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(
            [(x * S, y * S) for x, y in pts], fill=(255, 255, 255, alpha)
        )
        img.alpha_composite(layer)

    base = img.resize((SIZE, SIZE), Image.LANCZOS)
    base.save(OUT, format="ICO",
              sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("wrote", OUT)

    # 512px PNG for cross-platform icon generation (mac .icns / linux png).
    img.resize((512, 512), Image.LANCZOS).save(OUT_PNG, format="PNG")
    print("wrote", OUT_PNG)


if __name__ == "__main__":
    make()
