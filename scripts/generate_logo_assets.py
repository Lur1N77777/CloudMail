from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = PROJECT_ROOT / "assets" / "images"
SOURCE_LOGO = PROJECT_ROOT / "assets" / "source" / "logo.png"


def fit_square(image: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fitted = image.copy()
    fitted.thumbnail((size, size), Image.Resampling.LANCZOS)
    left = (size - fitted.width) // 2
    top = (size - fitted.height) // 2
    canvas.paste(fitted, (left, top), fitted)
    return canvas


def remove_soft_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if r > 232 and g > 228 and b > 220:
                alpha = max(0, int((255 - max(r, g, b)) * 4.2))
                pixels[x, y] = (r, g, b, alpha)

    bbox = rgba.getbbox()
    return rgba.crop(bbox) if bbox else rgba


def make_android_background(size: int, source: Image.Image) -> Image.Image:
    corner = source.resize((32, 32), Image.Resampling.LANCZOS)
    samples = [
        corner.getpixel((0, 0)),
        corner.getpixel((31, 0)),
        corner.getpixel((0, 31)),
        corner.getpixel((31, 31)),
    ]
    avg = tuple(sum(pixel[i] for pixel in samples) // len(samples) for i in range(3))
    bg = Image.new("RGBA", (size, size), (*avg, 255))
    draw = ImageDraw.Draw(bg)
    draw.rounded_rectangle(
        (8, 8, size - 8, size - 8),
        radius=int(size * 0.22),
        outline=(170, 198, 240, 255),
        width=max(2, size // 128),
    )
    return bg


def make_android_foreground(size: int, source: Image.Image) -> Image.Image:
    transparent_logo = remove_soft_background(source)
    framed = fit_square(transparent_logo, int(size * 0.82))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    left = (size - framed.width) // 2
    top = (size - framed.height) // 2
    canvas.paste(framed, (left, top), framed)
    return canvas


def make_monochrome(source: Image.Image, size: int) -> Image.Image:
    alpha = remove_soft_background(source).convert("RGBA").getchannel("A")
    alpha_square = fit_square(
        Image.merge("RGBA", [alpha, alpha, alpha, alpha]),
        int(size * 0.82),
    ).getchannel("A")
    mono = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    left = (size - alpha_square.width) // 2
    top = (size - alpha_square.height) // 2
    mono.paste((255, 255, 255, 255), (left, top), alpha_square)
    return mono


def save_all():
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE_LOGO).convert("RGBA")

    icon = source.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGB")
    icon.save(ASSET_DIR / "icon.png")
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(ASSET_DIR / "favicon.png")

    splash = source.resize((1024, 1024), Image.Resampling.LANCZOS)
    splash.save(ASSET_DIR / "splash-icon.png")

    background = make_android_background(512, source)
    background.save(ASSET_DIR / "android-icon-background.png")

    foreground = make_android_foreground(1024, source)
    foreground.save(ASSET_DIR / "android-icon-foreground.png")

    mono = make_monochrome(source, 432)
    mono.save(ASSET_DIR / "android-icon-monochrome.png")


if __name__ == "__main__":
    save_all()
    print(f"Generated logo assets from {SOURCE_LOGO}")

