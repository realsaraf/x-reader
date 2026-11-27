"""Rebuild the bundled original book with Python, ReportLab and Pillow.

Run from the repository root: python examples/make_atlas.py
"""
from io import BytesIO
from math import exp, sin
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / "public" / "books" / "the-quiet-atlas.pdf"
BOOK.parent.mkdir(parents=True, exist_ok=True)
W, H = 360, 520
INK, MOSS, GOLD, PAPER = "#203e35", "#759481", "#e6ba83", "#fbf6e9"
book = Canvas(str(BOOK), pagesize=(W, H), pageCompression=1, invariant=True)
book.setTitle("The Quiet Atlas")
book.setAuthor("x-reader editions")
book.setSubject("Field notes from an imaginary coast")


def fill(color):
    book.setFillColor(HexColor(color))


def label(x, y, text, color, size=7, spacing=1.5):
    book.saveState()
    line = book.beginText(x, y)
    line.setFillColor(HexColor(color))
    line.setFont("Helvetica-Bold", size)
    line.setCharSpace(spacing)
    line.textLine(text)
    book.drawText(line)
    book.restoreState()


def headland(width=1160, height=620):
    """Two-ink relief print. Each line follows the profile of the headland."""
    from PIL import ImageDraw
    image = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(image)
    scale = width / 580
    def pt(x, y):
        return (round(x * scale), round(y * scale))
    draw.ellipse([pt(367, 8), pt(464, 105)], fill=GOLD)
    for ridge in range(10):
        points = []
        for x in range(-2, 583, 2):
            t = x / 580
            y = (112 + ridge * 18 + 22 * sin(t * 5.4 + ridge * .54)
                 - 67 * exp(-((t - (.04 + ridge * .037)) / .23) ** 2)
                 + 8 * sin(t * 16 + ridge * .27) + 3 * sin(t * 33))
            points.append((x, y))
        draw.polygon([pt(*p) for p in points] + [pt(583, 315), pt(-2, 315)], fill=INK)
        for stroke in range(5):
            line = [pt(x, y + stroke * 2.6 + 1.2 * sin(x / 29 + stroke)) for x, y in points]
            draw.line(line, fill=("#d0d8b1" if stroke == 0 else "#89a68a"), width=max(1, round(scale * .64)))
    data = BytesIO()
    image.save(data, "PNG")
    return ImageReader(data)


plate = headland()
book.bookmarkPage("cover")
book.addOutlineEntry("Cover", "cover")
fill(INK)
book.rect(0, 0, W, H, fill=1, stroke=0)
book.setStrokeColor(HexColor("#9bad89"))
book.rect(14, 14, W - 28, H - 28)
book.drawImage(plate, 17, 61, width=W - 34, height=184)
label(31, 475, "X-READER  /  FIELD EDITIONS", "#cfd8bd", 7)
fill(PAPER)
book.setFont("Times-Roman", 62)
book.drawString(29, 376, "The Quiet")
book.drawString(29, 313, "Atlas")
label(32, 276, "FIELD NOTES FROM THE COAST", GOLD, 6.4)
book.setStrokeColor(HexColor(MOSS))
book.line(31, 52, 329, 52)
label(32, 34, "AN ILLUSTRATED NOTEBOOK", "#cfd8bd", 5)
label(297, 34, "Nº 01", "#cfd8bd", 5)
book.showPage()

chapters = [
    ("The shape of a shore", [
        "The first mark in my notebook was a line of salt. I had set the open book on a rock to tie my shoe. When I picked it up again, a white crescent crossed the page, more precise than anything I could have drawn.",
        "At low water the path turned west and disappeared among slabs of slate. I walked by the sound of my feet. Gravel answered with a rattle, sand with a hush. On wet stone my boots made no sound at all.",
        "From above, the inlet looked small enough to step across. Down here it contained a whole afternoon. A heron waited in the shadow of the jetty. A boy in a red cap carried a bucket of seawater past six perfectly good pools.",
        "I sat on the lowest step of the old landing and tried to draw the opposite bank. Each time I looked down to find my pencil, a wave moved the edge of the land. Eventually I drew three lines and left the space between them empty.",
    ]),
    ("A measure of distance", [
        "On the second morning I left the map folded. The keeper at the landing had given me a better measure. Walk until the bell is quiet, she said. From there you can see the roof.",
        "The bell held on through the first field and most of the second. By the stile it had become a thin silver sound. I stopped to listen. Somewhere behind the hedge a horse tore a mouthful of grass, and that was the last I heard of the bell.",
        "The roof belonged to a shed with one blue door. Inside, someone had hung a cup over a basin and laid a clean towel on a nail. The tide table on the wall was eleven years old. Beside it a pencil mark recorded the height of a child.",
        "Distances on the map ran from point to point. The distance I remembered afterward ran from the last sound of the bell to the first sight of that blue door.",
    ]),
    ("The keeper's window", [
        "By noon the fog had lifted enough to show the station on the headland. Its windows caught the light before the walls appeared. For a moment there were four small suns above the sea.",
        "The keeper was mending a chair in the lee of the house. She had a board across her knees and a tin of screws arranged by size. Every few minutes she raised her eyes to the water, almost as if the work required it.",
        "She showed me an old chart spread beneath a pane of glass. Someone had pencilled a cross where a boat used to lie. The boat was gone. The cross had survived three keepers and the winter that took the pier.",
        "Before I left she turned the chart around so that the inlet lay the way I had walked it. A stranger's coast tilted into the shape of my own morning. I could point to the landing with one finger.",
    ]),
    ("Reading the tide", [
        "At the creek mouth two currents met. A feather traced the boundary, spun twice, then sailed upstream. On the bank, the reeds leaned out toward the open water as if they disagreed.",
        "I put a flat stone beside the water and took a seat above it. In the time it took to eat an apple the stone grew a bright rim. By the time I tucked the core in my pocket, the rim had closed over its top.",
        "A woman crossing the causeway carried her shoes in one hand. She knew precisely how much road remained under the water. Halfway across she paused to wave at someone behind me, then walked straight into the reflection of the clouds.",
        "In my notebook I drew the stone twice. Between the drawings I wrote the time and a single word for the wind. The next day I found I could remember the apple, the shoes and the feather from those few marks.",
    ]),
    ("A pocket map", [
        "On the last evening I tore a blank sheet from the back of the notebook. I folded it into quarters until it fitted the palm of my hand, then opened it on the kitchen table.",
        "Along the first crease I drew the road to the landing. A dot served for the blue shed. The creek took a line the width of my smallest finger, and the headland a dark patch made with the side of the pencil.",
        "There was room for the bell after all. I put a small circle beside the field where its sound ran out. In the blank below the inlet I drew three wavering lines, close together and then apart.",
        "In the morning I left the map on the sill for the next guest. I kept the notebook with the salt mark. At home, long after the last grain had brushed away, I could still find the page by touch.",
    ]),
]

for page, (title, paragraphs) in enumerate(chapters, 1):
    key = f"chapter-{page}"
    book.bookmarkPage(key)
    book.addOutlineEntry(title, key)
    fill(PAPER)
    book.rect(0, 0, W, H, fill=1, stroke=0)
    label(31, 481, "THE QUIET ATLAS", MOSS, 6.5)
    book.setStrokeColor(HexColor("#c5cdb7"))
    book.line(31, 470, 329, 470)
    label(31, 435, f"FIELD NOTE   /   0{page}", "#9b6747", 6.4)
    fill(INK)
    book.setFont("Times-Roman", 28)
    book.drawString(30, 393, title)
    y = 367
    style = ParagraphStyle("Body", fontName="Times-Roman", fontSize=12, leading=16, textColor=HexColor(INK))
    for paragraph in paragraphs:
        block = Paragraph(paragraph, style)
        _, h = block.wrap(293, H)
        y -= h
        block.drawOn(book, 32, y)
        y -= 11
    if y < 44:
        raise ValueError(f"Text overflows page {page}: {y}")
    book.line(31, 40, 329, 40)
    label(31, 25, "X-READER EDITIONS", MOSS, 5)
    label(314, 25, f"0{page}", MOSS, 5)
    book.showPage()
book.save()
