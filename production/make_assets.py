from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import math

ROOT = Path(__file__).resolve().parent.parent
OVER = ROOT / "production" / "overlays"
OVER.mkdir(parents=True, exist_ok=True)
SUB = ROOT / "submission"
SUB.mkdir(parents=True, exist_ok=True)

W, H = 1920, 1080
BG = (5, 9, 13)
PANEL = (8, 15, 21)
TEAL = (53, 224, 193)
TEAL_SOFT = (53, 224, 193)
TEXT = (244, 248, 249)
MUTED = (137, 157, 168)
DIM = (90, 108, 118)
ORANGE = (245, 184, 75)
RED = (255, 111, 111)

F_SB = "C:/Windows/Fonts/seguisb.ttf"
F_R = "C:/Windows/Fonts/segoeui.ttf"
F_B = "C:/Windows/Fonts/segoeuib.ttf"
F_M = "C:/Windows/Fonts/consola.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def vertical_gradient(top, bottom, size=(W, H)):
    img = Image.new("RGB", (1, size[1]))
    px = img.load()
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        px[0, y] = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
    return img.resize(size, Image.Resampling.BICUBIC)


def glow(size, center, radius, color, strength):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color + (strength,))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.45))


def grid(size, step=80, color=(255, 255, 255, 8)):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(0, size[0], step):
        d.line((x, 0, x, size[1]), fill=color, width=1)
    for y in range(0, size[1], step):
        d.line((0, y, size[0], y), fill=color, width=1)
    return layer


def spaced(draw, xy, text, fnt, fill, spacing=2):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x


def logo(draw, x, y, s, color=TEAL):
    r = s * 0.2
    draw.rounded_rectangle((x, y, x + s, y + s), radius=r, outline=color, width=max(2, int(s * 0.035)))
    c = s * 0.5
    draw.line((x + s * 0.24, y + c, x + s * 0.76, y + c), fill=color, width=max(2, int(s * 0.035)))
    draw.line((x + c, y + s * 0.24, x + c, y + s * 0.76), fill=color, width=max(2, int(s * 0.035)))
    draw.ellipse((x + s * 0.38, y + s * 0.38, x + s * 0.62, y + s * 0.62), outline=color, width=max(1, int(s * 0.025)))


def rounded_panel(img, box, radius, fill, outline=None, width=1):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_intro():
    bg = vertical_gradient((3, 7, 11), (7, 18, 24)).convert("RGBA")
    bg = Image.alpha_composite(bg, grid((W, H), 80))
    bg = Image.alpha_composite(bg, glow((W, H), (240, 540), 520, TEAL, 30))
    bg = Image.alpha_composite(bg, glow((W, H), (1540, 180), 420, (45, 130, 200), 22))
    d = ImageDraw.Draw(bg)
    # fine framing rule
    d.line((120, 120, 1800, 120), fill=(255, 255, 255, 15), width=1)
    d.line((120, 960, 1800, 960), fill=(255, 255, 255, 15), width=1)
    logo(d, 120, 178, 78)
    d.text((220, 182), "PACT", font=font(F_SB, 92), fill=TEXT)
    spaced(d, (224, 286), "SOVEREIGN RUNTIME", font(F_M, 19), TEAL, 5)
    # left accent
    d.rectangle((120, 430, 126, 706), fill=TEAL)
    d.text((168, 426), "Authority before", font=font(F_SB, 106), fill=TEXT)
    d.text((168, 536), "execution.", font=font(F_SB, 106), fill=TEXT)
    d.text((172, 690), "A cryptographic control plane for autonomous AI spending.", font=font(F_R, 31), fill=MUTED)
    # small proof points
    pts = [("SIGNED MANDATES", 172), ("ATOMIC BUDGETS", 492), ("VERIFIABLE DECISIONS", 786)]
    for label, x in pts:
        d.rounded_rectangle((x, 790, x + 24, 814), radius=6, outline=TEAL, width=1)
        d.line((x + 6, 802, x + 12, 808), fill=TEAL, width=2)
        d.line((x + 12, 808, x + 19, 798), fill=TEAL, width=2)
        spaced(d, (x + 38, 793), label, font(F_M, 15), MUTED, 2)
    spaced(d, (120, 1008), "HACKATHON DEMONSTRATION  /  NOVEMBER 2026  /  ACTUAL APPLICATION FOOTAGE", font(F_M, 16), DIM, 2)
    bg.convert("RGB").save(OVER / "intro.png", quality=95)
    print("intro", OVER / "intro.png")


def make_outro():
    base = Image.open(ROOT / "production" / "check2" / "c_168.8.png").convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    base = ImageEnhance.Brightness(base).enhance(0.42).filter(ImageFilter.GaussianBlur(1.1)).convert("RGBA")
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(W):
        a = int(215 * (1 - min(1, x / 1350)))
        sd.line((x, 0, x, H), fill=(3, 7, 10, a))
    base = Image.alpha_composite(base, shade)
    base = Image.alpha_composite(base, grid((W, H), 96, (255, 255, 255, 7)))
    d = ImageDraw.Draw(base)
    d.line((120, 120, 1800, 120), fill=(255, 255, 255, 15), width=1)
    logo(d, 120, 184, 76)
    d.text((216, 188), "PACT", font=font(F_SB, 88), fill=TEXT)
    spaced(d, (222, 286), "SOVEREIGN RUNTIME", font(F_M, 18), TEAL, 5)
    d.rectangle((120, 416, 126, 656), fill=TEAL)
    d.text((168, 410), "Bounded authority.", font=font(F_SB, 80), fill=TEXT)
    d.text((168, 500), "Auditable spending.", font=font(F_SB, 80), fill=TEXT)
    d.text((172, 640), "AI proposes. PACT verifies. The owner authorizes. PayPal processes.", font=font(F_R, 30), fill=MUTED)
    # workflow chips
    chips = [("AI PROPOSES", 172), ("PACT VERIFIES", 402), ("OWNER AUTHORIZES", 632), ("PAYPAL PROCESSES", 918)]
    for label, x in chips:
        w = int(d.textlength(label, font=font(F_M, 15))) + 34
        d.rounded_rectangle((x, 760, x + w, 804), radius=10, fill=(7, 14, 19, 225), outline=(53, 224, 193, 105), width=1)
        d.text((x + 17, 772), label, font=font(F_M, 15), fill=TEAL if label != "PAYPAL PROCESSES" else MUTED)
    d.text((120, 974), "Demo recorded from the running application. No PayPal approval, order, capture, or settlement was executed.", font=font(F_R, 20), fill=DIM)
    base.convert("RGB").save(OVER / "outro.png", quality=95)
    print("outro", OVER / "outro.png")


LOWERS = [
    ("03", "CONTROL PLANE", "Live exposure, budget state, and persisted decisions", 33.928),
    ("04", "SIGNED MANDATE", "Scope, expiry, merchant allowlist, and hard limits", 44.972),
    ("05", "AGENT IDENTITY", "Signed proposals bound to one Ed25519 key", 61.488),
    ("06", "AUTHORIZED PURCHASE", "Deterministic policy checks and atomic reservation", 74.188),
    ("07", "AUTHORIZATION TRACE", "Proposal, budget hold, and all 17 checks", 92.792),
    ("08", "SECURITY BOUNDARIES", "Eight adversarial scenarios, recorded outcomes", 103.068),
    ("09", "BLOCKED SPEND", "$40 request denied by remaining budget", 116.680),
    ("10", "DELEGATION CONTAINMENT", "Child authority cannot exceed the parent", 129.260),
    ("11", "AUDIT EVIDENCE", "Hash-chained application records, recomputed", 141.024),
    ("12", "PAYPAL STATUS", "Authorization is not payment", 153.652),
]


def make_lower(num, title, subtitle, idx):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x, y, w, h = 64, 902, 872, 122
    d.rounded_rectangle((x, y, x + w, y + h), radius=14, fill=(5, 11, 16, 250), outline=(255, 255, 255, 28), width=1)
    d.rectangle((x, y + 12, x + 4, y + h - 12), fill=TEAL)
    d.text((x + 30, y + 18), f"SECTION {num}", font=font(F_M, 17), fill=TEAL)
    d.text((x + 130, y + 18), "/", font=font(F_M, 17), fill=DIM)
    spaced(d, (x + 152, y + 18), "PACT DEMO", font(F_M, 15), MUTED, 2)
    d.text((x + 30, y + 43), title, font=font(F_SB, 31), fill=TEXT)
    d.text((x + 30, y + 84), subtitle, font=font(F_R, 17), fill=MUTED)
    p = OVER / f"lower_{idx:02d}.png"
    im.save(p)
    print("lower", p)


def make_thumbnail():
    base = Image.open(ROOT / "production" / "check2" / "c_104.3.png").convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    base = ImageEnhance.Brightness(base).enhance(0.56).filter(ImageFilter.GaussianBlur(0.4)).convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for x in range(W):
        a = int(242 * max(0, 1 - x / 1500))
        od.line((x, 0, x, H), fill=(2, 7, 10, a))
    base = Image.alpha_composite(base, overlay)
    d = ImageDraw.Draw(base)
    # top mark
    logo(d, 100, 92, 60, TEAL)
    d.text((174, 96), "PACT", font=font(F_SB, 64), fill=TEXT)
    spaced(d, (180, 168), "SOVEREIGN RUNTIME", font(F_M, 14), TEAL, 4)
    d.line((100, 252, 760, 252), fill=(53, 224, 193, 150), width=2)
    d.text((100, 300), "AUTHORITY", font=font(F_SB, 112), fill=TEXT)
    d.text((100, 408), "BEFORE", font=font(F_SB, 112), fill=TEXT)
    d.text((100, 516), "EXECUTION.", font=font(F_SB, 112), fill=TEAL)
    d.text((104, 668), "Cryptographic authorization for autonomous AI spending.", font=font(F_R, 31), fill=(214, 225, 230))
    d.text((104, 714), "Signed mandates. Atomic budgets. Verifiable decisions.", font=font(F_R, 24), fill=MUTED)
    # badges
    badges = [("LIVE APP WALKTHROUGH", TEAL, 104), ("8/8 BOUNDARIES HELD", TEAL, 398), ("PAYPAL: NOT CONFIGURED", ORANGE, 706)]
    for label, col, x in badges:
        w = int(d.textlength(label, font=font(F_M, 17))) + 38
        d.rounded_rectangle((x, 838, x + w, 886), radius=11, fill=(4, 10, 14, 235), outline=col + (130,) if len(col) == 3 else col, width=1)
        d.text((x + 19, 852), label, font=font(F_M, 17), fill=col)
    d.text((104, 988), "HACKATHON DEMO  /  2026  /  ACTUAL APPLICATION FOOTAGE", font=font(F_M, 16), fill=(118, 136, 146))
    out = SUB / "PACT_Demo_Thumbnail.png"
    base.convert("RGB").save(out, quality=96)
    print("thumb", out)


if __name__ == "__main__":
    make_intro()
    make_outro()
    for i, (num, title, sub, _) in enumerate(LOWERS, 1):
        make_lower(num, title, sub, i)
    make_thumbnail()
    print("LOWERS", len(LOWERS))
