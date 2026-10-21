"""Render a 1280x720 screenshot of the StretchText UI for the app submission.

No browser is available in this container, so the panel and the article are
drawn with Pillow using the same colours and spacing as popup.html/stretch.css.
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
BG = (246, 244, 239)
INK = (28, 25, 23)
MUTED = (120, 113, 108)
BAR = (231, 226, 216)
BORDER = (214, 206, 192)
YELLOW = (250, 204, 21)
YELLOW_SOFT = (254, 240, 138)
PANEL = (255, 255, 255)

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(FONT_DIR + name, size)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# browser bar
d.rectangle([0, 0, W, 40], fill=BAR)
d.line([0, 40, W, 40], fill=BORDER)
for i, colour in enumerate([(248, 113, 113), (251, 191, 36), (74, 222, 128)]):
    d.ellipse([16 + i * 18, 15, 26 + i * 18, 25], fill=colour)
d.rounded_rectangle([96, 9, 700, 31], radius=6, fill=(255, 255, 255), outline=BORDER)
d.text((106, 13), "https://en.wikipedia.org/wiki/StretchText", font=font(13), fill=MUTED)

# tag
d.rounded_rectangle([32, 68, 330, 92], radius=12, fill=(253, 230, 138), outline=(202, 138, 4))
d.text((44, 72), "StretchText active  ·  3 phrases grown", font=font(12, True), fill=(113, 63, 18))

# title
d.text((32, 108), "StretchText", font=font(34, True), fill=INK)
d.text((32, 152), "From Wikipedia, the free encyclopedia", font=font(14), fill=MUTED)

CONTENT_W = 780
x0, y = 32, 192
line_h = 32
body = font(19)
bold = font(19)


def wrap(text, font_obj, width):
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = (current + " " + word).strip()
        if d.textlength(trial, font=font_obj) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_paragraph(segments, x, y):
    """segments: list of (text, kind) where kind is plain|phrase|detail."""
    x_cursor = x
    for text, kind in segments:
        f = bold if kind == "phrase" else body
        for word in text.split(" "):
            piece = word + " "
            w = d.textlength(piece, font=f)
            if x_cursor + w > x + CONTENT_W:
                x_cursor = x
                y += line_h
            if kind == "detail":
                d.rectangle(
                    [x_cursor - 2, y - 3, x_cursor + w - 6, y + line_h - 9],
                    fill=(253, 240, 175),
                    outline=(234, 179, 8),
                )
            elif kind == "phrase":
                tw = d.textlength(word, font=f)
                d.line(
                    [x_cursor, y + line_h - 7, x_cursor + tw, y + line_h - 7],
                    fill=INK,
                    width=1,
                )
            d.text((x_cursor, y), piece, font=f, fill=INK)
            x_cursor += w
    return y + line_h


seg1 = [
    ("Stretchtext is a hypertext feature that lets a reader ", "plain"),
    ("expand a passage", "phrase"),
    (
        " without leaving the page or following a link. Ted Nelson set out the idea as early "
        "as 1967 and named it in 1970, describing two throttles: one for navigation, one for "
        "expansion; the reader's click is the only gesture needed and the text keeps its place "
        "while it grows. ",
        "detail",
    ),
    ("and shrink it back", "phrase"),
    (" where they don't.", "plain"),
]
y = draw_paragraph(seg1, x0, y)
y += 18

seg2 = [
    (
        "Writing every level by hand was too much work, so it never caught on outside hypertext "
        "research and electronic literature. Works such as Pry, Victory Garden and The Jew's "
        "Daughter used it as a narrative device, letting a reader open a memory in place; each "
        "level had to be authored separately, which is why the technique stayed a curiosity for "
        "decades. ",
        "detail",
    ),
    ("Generated text makes the extra levels cheap", "phrase"),
    (" enough to be worth writing.", "plain"),
]
y = draw_paragraph(seg2, x0, y)

# toolbar panel
px, py, pw, ph = 880, 108, 320, 236
d.rounded_rectangle([px, py, px + pw, py + ph], radius=14, fill=PANEL, outline=(224, 217, 204))
d.text((px + 18, py + 16), "StretchText", font=font(16, True), fill=INK)
d.text(
    (px + 18, py + 42),
    "Click a phrase and it grows in place.",
    font=font(12),
    fill=MUTED,
)
d.text((px + 18, py + 60), "You pay with your own Pollen.", font=font(12), fill=MUTED)
d.rounded_rectangle(
    [px + 18, py + 86, px + pw - 18, py + 116], radius=8, fill=YELLOW, outline=(128, 128, 128)
)
d.text((px + 52, py + 94), "Stop stretching this page", font=font(12, True), fill=INK)
for i, label in enumerate(["Settings", "Disconnect"]):
    top = py + 124 + i * 34
    d.rounded_rectangle(
        [px + 18, top, px + pw - 18, top + 30], radius=8, fill=(250, 250, 249), outline=(200, 196, 190)
    )
    d.text((px + 128, top + 8), label, font=font(12), fill=INK)
d.text((px + 18, py + 200), "Click any phrase on the page.", font=font(11), fill=MUTED)

img.save("/work/src-ext/docs/screenshot.png", "PNG", optimize=True)
print("saved", img.size)
