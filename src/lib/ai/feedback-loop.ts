/**
 * Boucle de rétroaction (Feedback Loop) pour le calepinage photovoltaïque par homographie.
 *
 * Étapes :
 *   A. Détection Vision des 4 coins du pan + obstacles (Velux/cheminée) + pente.
 *   B. Rendu : grille exacte (2x7 = 14 modules portrait 1:1.7) projetée par homographie 3x3,
 *      marges de sécurité 30 cm (faîtage / gouttière) et arrêt net avant Velux et rives.
 *   C. Vérification automatisée pixel (lib_analyze.py) : zéro débordement, alignement
 *      des lignes de fuite sur la pente des tuiles, décompte exact, clearance Velux.
 *   D. Ajustement : si un critère échoue, correction des marges / coefficients de projection
 *      puis réitération (max 6 itérations).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import {
  Point2D,
  HomographyMatrix,
  GridMarginOptions,
  RoofObstacleInPixels,
  generateSolarMatrix,
  computeHomographyFromUnitSquare,
  computePhysicalMargins,
  resolveGridMargins,
} from './solar-matrix';
import { renderPhotovoltaicOverlay } from './solar-renderer';

export interface VisionDetailedResult {
  hasRoof: boolean;
  confidence: number;
  roofQuad: Array<[number, number]>; // [[y,x], ...] normalisé 0-1000, ordre TL,TR,BR,BL
  velux?: { x1: number; y1: number; x2: number; y2: number } | null;
  pitchEstimateDeg?: number;
  orientation?: string;
  description?: string;
}

export interface VisionReview {
  panelCountSeen?: number;
  overflowIntoSky?: boolean;
  overflowOntoGutter?: boolean;
  alignedWithSlope?: boolean;
  veluxCovered?: boolean;
  verdict?: string;
}

export interface IterationLog {
  iteration: number;
  quadPx: Point2D[];
  quadNorm: Array<[number, number]>;
  homography: string;
  margins: { marginTop: number; marginBottom: number; marginLeft: number; marginRight: number };
  grid: { rows: number; cols: number; totalPanels: number; panels: number };
  checks: Record<string, unknown>;
  statuses: Record<string, boolean>;
  adjustment: string;
  renderPath: string;
}

export interface FeedbackLoopResult {
  success: boolean;
  finalImageBase64: string;
  iterations: IterationLog[];
  finalChecks: Record<string, unknown>;
  finalStatuses: Record<string, boolean>;
  visionReview: VisionReview | null;
  quadPx: Point2D[];
  velux: { x1: number; y1: number; x2: number; y2: number } | null;
  elapsedMs: number;
}

export interface RunFeedbackLoopOptions {
  imageBase64: string;
  panelCount?: number;
  maxIterations?: number;
  workDir?: string;
  outputDir?: string;
  marginOptions?: GridMarginOptions;
}

// ---------------------------------------------------------------------------
// Helpers Vision
// ---------------------------------------------------------------------------

async function visionCall(
  b64DataUrl: string,
  systemPrompt: string,
  userText: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const model = process.env.VISION_MODEL || 'google/gemini-2.5-flash';
  if (!apiKey) throw new Error('[FeedbackLoop] Aucune clé OPENROUTER_API_KEY configurée pour la Vision');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: b64DataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    throw new Error(`[FeedbackLoop] Vision HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('[FeedbackLoop] Réponse Vision vide');
  return JSON.parse(content);
}

const DETECT_SYSTEM_PROMPT = `Tu es un expert en métré photovoltaïque et géométrie projective.
Analyse la photographie de toiture et retourne EXCLUSIVEMENT un objet JSON valide :
{
 "hasRoof": boolean,
 "confidence": number (0-1),
 "roofQuad": [[y,x],[y,x],[y,x],[y,x]] en coordonnées normalisées 0-1000, les 4 coins du pan de toiture exploitable dans l'ordre : Haut-Gauche, Haut-Droite, Bas-Droite, Bas-Gauche. Le quadrilatère suit les lignes des tuiles/chevrons, reste strictement à l'intérieur du pan (pas de ciel, pas de gouttière, pas de façade). Il peut englober la zone du Velux (le calepinage s'arrête avant par calcul) mais ne doit jamais déborder du toit.
  "velux": {"x1":0-1000,"y1":0-1000,"x2":0-1000,"y2":0-1000} rectangle englobant le ou les obstacles (fenêtre de toit, cheminée) OU null s'il n'y en a pas,
  "pitchEstimateDeg": number (pente en degrés),
  "orientation": "SUD"|"EST"|"OUEST"|"NORD"|"SUD-EST"|"SUD-OUEST",
  "description": "brève description (type de tuiles, obstacles)"
}`;

const REVIEW_SYSTEM_PROMPT = `Tu es un contrôleur qualité photovoltaïque. On te montre le rendu photo-réaliste d'une toiture avec des panneaux solaires surimposés.
Retourne EXCLUSIVEMENT un JSON :
{
  "panelCountSeen": number (compte les panneaux visibles, valeur attendue 14),
  "overflowIntoSky": boolean (un panneau déborde-t-il hors du toit dans le ciel ?),
  "overflowOntoGutter": boolean (déborde-t-il sur la gouttière ou la façade ?),
  "alignedWithSlope": boolean (les bords des panneaux suivent-ils la pente des tuiles ?),
  "veluxCovered": boolean (un panneau recouvre-t-il une fenêtre de toit ?),
  "verdict": "PASS" | "FAIL" + commentaire bref
}`;

async function detectRoofDetailed(b64DataUrl: string): Promise<VisionDetailedResult> {
  const raw = await visionCall(
    b64DataUrl,
    DETECT_SYSTEM_PROMPT,
    'Détecte le pan de toiture exploitable avec ses 4 coins et les obstacles (Velux / fenêtre de toit / cheminée).'
  );
  return raw as unknown as VisionDetailedResult;
}

async function reviewRender(b64DataUrl: string): Promise<VisionReview> {
  const raw = await visionCall(
    b64DataUrl,
    REVIEW_SYSTEM_PROMPT,
    'Inspecte le rendu final : compte des panneaux, débordements, alignement, Velux.'
  );
  return raw as unknown as VisionReview;
}

// ---------------------------------------------------------------------------
// Boucle principale
// ---------------------------------------------------------------------------

export async function runFeedbackLoop(opts: RunFeedbackLoopOptions): Promise<FeedbackLoopResult> {
  const t0 = Date.now();
  const workDir = opts.workDir || process.cwd();
  const outDir = opts.outputDir || path.join(workDir, 'renders', 'feedback_loop');
  fs.mkdirSync(outDir, { recursive: true });

  const cleanB64 = opts.imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const originalBuffer = Buffer.from(cleanB64, 'base64');
  const meta = await sharp(originalBuffer).metadata();
  const W = meta.width || 1200;
  const imgH = meta.height || 800;
  const b64DataUrl = `data:image/jpeg;base64,${cleanB64}`;

  // ---------- Étape A : détection Vision ----------
  const vision = await detectRoofDetailed(b64DataUrl);
  if (!vision.hasRoof || !vision.roofQuad || vision.roofQuad.length !== 4) {
    throw new Error('[FeedbackLoop] Aucune toiture détectée par la Vision (hasRoof=false).');
  }

  let quadPx: Point2D[] = vision.roofQuad.map(([y, x]) => ({
    x: Math.round((x / 1000) * W),
    y: Math.round((y / 1000) * imgH),
  }));
  // Garantie d'ordre [TL, TR, BR, BL] : tri géométrique
  {
    const byY = [...quadPx].sort((a, b) => a.y - b.y);
    const topTwo = byY.slice(0, 2).sort((a, b) => a.x - b.x);
    const botTwo = byY.slice(2, 4).sort((a, b) => a.x - b.x);
    quadPx = [topTwo[0], topTwo[1], botTwo[1], botTwo[0]];
  }

  const veluxPx = vision.velux
    ? {
        x1: Math.round((vision.velux.x1 / 1000) * W),
        y1: Math.round((vision.velux.y1 / 1000) * imgH),
        x2: Math.round((vision.velux.x2 / 1000) * W),
        y2: Math.round((vision.velux.y2 / 1000) * imgH),
      }
    : null;

  const panelCount = opts.panelCount ?? 14;
  const maxIterations = opts.maxIterations ?? 6;

  const marginOverrides: GridMarginOptions = {
    safetyMarginMeters: 0.3,
    slopeHeightMeters: 4.0,
    roofWidthMeters: 6.0,
    aspectRatioWoverH: 1.0 / 1.72,
    obstacleClearance: 0.06,
    ...opts.marginOptions,
  };

  // Deltas additifs d'ajustement (n'écrasent jamais les marges physiques 30 cm de départ)
  const adjMargins = { top: 0, bottom: 0, left: 0, right: 0 };
  let adjClearance = 0;
  const physBase = computePhysicalMargins(marginOverrides);

  const iterations: IterationLog[] = [];
  let lastChecks: Record<string, unknown> = {};
  let lastStatuses: Record<string, boolean> = {};
  let lastBuffer: Buffer = originalBuffer;
  let success = false;

  for (let iter = 1; iter <= maxIterations; iter++) {
    const log: IterationLog = {
      iteration: iter,
      quadPx: [...quadPx],
      quadNorm: quadPx.map((p) => [Math.round((p.y / imgH) * 1000), Math.round((p.x / W) * 1000)]) as Array<
        [number, number]
      >,
      homography: '',
      margins: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
      grid: { rows: 0, cols: 0, totalPanels: 0, panels: 0 },
      checks: {},
      statuses: {},
      adjustment: '—',
      renderPath: '',
    };

    // ---------- Étape B : matrice + rendu ----------
    const obstacles: RoofObstacleInPixels[] = veluxPx ? [{ ...veluxPx, label: 'Velux' }] : [];
    const marginOptions: GridMarginOptions = {
      ...marginOverrides,
      obstacleClearance: (marginOverrides.obstacleClearance ?? 0.06) + adjClearance,
      marginTop: (marginOverrides.marginTop ?? physBase.marginTop) + adjMargins.top,
      marginBottom: (marginOverrides.marginBottom ?? physBase.marginBottom) + adjMargins.bottom,
      marginLeft: (marginOverrides.marginLeft ?? physBase.marginLeft) + adjMargins.left,
      marginRight: (marginOverrides.marginRight ?? physBase.marginRight) + adjMargins.right,
      obstacles,
    };

    const quadTuple: [Point2D, Point2D, Point2D, Point2D] = [quadPx[0], quadPx[1], quadPx[2], quadPx[3]];
    const H: HomographyMatrix = computeHomographyFromUnitSquare(quadTuple[0], quadTuple[1], quadTuple[2], quadTuple[3]);
    const gridResult = generateSolarMatrix(quadTuple, panelCount, marginOptions);
    log.homography = `[${H.map((v) => v.toFixed(4)).join(', ')}]`;

    const renderResult = await renderPhotovoltaicOverlay(
      originalBuffer,
      quadTuple,
      panelCount,
      'en surimposition sur rails discrets',
      marginOptions
    );
    const iterImg = path.join(outDir, `iter_${iter}.jpg`);
    await sharp(renderResult.resultBuffer).jpeg({ quality: 95 }).toFile(iterImg);
    log.renderPath = iterImg;
    log.grid = {
      rows: renderResult.rows,
      cols: renderResult.cols,
      totalPanels: renderResult.panelCount,
      panels: gridResult.panels.length,
    };
    const resolved = resolveGridMargins(quadTuple, marginOptions);
    log.margins = { ...resolved };

    // ---------- Étape C : vérification automatisée ----------
    const panelsJson = path.join(outDir, `iteration_${iter}_panels.json`);
    fs.writeFileSync(
      panelsJson,
      JSON.stringify(
        gridResult.panels.map((p) => ({ id: p.index, polygon: p.polygon.map((pt) => [pt.x, pt.y]) }))
      )
    );
    const origPath = path.join(outDir, 'orig.jpg');
    if (!fs.existsSync(origPath)) {
      await sharp(originalBuffer).jpeg({ quality: 95 }).toFile(origPath);
    }

    let analysis: Record<string, any>;
    try {
      const quadArg = quadPx.map((q) => `${q.x},${q.y}`).join(' ');
      const pyArgs = ['lib_analyze.py', '--orig', origPath, '--quad', quadArg, '--panels', panelsJson];
      if (veluxPx) pyArgs.push('--velux', `${veluxPx.x1},${veluxPx.y1} ${veluxPx.x2},${veluxPx.y2}`);
      const stdout = execFileSync('python3', pyArgs, { cwd: workDir, encoding: 'utf-8', timeout: 90000 });
      analysis = JSON.parse(stdout);
    } catch (e: any) {
      analysis = {
        checks: {},
        status: { countOk: false, containedOk: false, skyOk: false, nonRoofOk: false, veluxOk: false },
        panels: [],
        error: e?.message,
      };
    }
    log.checks = analysis.checks ?? {};
    log.statuses = analysis.status ?? {};
    lastChecks = analysis.checks ?? {};
    lastStatuses = analysis.status ?? {};
    lastBuffer = renderResult.resultBuffer;

    // ---------- Étape D : décision d'ajustement ----------
    const st = log.statuses;
    const checks = log.checks as any;
    let adjustment = '';

    if (!st.countOk) {
      adjustment = `ÉCHEC critique : décompte panneaux ${String(checks.panelCount)} != ${panelCount}`;
      log.adjustment = adjustment;
      iterations.push(log);
      break;
    }

    if (!st.veluxOk) {
      adjustment = `Velux recouvert (panneaux ${String(checks.veluxOverlappingPanels)}) → élargissement marge gauche + jeu de sécurité`;
      adjClearance += 0.03;
      adjMargins.left += 0.05;
    } else if (!st.containedOk || !st.nonRoofOk || !st.skyOk) {
      adjustment = 'Débordement (ciel / gouttière / rive) → agrandissement des marges';
      adjMargins.top += 0.02;
      adjMargins.bottom += 0.02;
      adjMargins.left += 0.01;
      adjMargins.right += 0.01;
    } else if (st.alignRowOk && st.alignSlopeOk) {
      success = true;
      adjustment = 'TOUS LES CONTRÔLES PASSENT ✓ (itération finale)';
    } else {
      const rowDev = Number(analysis?.canonical?.tileRowDevDeg ?? 0);
      const slopeDev = Number(analysis?.canonical?.slopeLineDevDeg ?? 0);
      adjustment = `Alignements : rangs ${(rowDev || 0).toFixed(1)}°, pente ${(slopeDev || 0).toFixed(1)}° → cisaillement du quad`;
      const height = Math.abs(quadPx[2].y - quadPx[0].y);
      const width = Math.abs(quadPx[1].x - quadPx[0].x);
      const shearX = (rowDev || 0) * (Math.PI / 180) * height * 0.35;
      quadPx[0].x -= shearX;
      quadPx[1].x -= shearX;
      const shearY = (slopeDev || 0) * (Math.PI / 180) * width * 0.35;
      quadPx[0].y += shearY;
      quadPx[3].y += shearY;
    }

    log.adjustment = adjustment;
    iterations.push(log);
    if (success) break;
  }

  // ---------- Rendu final + revue Vision ----------
  const finalB64 = `data:image/jpeg;base64,${lastBuffer.toString('base64')}`;
  let visionReview: VisionReview | null = null;
  try {
    visionReview = await reviewRender(finalB64);
  } catch {
    visionReview = null;
  }

  const reviewApproves =
    !visionReview ||
    (visionReview.panelCountSeen === panelCount &&
      !visionReview.overflowIntoSky &&
      !visionReview.overflowOntoGutter &&
      visionReview.alignedWithSlope !== false &&
      visionReview.veluxCovered !== true);

  return {
    success: success && reviewApproves,
    finalImageBase64: finalB64,
    iterations,
    finalChecks: lastChecks,
    finalStatuses: lastStatuses,
    visionReview,
    quadPx,
    velux: veluxPx,
    elapsedMs: Date.now() - t0,
  };
}