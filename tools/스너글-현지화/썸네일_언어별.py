# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, json
W_F = r"C:\Windows\Fonts"
LAT = os.path.join(W_F, "segoeuib.ttf")      # 라틴·키릴·베트남
JA  = os.path.join(W_F, "YuGothB.ttc")
ZHS = os.path.join(W_F, "msyhbd.ttc")
ZHT = os.path.join(W_F, "msjhbd.ttc")
TH  = os.path.join(W_F, "LEELAWDB.TTF")
HI  = os.path.join(W_F, "Nirmala.ttc")
AR  = os.path.join(W_F, "tahomabd.ttf")

L = {
 "en":   ("and it really is fresher", LAT),
 "ja":   ("たしかに爽やかで", JA),
 "zh-Hans": ("确实更清爽", ZHS),
 "zh-Hant": ("確實更清爽", ZHT),
 "vi":   ("Và quả thật thơm mát hơn", LAT),
 "th":   ("หอมสดชื่นขึ้นจริง ๆ", TH),
 "id":   ("Dan memang lebih segar", LAT),
 "es":   ("Y de verdad huele más fresco", LAT),
 "pt-BR":("E fica mesmo mais fresquinho", LAT),
 "de":   ("Und es riecht wirklich frischer", LAT),
 "fr":   ("Et c'est vraiment plus frais", LAT),
 "ru":   ("И правда свежее", LAT),
 "ar":   ("والنتيجة أكثر انتعاشًا فعلًا", AR),
 "hi":   ("और सच में ज़्यादा ताज़गी रहती है", HI),
 "it":   ("Ed è davvero più fresco", LAT),
}

def shape(code, txt):
    if code != "ar":
        return txt
    import arabic_reshaper
    from bidi.algorithm import get_display
    return get_display(arabic_reshaper.reshape(txt))

src = Image.open("base_ko.png").convert("RGB")
W, H = src.size
TOP, BOT = 2320, 2620          # 한국어 자막이 있는 띠
CY = 2470                       # 새 글자 중심
OUT = r"C:\Users\김동우\Downloads\우수리미부부 자막\썸네일\언어별"
os.makedirs(OUT, exist_ok=True)
rep = []

for code, (txt, fpath) in L.items():
    im = src.copy()
    # ① 한국어 글자 지우기: 그 띠만 흐리게 + 살짝 어둡게
    strip = im.crop((0, TOP, W, BOT)).filter(ImageFilter.GaussianBlur(46))
    strip = Image.blend(strip, Image.new("RGB", strip.size, (18, 22, 28)), 0.22)
    im.paste(strip, (0, TOP))
    # 위아래 경계 부드럽게
    im = im.filter(ImageFilter.SMOOTH) if False else im

    d = ImageDraw.Draw(im)
    t = shape(code, txt)
    size = 190
    while size > 60:
        f = ImageFont.truetype(fpath, size)
        x0, y0, x1, y1 = d.textbbox((0, 0), t, font=f, stroke_width=12)
        if (x1 - x0) <= W * 0.86:
            break
        size -= 6
    x0, y0, x1, y1 = d.textbbox((0, 0), t, font=f, stroke_width=12)
    x = (W - (x1 - x0)) / 2 - x0
    y = CY - (y1 - y0) / 2 - y0
    d.text((x, y), t, font=f, fill=(255, 255, 255), stroke_width=12, stroke_fill=(12, 16, 22))
    p = os.path.join(OUT, f"thumb_{code}.jpg")
    im.save(p, "JPEG", quality=92)
    rep.append(f"{code:8s} size {size:3d}  {round(os.path.getsize(p)/1024)}KB")

open("locrep.txt", "w", encoding="utf-8").write("\n".join(rep))
