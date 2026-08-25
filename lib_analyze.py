#!/usr/bin/env python3
"""
lib_analyze.py — Vérification automatisée pixel pour la boucle de rétroaction solaire.
Usage:
  python3 lib_analyze.py --orig sample_roof.jpg --quad "x0,y0 x1,y1 x2,y2 x3,y3" \
      --panels panels.json [--velux "x1,y1 x2,y2"]

Checks:
  1. Chaque panneau : fraction de pixels classés "hors toiture" (ciel / non-tuile).
  2. Cohérence perspective : après rectification du quad (homographie inverse),
     les rangs de tuiles doivent être horizontaux et les lignes de pente verticales.
  3. Vélux : aucune intersection panneau <-> rectangle vélux (SAT).
  4. Contenance : tous les coins panneau strictement à l'intérieur du quad.
"""
import argparse
import json

import numpy as np
from PIL import Image, ImageDraw


# ---------------------------------------------------------------- géométrie
def point_in_poly(x, y, poly):
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def homography_from_unit(quad):
    """H tel que (0,0)->q0, (1,0)->q1, (1,1)->q2, (0,1)->q3 (ordre TL,TR,BR,BL)."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = quad
    a = np.array([
        # h0 u + h1 v + h2 - h6 u x - h7 v x = x
        [0, 0, 1, 0, 0, 0, 0, 0],        # (0,0)->x0
        [0, 0, 0, 0, 0, 1, 0, 0],        # (0,0)->y0
        [1, 0, 1, 0, 0, 0, -x1, 0],      # (1,0)->x1
        [0, 0, 0, 1, 0, 1, -y1, 0],      # (1,0)->y1
        [1, 1, 1, 0, 0, 0, -x2, -x2],    # (1,1)->x2
        [0, 0, 0, 1, 1, 1, -y2, -y2],    # (1,1)->y2
        [0, 1, 1, 0, 0, 0, 0, -x3],      # (0,1)->x3
        [0, 0, 0, 0, 1, 1, 0, -y3],      # (0,1)->y3
    ])
    b = np.array([x0, y0, x1, y1, x2, y2, x3, y3])
    h = np.linalg.solve(a, b)
    return np.array([[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]])


def warp_quad_rectified(img, quad, size=420):
    """Rééchantillonne l'intérieur du quad vers une vue frontale size x size."""
    H = homography_from_unit(quad)
    Hinv = np.linalg.inv(H)  # quad -> unitaire
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:size, 0:size]
    us = (xs + 0.5) / size
    vs = (ys + 0.5) / size
    ones = np.ones_like(us)
    pts = np.stack([us.ravel(), vs.ravel(), ones.ravel()], axis=1)
    src = pts @ Hinv.T
    src /= src[:, 2:3]
    sx = src[:, 0].reshape(size, size)
    sy = src[:, 1].reshape(size, size)
    valid = (sx >= 0) & (sx < w - 1) & (sy >= 0) & (sy < h - 1)
    out = np.zeros((size, size), dtype=np.float64)
    x0f = np.clip(np.floor(sx).astype(int), 0, w - 2)
    y0f = np.clip(np.floor(sy).astype(int), 0, h - 2)
    fx = sx - x0f
    fy = sy - y0f
    top = img[y0f, x0f] * (1 - fx) + img[y0f, x0f + 1] * fx
    bot = img[y0f + 1, x0f] * (1 - fx) + img[y0f + 1, x0f + 1] * fx
    out = (top * (1 - fy) + bot * fy) * valid
    return out


def dominant_edge_deviations(gray, mask=None, magnitude_quantile=0.75):
    """Retourne (déviation rangs-de-tuiles, déviation lignes-de-pente) en degrés.

    Convention : angle de gradient atan2(gy,gx) — 0/180° = arêtes verticales,
    90° = arêtes horizontales.  On mesure la déviation des pics par rapport
    à l'horizontale (rangs) et à la verticale (pente), en degrés.
    """
    g = gray.astype(np.float64)
    gx = np.zeros_like(g)
    gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]
    gy[1:-1, :] = g[2:, :] - g[:-2, :]
    mag = np.hypot(gx, gy)
    ang = np.degrees(np.arctan2(gy, gx)) % 180.0
    if mask is not None:
        mag = mag * mask
    thr = magnitude_quantile * mag.max() if mag.max() > 0 else 0
    sel = mag > thr
    if sel.sum() < 50:
        return None, None
    a = ang[sel]
    horiz = a[(a > 55) & (a < 125)]          # rangs de tuiles ≈ horizontaux
    vert_raw = np.concatenate([a[a < 35], a[a > 145]])  # lignes de pente ≈ verticales
    row_dev = float(np.mean(horiz - 90.0)) if len(horiz) > 15 else None
    if vert_raw.size > 15:
        vert_cent = np.where(vert_raw > 90, vert_raw - 180, vert_raw)
        slope_dev = float(np.mean(vert_cent))
    else:
        slope_dev = None
    return row_dev, slope_dev


def sat_overlap(poly, rect):
    """Détection collision SAT entre polygone convexé (4 pts) et AABB rect = ((x1,y1),(x2,y2))."""
    axes = []
    for i in range(4):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % 4]
        axes.append((x2 - x1, y2 - y1))
    axes += [(1.0, 0.0), (0.0, 1.0)]
    r1x = rect[0][0]; r1y = rect[0][1]; r2x = rect[1][0]; r2y = rect[1][1]
    for ax in axes:
        if ax == (0.0, 0.0):
            continue
        pp = [p[0] * ax[0] + p[1] * ax[1] for p in poly]
        pr = [min(r1x * ax[0] + r1y * ax[1], r2x * ax[0] + r2y * ax[1]),
              max(r1x * ax[0] + r1y * ax[1], r2x * ax[0] + r2y * ax[1])]
        if min(pp) > pr[1] or max(pp) < pr[0]:
            return False
    return True


def poly_bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return (min(xs), min(ys), max(xs), max(ys))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orig", required=True)
    ap.add_argument("--quad", required=True, help="x0,y0 x1,y1 x2,y2 x3,y3")
    ap.add_argument("--panels", required=True)
    ap.add_argument("--velux", default=None, help="x1,y1 x2,y2")
    args = ap.parse_args()

    img = np.array(Image.open(args.orig).convert("RGB")).astype(np.float64)
    h, w = img.shape[:2]
    quad = [tuple(map(float, p.split(","))) for p in args.quad.split()]

    with open(args.panels) as f:
        panels_raw = json.load(f)
    panels = [{"id": p["id"], "poly": [(float(a), float(b)) for a, b in p["polygon"]]} for p in panels_raw]

    velux = None
    if args.velux:
        parts = [float(v) for v in args.velux.replace(",", " ").split()]
        velux = ((parts[0], parts[1]), (parts[2], parts[3]))

    # --- masque toiture ---
    pil = Image.new("L", (w, h), 0)
    ImageDraw.Draw(pil).polygon([tuple(map(int, p)) for p in quad], fill=255)
    mask_roof = np.array(pil) > 0
    if velux:
        (vx1, vy1), (vx2, vy2) = velux
        mask_roof[max(int(vy1), 0):max(int(vy2), 0), max(int(vx1), 0):max(int(vx2), 0)] = False

    # modèle couleur « tuile » : tout l'intérieur du quad, hors Velux et hors liseré
    # de faîtage (ombre) — plus représentatif que la seule moitié droite.
    top_edge = min(quad[0][1], quad[1][1], quad[2][1], quad[3][1])
    bot_edge = max(quad[0][1], quad[1][1], quad[2][1], quad[3][1])
    y_model_start = int(top_edge + 0.12 * (bot_edge - top_edge))
    model_mask = mask_roof & (np.arange(h)[:, None] >= y_model_start)
    pix = img[model_mask]
    if len(pix) < 500:
        model_mask = mask_roof
        pix = img[model_mask]
    mean = pix.mean(0)
    std = pix.std(0) + 1e-6

    # Seuil adaptatif : le modèle s'auto-calibre sur la distribution réelle de la toiture
    # (les tuiles anciennes/ombrées ont une variance naturelle). 99.5e percentile de la
    # distance de Mahalanobis du modèle lui-même => « hors-toiture » = vrai outlier.
    def mahal_of(rgb):
        d = (rgb - mean) / std
        return np.sqrt((d ** 2).sum(-1))

    model_dist = mahal_of(pix)
    model_thr = float(np.percentile(model_dist, 99.5)) + 0.2

    def roof_like(rgb):
        return mahal_of(rgb) < model_thr

    # --- cohérence perspective : rectification du quad ---
    gray = np.array(Image.open(args.orig).convert("L")).astype(np.float64)
    rect = warp_quad_rectified(gray, quad)
    rect_mask = np.zeros_like(rect, dtype=bool)
    rect_mask[int(0.12 * rect.shape[0]):, :] = True
    row_dev, slope_dev = dominant_edge_deviations(rect, rect_mask)

    def edge_angle_from_vertical(a, b):
        return float(np.degrees(np.arctan2(abs(b[0] - a[0]), abs(b[1] - a[1]))))

    quad_left_angle = edge_angle_from_vertical(quad[0], quad[3])
    quad_right_angle = edge_angle_from_vertical(quad[1], quad[2])

    # --- vérification panneau par panneau ---
    panel_stats = []
    for p in panels:
        poly = p["poly"]
        bb = poly_bbox(poly)
        xs0, ys0 = max(0, int(np.floor(bb[0]))), max(0, int(np.floor(bb[1])))
        xs1, ys1 = min(w, int(np.ceil(bb[2]))), min(h, int(np.ceil(bb[3])))
        total_px = 0
        inside_px = 0
        sky_px = 0
        nonroof_px = 0
        step_y = max(1, (ys1 - ys0) // 9)
        step_x = max(1, (xs1 - xs0) // 9)
        for gy_ in range(ys0, ys1, step_y):
            for gx_ in range(xs0, xs1, step_x):
                py = min(gy_ + step_y // 2, ys1 - 1)
                px_ = min(gx_ + step_x // 2, xs1 - 1)
                if not point_in_poly(px_, py, poly):
                    continue
                total_px += 1
                if point_in_poly(px_, py, quad):
                    inside_px += 1
                    rgb = img[py, px_]
                    if not roof_like(rgb):
                        nonroof_px += 1
                        if rgb[2] > mean[2] + 1.5 * std[2] and rgb[0] < rgb[2]:
                            sky_px += 1
        overlap_velux = False
        min_dist_velux = None
        if velux:
            (vx1, vy1), (vx2, vy2) = velux
            overlap_velux = sat_overlap(poly, ((vx1, vy1), (vx2, vy2)))
            cxp = sum(x for x, _ in poly) / 4
            cyp = sum(y for _, y in poly) / 4
            dx = max(0.0, vx1 - cxp, cxp - vx2)
            dy = max(0.0, vy1 - cyp, cyp - vy2)
            min_dist_vel = float(np.hypot(dx, dy))
        panel_stats.append({
            "id": p["id"],
            "insideRatio": (inside_px / total_px) if total_px else 1.0,
            "skyFrac": (sky_px / total_px) if total_px else 0.0,
            "nonRoofFrac": (nonroof_px / total_px) if total_px else 0.0,
            "samplePx": total_px,
            "veluxOverlap": overlap_velux,
            "minGapVeluxPx": min_dist_vel,
        })

    velux_overlaps = [s["id"] for s in panel_stats if s["veluxOverlap"]]

    out = {
        "size": [w, h],
        "roofModel": {"mean": mean.round(1).tolist(), "std": std.round(1).tolist()},
        "canonical": {"tileRowDevDeg": row_dev, "slopeLineDevDeg": slope_dev},
        "quad": {
            "leftEdgeFromVerticalDeg": round(quad_left_angle, 1),
            "rightEdgeFromVerticalDeg": round(quad_right_angle, 1),
        },
        "checks": {
            "panelCount": len(panels),
            "worstInsideRatio": round(min((s["insideRatio"] for s in panel_stats), default=1.0), 4),
            "worstSkyFrac": round(max((s["skyFrac"] for s in panel_stats), default=0.0), 4),
            "worstNonRoofFrac": round(max((s["nonRoofFrac"] for s in panel_stats), default=0.0), 4),
            "veluxOverlappingPanels": velux_overlaps,
            "veluxClear": len(velux_overlaps) == 0,
        },
        "panels": panel_stats,
    }
    out["status"] = {
        "countOk": len(panels) == 14,
        "containedOk": out["checks"]["worstInsideRatio"] >= 0.999,
        "skyOk": out["checks"]["worstSkyFrac"] <= 0.01,
        "nonRoofOk": out["checks"]["worstNonRoofFrac"] <= 0.06,
        "veluxOk": out["checks"]["veluxClear"],
        "alignRowOk": (row_dev is None) or (abs(row_dev) <= 8.0),
        "alignSlopeOk": (slope_dev is None) or (abs(slope_dev) <= 12.0),
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()