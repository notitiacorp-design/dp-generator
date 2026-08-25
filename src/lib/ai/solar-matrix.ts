export interface Point2D {
  x: number;
  y: number;
}

export interface PanelGeometry {
  index: number;
  row: number;
  col: number;
  polygon: [Point2D, Point2D, Point2D, Point2D]; // 4 coins [TL, TR, BR, BL]
  svgPoints: string;
}

export interface SolarGridResult {
  rows: number;
  cols: number;
  totalPanels: number;
  panels: PanelGeometry[];
  svgElements: string;
}

/**
 * Matrice d'homographie 3x3 [h0, h1, h2, h3, h4, h5, h6, h7, h8]
 * Mappe un point unitaire (u, v) d'un espace source canonique [0, 1]x[0, 1] vers un quadrilatère arbitraire (x, y)
 */
export type HomographyMatrix = [
  number, number, number,
  number, number, number,
  number, number, number
];

/**
 * Calcule l'homographie projective directe depuis le carré unitaire [0,1]^2 vers les 4 coins du quadrilatère
 * q0: (0,0) -> TL
 * q1: (1,0) -> TR
 * q2: (1,1) -> BR
 * q3: (0,1) -> BL
 */
export function computeHomographyFromUnitSquare(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D
): HomographyMatrix {
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;

  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  let g = 0;
  let h = 0;

  // Si sx et sy sont quasi-nuls, le quadrilatère est un parallélogramme (transformation affine)
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) > 1e-7 && (Math.abs(sx) > 1e-5 || Math.abs(sy) > 1e-5)) {
    g = (sx * dy2 - sy * dx2) / det;
    h = (dx1 * sy - dy1 * sx) / det;
  }

  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;

  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  return [
    a, b, c,
    d, e, f,
    g, h, 1.0
  ];
}

/**
 * Applique la matrice d'homographie 3x3 sur des coordonnées canoniques (u, v)
 */
export function applyHomography(H: HomographyMatrix, u: number, v: number): Point2D {
  const [a, b, c, d, e, f, g, h, i] = H;
  const denom = g * u + h * v + i;
  if (Math.abs(denom) < 1e-9) {
    return { x: c, y: f };
  }
  return {
    x: (a * u + b * v + c) / denom,
    y: (d * u + e * v + f) / denom,
  };
}

/**
 * Inverse une matrice d'homographie 3x3 (retourne la matrice nulle si singulière)
 */
export function invertHomography(H: HomographyMatrix): HomographyMatrix | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H2 = b * g - a * h;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [A * id, B * id, C * id, D * id, E * id, F * id, G * id, H2 * id, I * id];
}

export interface UnitPoint2D {
  u: number;
  v: number;
}

/**
 * Projette un point image (x, y) vers l'espace canonique [0,1]x[0,1] via l'homographie inverse.
 * Retourne null si le point est hors de l'espace source (derrière le plan projeté).
 */
export function mapPointToUnitSquare(
  H: HomographyMatrix,
  x: number,
  y: number
): UnitPoint2D | null {
  const Hinv = invertHomography(H);
  if (!Hinv) return null;
  const [a, b, c, d, e, f, g, h, i] = Hinv;
  const denom = g * x + h * y + i;
  if (Math.abs(denom) < 1e-9) return null;
  return {
    u: (a * x + b * y + c) / denom,
    v: (d * x + e * y + f) / denom,
  };
}

export interface RoofObstacle {
  /** Coordonnées normalisées 0-1000 du rectangle englobant l'obstacle (Velux / cheminée) */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

/**
 * Détermine la disposition optimale lignes x colonnes pour un nombre exact de panneaux
 */
export function calculateGridDimensions(totalPanels: number): { rows: number; cols: number } {
  const n = Math.max(1, totalPanels);

  const presets: Record<number, { rows: number; cols: number }> = {
    1: { rows: 1, cols: 1 },
    2: { rows: 1, cols: 2 },
    3: { rows: 1, cols: 3 },
    4: { rows: 2, cols: 2 },
    6: { rows: 2, cols: 3 },
    8: { rows: 2, cols: 4 },
    9: { rows: 3, cols: 3 },
    10: { rows: 2, cols: 5 },
    12: { rows: 2, cols: 6 },
    14: { rows: 2, cols: 7 }, // 2 rangées de 7 modules
    15: { rows: 3, cols: 5 },
    16: { rows: 2, cols: 8 },
    18: { rows: 2, cols: 9 },
    20: { rows: 2, cols: 10 },
    21: { rows: 3, cols: 7 },
    22: { rows: 2, cols: 11 },
    24: { rows: 3, cols: 8 },
    28: { rows: 4, cols: 7 },
    30: { rows: 3, cols: 10 },
    32: { rows: 4, cols: 8 },
    36: { rows: 4, cols: 9 },
  };

  if (presets[n]) {
    return presets[n];
  }

  if (n % 2 === 0) {
    return { rows: 2, cols: n / 2 };
  } else if (n % 3 === 0) {
    return { rows: 3, cols: n / 3 };
  } else if (n % 4 === 0) {
    return { rows: 4, cols: n / 4 };
  } else {
    const cols = Math.ceil(n / 2);
    return { rows: 2, cols };
  }
}

export interface GridMarginOptions {
  marginTop?: number;    // Marge sous le faîtage (fraction normalisée 0-1)
  marginBottom?: number; // Marge au-dessus de la gouttière (fraction normalisée 0-1)
  marginLeft?: number;   // Marge rive gauche / Velux (fraction normalisée 0-1)
  marginRight?: number;  // Marge rive droite (fraction normalisée 0-1)
  gapU?: number;         // Interstice horizontal entre modules (ex: 0.015)
  gapV?: number;         // Interstice vertical entre rangées (ex: 0.02)
  aspectRatioWoverH?: number; // Ratio standard panneau portrait (environ 1.0 / 1.7 = 0.588)
  safetyMarginMeters?: number; // Marge de sécurité physique en mètres (défaut 0.30 m = 30 cm)
  slopeHeightMeters?: number;  // Hauteur de rampant faîtage→gouttière en mètres (défaut 4.0)
  roofWidthMeters?: number;    // Largeur horizontale du pan en mètres (défaut 6.0)
  obstacleClearance?: number;  // Jeu de sécurité autour des obstacles (fraction normalisée, défaut 0.06)
  obstacles?: RoofObstacleInPixels[]; // Obstacles (Velux, cheminée) en pixels image : arrêt net avant recouvrement
}

export interface RoofObstacleInPixels {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

/**
 * Calcule les marges normalisées à partir des marges physiques en mètres.
 * 30 cm sous le faîtage / au-dessus de la gouttière = safetyMarginMeters / slopeHeightMeters.
 */
export function computePhysicalMargins(options: GridMarginOptions): {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
} {
  const safety = options.safetyMarginMeters ?? 0.30;
  const slopeH = options.slopeHeightMeters ?? 4.0;
  const roofW = options.roofWidthMeters ?? 6.0;
  const vMargin = Math.min(0.25, Math.max(0.04, safety / slopeH)); // 30 cm sur 4 m ≈ 7.5 %
  const hMargin = Math.min(0.20, Math.max(0.03, safety / roofW));  // 30 cm sur 6 m ≈ 5 %
  return {
    marginTop: options.marginTop ?? vMargin,
    marginBottom: options.marginBottom ?? vMargin,
    marginLeft: options.marginLeft ?? hMargin,
    marginRight: options.marginRight ?? hMargin,
  };
}

/**
 * Résout les marges finales réellement appliquées : marges physiques (30 cm) + arrêt net
 * avant obstacles (Velux / cheminée / rives). Fonction partagée entre la génération de
 * matrice et les logs de la boucle de rétroaction.
 */
export function resolveGridMargins(
  quad: [Point2D, Point2D, Point2D, Point2D],
  options: GridMarginOptions = {}
): { marginTop: number; marginBottom: number; marginLeft: number; marginRight: number } {
  const phys = computePhysicalMargins(options);
  let marginTop = phys.marginTop;
  let marginBottom = phys.marginBottom;
  let marginLeft = phys.marginLeft;
  let marginRight = phys.marginRight;

  const clearance = options.obstacleClearance ?? 0.06;
  if (options.obstacles && options.obstacles.length > 0) {
    const H = computeHomographyFromUnitSquare(quad[0], quad[1], quad[2], quad[3]);
    for (const obs of options.obstacles) {
      const corners = [
        mapPointToUnitSquare(H, obs.x1, obs.y1),
        mapPointToUnitSquare(H, obs.x2, obs.y1),
        mapPointToUnitSquare(H, obs.x2, obs.y2),
        mapPointToUnitSquare(H, obs.x1, obs.y2),
      ];
      const valid = corners.filter(
        (c): c is UnitPoint2D => !!c && c.u >= -0.05 && c.u <= 1.05 && c.v >= -0.05 && c.v <= 1.05
      );
      if (valid.length < 4) continue; // obstacle hors du quad : ignoré
      const uMin = Math.min(...valid.map((c) => c.u));
      const uMax = Math.max(...valid.map((c) => c.u));
      const vMin = Math.min(...valid.map((c) => c.v));
      const vMax = Math.max(...valid.map((c) => c.v));
      const uMid = (uMin + uMax) / 2;
      const vMid = (vMin + vMax) / 2;
      if (uMid < 0.5) {
        marginLeft = Math.max(marginLeft, Math.min(0.85, uMax + clearance));
      } else {
        marginRight = Math.max(marginRight, Math.min(0.85, 1 - uMin + clearance));
      }
      if (vMid < 0.5) {
        marginTop = Math.max(marginTop, Math.min(0.85, vMax + clearance));
      } else {
        marginBottom = Math.max(marginBottom, Math.min(0.85, 1 - vMin + clearance));
      }
    }
  }

  return {
    marginTop: Math.min(0.85, marginTop),
    marginBottom: Math.min(0.85, marginBottom),
    marginLeft: Math.min(0.85, marginLeft),
    marginRight: Math.min(0.85, marginRight),
  };
}

/**
 * Génère la matrice exacte de panneaux solaires projetés par Homographie projective
 * avec respect des ratios de modules et marges de sécurité toiture
 */
export function generateSolarMatrix(
  quad: [Point2D, Point2D, Point2D, Point2D],
  totalPanels: number,
  options: GridMarginOptions = {}
): SolarGridResult {
  const { rows, cols } = calculateGridDimensions(totalPanels);
  const [p0, p1, p2, p3] = quad;

  // Calcul de la matrice projective d'homographie 3x3 depuis l'espace normalisé [0,1]^2
  const H = computeHomographyFromUnitSquare(p0, p1, p2, p3);

  // Marges finales (30 cm faîtage/gouttière + arrêt net avant Velux et rives)
  const { marginTop, marginBottom, marginLeft, marginRight } = resolveGridMargins(quad, options);

  // Espace utile normalisé disponible sur le pan de toit
  const availU = Math.max(0.2, 1.0 - (marginLeft + marginRight));
  const availV = Math.max(0.2, 1.0 - (marginTop + marginBottom));

  // Ajustement proportionnel pour garantir un ratio portrait réaliste (1.7m x 1.0m)
  const targetAspect = options.aspectRatioWoverH ?? (1.0 / 1.72); // ~0.58
  const gridAspectTarget = (cols / rows) * targetAspect; // Ratio largeur/hauteur global de la matrice

  let usedU = availU;
  let usedV = availV;

  // Si le pan est trop haut ou trop large, on recentre l'emprise du champ solaire
  if (usedU / usedV > gridAspectTarget * 1.5) {
    usedU = usedV * gridAspectTarget;
  } else if (usedU / usedV < gridAspectTarget * 0.7) {
    usedV = usedU / gridAspectTarget;
  }

  // Centrage de la matrice dans l'espace utile
  const uStart = marginLeft + (availU - usedU) / 2;
  const vStart = marginTop + (availV - usedV) / 2;

  const cellU = usedU / cols;
  const cellV = usedV / rows;

  const gapU = options.gapU ?? Math.max(0.003, cellU * 0.04);
  const gapV = options.gapV ?? Math.max(0.004, cellV * 0.05);

  const panels: PanelGeometry[] = [];
  const svgParts: string[] = [];

  let panelIndex = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (panelIndex >= totalPanels) break;

      // Coordonnées canoniques de la cellule avec interstices
      const u0 = uStart + c * cellU + gapU / 2;
      const u1 = uStart + (c + 1) * cellU - gapU / 2;
      const v0 = vStart + r * cellV + gapV / 2;
      const v1 = vStart + (r + 1) * cellV - gapV / 2;

      // Projection projective par homographie
      const c0 = applyHomography(H, u0, v0); // Top-Left
      const c1 = applyHomography(H, u1, v0); // Top-Right
      const c2 = applyHomography(H, u1, v1); // Bottom-Right
      const c3 = applyHomography(H, u0, v1); // Bottom-Left

      const polygon: [Point2D, Point2D, Point2D, Point2D] = [c0, c1, c2, c3];
      const svgPoints = `${c0.x.toFixed(1)},${c0.y.toFixed(1)} ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c3.x.toFixed(1)},${c3.y.toFixed(1)}`;

      panels.push({
        index: panelIndex + 1,
        row: r + 1,
        col: c + 1,
        polygon,
        svgPoints,
      });

      svgParts.push(`<polygon points="${svgPoints}" fill="white" />`);
      panelIndex++;
    }
  }

  return {
    rows,
    cols,
    totalPanels,
    panels,
    svgElements: svgParts.join('\n'),
  };
}
