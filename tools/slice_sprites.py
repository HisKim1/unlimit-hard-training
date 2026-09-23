#!/usr/bin/env python3
"""원장님 키우기 스프라이트 전처리 도구.

assets/frames.json (+ assets/frames.d/*.json 조각)에 정의된 크롭 박스를 읽어
배경 제거 → 불필요한 조각 제거 → 스케일 → 앵커 정렬 → 아틀라스 패킹을 수행한다.

출력 (public/assets/):
  atlas.json + atlas-N.png   Phaser multiatlas 형식 (트림된 프레임)
  anims.json                 애니메이션 정의 (프레임 목록, fps, origin)
  box_bg.jpg                 박스 배경 (720x1280)

사용법:
  python tools/slice_sprites.py                       전체 빌드
  python tools/slice_sprites.py --only wj_row,wj_ski  일부 애니만 빌드 + 미리보기 (출력 파일은 안 씀)
  python tools/slice_sprites.py --grid sheet_a --region 0,380,540,740 --step 20 --zoom 2 --out grid.png
  python tools/slice_sprites.py --preview wj_row --out preview.png
  python tools/slice_sprites.py --measure sheet_a 20,720,100,890
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
OUT_DIR = os.path.join(ROOT, "public", "assets")

ALPHA_SOLID = 40          # 이 값보다 큰 알파는 "그림"으로 취급 (연결 요소 분석용)
PAD = 4                   # 애니 캔버스 여백
ATLAS_SIZE = 2048
ATLAS_GAP = 2

_src_cache: dict[str, Image.Image] = {}


# ---------------------------------------------------------------- 설정 로드

def load_config() -> dict:
    with open(os.path.join(ASSETS, "frames.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    cfg.setdefault("sources", {})
    cfg.setdefault("anims", {})
    cfg.setdefault("images", {})
    for path in sorted(glob.glob(os.path.join(ASSETS, "frames.d", "*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                part = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(f"[warn] {os.path.basename(path)} 읽기 실패 - 건너뜀: {e}")
            continue
        for key in ("sources", "anims", "images"):
            for name, val in part.get(key, {}).items():
                if name in cfg[key] and key != "sources":
                    print(f"[warn] {os.path.basename(path)}: {key}.{name} 중복 정의 - 덮어씀")
                cfg[key][name] = val
    return cfg


def get_source(cfg: dict, name: str) -> Image.Image:
    if name not in _src_cache:
        src = cfg["sources"][name]
        im = Image.open(os.path.join(ASSETS, src["file"])).convert("RGBA")
        _src_cache[name] = im
    return _src_cache[name]


# ---------------------------------------------------------------- 배경 제거

def flood_remove_bg(arr: np.ndarray, tol: int) -> np.ndarray:
    """가장자리 픽셀에서 시작해 배경색과 비슷한 픽셀만 투명 처리 (전역 색상 키 금지).
    검은 외곽선 안쪽의 흰 양말·줄무늬는 플러드 필이 닿지 않아 보존된다."""
    h, w = arr.shape[:2]
    rgb = arr[..., :3].astype(np.int16)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    close = (np.abs(rgb - bg).max(axis=2) <= tol) | (arr[..., 3] < ALPHA_SOLID)
    visited = np.zeros((h, w), bool)
    q: deque = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and close[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))
    out = arr.copy()
    out[visited, 3] = 0
    return out


def defringe(arr: np.ndarray, band: int = 4) -> np.ndarray:
    """배경 제거 잔상으로 남은 빨간 테두리(헤일로)를 지운다. 투명 영역 근처 band px 안의
    채도 높은 빨강만 대상이라 입 안·혀 같은 내부 빨강은 건드리지 않는다."""
    a = arr[..., 3]
    transparent = a < ALPHA_SOLID
    near = ndimage.binary_dilation(transparent, iterations=band)
    r = arr[..., 0].astype(int)
    g = arr[..., 1].astype(int)
    b = arr[..., 2].astype(int)
    red = (r > 110) & (r - g > 70) & (r - b > 60) & (g < 110)
    kill = near & red
    out = arr.copy()
    out[kill, 3] = 0
    return out


def erode_alpha(arr: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return arr
    solid = arr[..., 3] >= ALPHA_SOLID
    eroded = ndimage.binary_erosion(solid, iterations=px)
    out = arr.copy()
    out[~eroded, 3] = 0
    return out


def isolate(arr: np.ndarray, keep_points: list | None) -> np.ndarray:
    """크롭 안에서 가장 큰 연결 요소 + 테두리에 닿지 않는 요소만 남긴다.
    이웃 프레임에서 삐져 들어온 조각(보통 크롭 테두리에 닿음)이 제거된다."""
    solid = arr[..., 3] >= ALPHA_SOLID
    lab, n = ndimage.label(solid, structure=np.ones((3, 3)))
    if n == 0:
        return arr
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[int(np.argmax(sizes)) + 1] = True
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    for i in range(1, n + 1):
        if i not in edge_labels and sizes[i - 1] >= 6:
            keep[i] = True
    for (px, py) in keep_points or []:
        if 0 <= py < lab.shape[0] and 0 <= px < lab.shape[1] and lab[py, px] > 0:
            keep[lab[py, px]] = True
    kept = keep[lab]
    kept = ndimage.binary_dilation(kept, iterations=2)  # 부드러운 가장자리 보존
    out = arr.copy()
    out[~kept, 3] = 0
    return out


# ---------------------------------------------------------------- 프레임 처리

def extract(cfg: dict, fr: dict, default_isolate: bool = True) -> tuple[np.ndarray, tuple[int, int]]:
    """프레임 하나를 잘라 배경/조각 제거까지 한 RGBA 배열과 크롭 원점(sheet 좌표)을 반환."""
    src_cfg = cfg["sources"][fr["src"]]
    im = get_source(cfg, fr["src"])
    box = fr.get("box") or [0, 0, im.width, im.height]
    x0, y0, x1, y1 = box
    arr = np.array(im.crop((x0, y0, x1, y1)))
    if src_cfg.get("bg") == "flood":
        arr = flood_remove_bg(arr, int(src_cfg.get("tol", 18)))
    for ex in fr.get("erase", []):
        ex0, ey0, ex1, ey1 = ex
        arr[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0), 3] = 0
    if fr.get("defringe", src_cfg.get("defringe", False)):
        arr = defringe(arr)
    if fr.get("isolate", src_cfg.get("isolate", default_isolate)):
        kp = [(px - x0, py - y0) for px, py in fr.get("keep", [])]
        arr = isolate(arr, kp)
    arr = erode_alpha(arr, int(fr.get("erode", src_cfg.get("erode", 0))))
    return arr, (x0, y0)


def auto_anchor(arr: np.ndarray) -> tuple[float, float]:
    """발 기준 앵커: y = 가장 낮은 불투명 행, x = 몸통(상단 20~55% 구간) 무게중심."""
    solid = arr[..., 3] >= 128
    ys, xs = np.nonzero(solid)
    if len(ys) == 0:
        return arr.shape[1] / 2, arr.shape[0]
    top, bottom = ys.min(), ys.max()
    h = bottom - top + 1
    band = (ys >= top + 0.2 * h) & (ys <= top + 0.55 * h)
    ax = xs[band].mean() if band.any() else xs.mean()
    return float(ax), float(bottom + 1)


def resize_rgba(arr: np.ndarray, scale: float) -> np.ndarray:
    if abs(scale - 1.0) < 1e-6:
        return arr
    im = Image.fromarray(arr, "RGBA").convert("RGBa")  # 미리 곱한 알파로 리사이즈 → 가장자리 검은 테 방지
    w = max(1, round(im.width * scale))
    h = max(1, round(im.height * scale))
    im = im.resize((w, h), Image.LANCZOS).convert("RGBA")
    return np.array(im)


def process_anim(cfg: dict, name: str, anim: dict, gscale: float = 1.0) -> dict:
    """gscale: 전체 빌드에서만 곱하는 텍스처 배율 (frames.json "globalScale"). 미리보기는 1.0 = 월드 단위."""
    frames_out = []
    for i, fr in enumerate(anim["frames"]):
        arr, (x0, y0) = extract(cfg, fr)
        src_cfg = cfg["sources"][fr["src"]]
        scale = float(src_cfg.get("scale", 1.0)) * float(anim.get("scale", 1.0)) * float(fr.get("scale", 1.0)) * gscale
        if "anchor" in fr:
            ax, ay = fr["anchor"][0] - x0, fr["anchor"][1] - y0
        else:
            ax, ay = auto_anchor(arr)
            if "anchorDx" in fr:
                ax += fr["anchorDx"]
            if "anchorDy" in fr:
                ay += fr["anchorDy"]
        if fr.get("flipX"):
            arr = arr[:, ::-1].copy()
            ax = arr.shape[1] - ax
        arr = resize_rgba(arr, scale)
        frames_out.append({"arr": arr, "ax": ax * scale, "ay": ay * scale})
    # 공통 캔버스: 앵커를 (W/2, top+maxUp)에 고정
    max_side = max(max(f["ax"], f["arr"].shape[1] - f["ax"]) for f in frames_out)
    max_up = max(f["ay"] for f in frames_out)
    max_down = max(f["arr"].shape[0] - f["ay"] for f in frames_out)
    W = int(math.ceil(2 * max_side)) + 2 * PAD
    H = int(math.ceil(max_up + max_down)) + 2 * PAD
    cx, cy = W / 2, PAD + max_up
    canvases = []
    for f in frames_out:
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        px = int(round(cx - f["ax"]))
        py = int(round(cy - f["ay"]))
        canvas.alpha_composite(Image.fromarray(f["arr"], "RGBA"), (px, py))
        canvases.append(canvas)
    return {
        "canvases": canvases,
        "width": W,
        "height": H,
        "originX": round(cx / W, 4),
        "originY": round(cy / H, 4),
        "fps": anim.get("fps", 8),
        "repeat": anim.get("repeat", -1),
        "yoyo": anim.get("yoyo", False),
    }


def process_image(cfg: dict, name: str, img: dict, gscale: float = 1.0) -> dict:
    arr, _ = extract(cfg, img, default_isolate=img.get("isolate", False))
    if img.get("flipX"):
        arr = arr[:, ::-1].copy()
    solid = arr[..., 3] >= 8
    ys, xs = np.nonzero(solid)
    if len(ys):
        arr = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    if "fit" in img:
        fw, fh = img["fit"]
        scale = min(fw / arr.shape[1], fh / arr.shape[0])
        if not name.startswith("icon_"):
            scale *= gscale  # 월드에 놓이는 그림은 텍스처 배율 적용, UI 아이콘은 제외
    else:
        src_cfg = cfg["sources"][img["src"]]
        scale = float(img.get("scale", src_cfg.get("scale", 1.0))) * gscale
    arr = resize_rgba(arr, scale)
    ox, oy = img.get("origin", [0.5, 1.0])
    return {"canvases": [Image.fromarray(arr, "RGBA")], "width": arr.shape[1], "height": arr.shape[0],
            "originX": ox, "originY": oy}


# ---------------------------------------------------------------- 아틀라스 패킹

def trim(im: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    bbox = im.getchannel("A").point(lambda v: 255 if v >= 4 else 0).getbbox()
    if bbox is None:
        return im.crop((0, 0, 1, 1)), (0, 0)
    return im.crop(bbox), (bbox[0], bbox[1])


def pack(entries: list[tuple[str, Image.Image]]) -> list[dict]:
    """간단한 셸프 패킹. 높이 내림차순."""
    items = []
    for fname, canvas in entries:
        t, (ox, oy) = trim(canvas)
        items.append({"name": fname, "img": t, "ox": ox, "oy": oy, "sw": canvas.width, "sh": canvas.height})
    items.sort(key=lambda it: -it["img"].height)
    pages: list[dict] = []

    def new_page():
        pages.append({"img": Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0)), "frames": [],
                      "x": ATLAS_GAP, "y": ATLAS_GAP, "row_h": 0, "used_h": 0})
        return pages[-1]

    page = new_page()
    for it in items:
        w, h = it["img"].size
        if w + 2 * ATLAS_GAP > ATLAS_SIZE or h + 2 * ATLAS_GAP > ATLAS_SIZE:
            raise SystemExit(f"프레임 {it['name']} 이(가) 너무 큼: {w}x{h}")
        if page["x"] + w + ATLAS_GAP > ATLAS_SIZE:
            page["x"] = ATLAS_GAP
            page["y"] += page["row_h"] + ATLAS_GAP
            page["row_h"] = 0
        if page["y"] + h + ATLAS_GAP > ATLAS_SIZE:
            page = new_page()
        page["img"].paste(it["img"], (page["x"], page["y"]))
        page["frames"].append({
            "filename": it["name"], "rotated": False, "trimmed": True,
            "sourceSize": {"w": it["sw"], "h": it["sh"]},
            "spriteSourceSize": {"x": it["ox"], "y": it["oy"], "w": w, "h": h},
            "frame": {"x": page["x"], "y": page["y"], "w": w, "h": h},
        })
        page["x"] += w + ATLAS_GAP
        page["row_h"] = max(page["row_h"], h)
        page["used_h"] = max(page["used_h"], page["y"] + h + ATLAS_GAP)
    return pages


# ---------------------------------------------------------------- 보조 모드

def _font(size: int):
    for path in ("C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def grid_mode(cfg: dict, src: str, region: str | None, step: int, zoom: float, out: str) -> None:
    """시트 위에 좌표 격자를 그려 크롭 박스를 정하기 쉽게 한다 (좌표는 원본 시트 기준)."""
    im = get_source(cfg, src)
    x0, y0, x1, y1 = [int(v) for v in region.split(",")] if region else (0, 0, im.width, im.height)
    crop = im.crop((x0, y0, x1, y1))
    bg = Image.new("RGBA", crop.size, (70, 70, 70, 255))
    bg.alpha_composite(crop)
    bg = bg.resize((int(crop.width * zoom), int(crop.height * zoom)), Image.NEAREST)
    d = ImageDraw.Draw(bg)
    f = _font(max(10, int(9 * zoom)))
    for gx in range((x0 // step) * step, x1 + 1, step):
        if gx < x0:
            continue
        X = (gx - x0) * zoom
        major = gx % (step * 5) == 0
        d.line([(X, 0), (X, bg.height)], fill=(0, 255, 255, 200) if major else (0, 255, 255, 70), width=1)
        if major:
            d.text((X + 2, 2), str(gx), fill=(255, 255, 0, 255), font=f)
    for gy in range((y0 // step) * step, y1 + 1, step):
        if gy < y0:
            continue
        Y = (gy - y0) * zoom
        major = gy % (step * 5) == 0
        d.line([(0, Y), (bg.width, Y)], fill=(255, 0, 255, 200) if major else (255, 0, 255, 70), width=1)
        if major:
            d.text((2, Y + 2), str(gy), fill=(255, 255, 0, 255), font=f)
    bg.convert("RGB").save(out)
    print(f"grid → {out} ({bg.width}x{bg.height})")


def preview_mode(cfg: dict, names: list[str], out: str) -> None:
    """처리된 프레임을 나란히 그리고 앵커 십자선·발 기준선을 표시한다."""
    rows = []
    for name in names:
        if name in cfg["anims"]:
            res = process_anim(cfg, name, cfg["anims"][name])
        else:
            res = process_image(cfg, name, cfg["images"][name])
        rows.append((name, res))
    f = _font(14)
    total_w = max(sum(r["width"] + 10 for r in [res] * len(res["canvases"])) for _, res in rows) + 20
    total_h = sum(res["height"] + 30 for _, res in rows) + 10
    sheet = Image.new("RGBA", (max(total_w, 300), total_h), (110, 110, 110, 255))
    d = ImageDraw.Draw(sheet)
    y = 5
    for name, res in rows:
        d.text((5, y), f"{name}  {res['width']}x{res['height']} origin=({res['originX']},{res['originY']})",
               fill=(255, 255, 0, 255), font=f)
        y += 20
        x = 10
        ay = y + res["originY"] * res["height"]
        d.line([(0, ay), (sheet.width, ay)], fill=(255, 60, 60, 255), width=1)
        for c in res["canvases"]:
            d.rectangle([x, y, x + res["width"] - 1, y + res["height"] - 1], outline=(200, 200, 200, 255))
            sheet.alpha_composite(c, (x, y))
            axp = x + res["originX"] * res["width"]
            d.line([(axp - 8, ay), (axp + 8, ay)], fill=(0, 255, 0, 255), width=2)
            d.line([(axp, ay - 8), (axp, ay + 8)], fill=(0, 255, 0, 255), width=2)
            x += res["width"] + 10
        y += res["height"] + 10
    sheet.convert("RGB").save(out)
    print(f"preview → {out}")


def measure_mode(cfg: dict, src: str, box: str) -> None:
    x0, y0, x1, y1 = [int(v) for v in box.split(",")]
    arr, _ = extract(cfg, {"src": src, "box": [x0, y0, x1, y1]})
    ys, xs = np.nonzero(arr[..., 3] >= 128)
    if len(ys) == 0:
        print("비어 있음")
        return
    print(f"opaque bbox (sheet 좌표): x {x0 + xs.min()}..{x0 + xs.max()}  y {y0 + ys.min()}..{y0 + ys.max()}  "
          f"크기 {xs.max() - xs.min() + 1}x{ys.max() - ys.min() + 1}")
    ax, ay = auto_anchor(arr)
    print(f"auto anchor (sheet 좌표): ({x0 + ax:.1f}, {y0 + ay:.1f})")


# ---------------------------------------------------------------- 전체 빌드

def build(cfg: dict) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    entries: list[tuple[str, Image.Image]] = []
    anims_meta: dict = {}
    images_meta: dict = {}
    gscale = float(cfg.get("globalScale", 1.0))
    for name, anim in cfg["anims"].items():
        res = process_anim(cfg, name, anim, gscale)
        keys = []
        for i, c in enumerate(res["canvases"]):
            k = f"{name}_{i:02d}"
            entries.append((k, c))
            keys.append(k)
        anims_meta[name] = {"frames": keys, "fps": res["fps"], "repeat": res["repeat"], "yoyo": res["yoyo"],
                            "originX": res["originX"], "originY": res["originY"],
                            "width": res["width"], "height": res["height"]}
        print(f"anim {name}: {len(keys)} frames, canvas {res['width']}x{res['height']}")
    for name, img in cfg["images"].items():
        res = process_image(cfg, name, img, gscale)
        entries.append((name, res["canvases"][0]))
        images_meta[name] = {"originX": res["originX"], "originY": res["originY"],
                             "width": res["width"], "height": res["height"]}
        print(f"image {name}: {res['width']}x{res['height']}")
    pages = pack(entries)
    for old in glob.glob(os.path.join(OUT_DIR, "atlas-*.png")):
        os.remove(old)
    textures = []
    for i, p in enumerate(pages):
        h = 1
        while h < p["used_h"]:
            h *= 2
        img = p["img"].crop((0, 0, ATLAS_SIZE, min(ATLAS_SIZE, h)))
        fname = f"atlas-{i}.png"
        img.save(os.path.join(OUT_DIR, fname), optimize=True)
        textures.append({"image": fname, "format": "RGBA8888", "size": {"w": img.width, "h": img.height},
                         "scale": 1, "frames": p["frames"]})
        print(f"atlas page {i}: {img.width}x{img.height}, {len(p['frames'])} frames")
    with open(os.path.join(OUT_DIR, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump({"textures": textures, "meta": {"app": "tools/slice_sprites.py", "version": "1"}}, f)
    with open(os.path.join(OUT_DIR, "anims.json"), "w", encoding="utf-8") as f:
        json.dump({"anims": anims_meta, "images": images_meta}, f, ensure_ascii=False, indent=1)
    bg_cfg = cfg.get("background")
    if bg_cfg:
        bg = Image.open(os.path.join(ASSETS, bg_cfg["file"])).convert("RGB")
        bg = bg.resize(tuple(bg_cfg.get("size", [720, 1280])), Image.LANCZOS)
        bg.save(os.path.join(OUT_DIR, "box_bg.jpg"), quality=88, optimize=True)
        print("background → box_bg.jpg")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grid", metavar="SOURCE")
    ap.add_argument("--region")
    ap.add_argument("--step", type=int, default=20)
    ap.add_argument("--zoom", type=float, default=2.0)
    ap.add_argument("--preview", metavar="NAMES", help="쉼표로 구분한 anim/image 이름")
    ap.add_argument("--only", metavar="NAMES", help="--preview 와 같음 (호환용)")
    ap.add_argument("--measure", nargs=2, metavar=("SOURCE", "BOX"))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    cfg = load_config()
    if args.grid:
        grid_mode(cfg, args.grid, args.region, args.step, args.zoom, args.out or "grid.png")
    elif args.preview or args.only:
        preview_mode(cfg, (args.preview or args.only).split(","), args.out or "preview.png")
    elif args.measure:
        measure_mode(cfg, args.measure[0], args.measure[1])
    else:
        build(cfg)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
