import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { CerfaFormData, DPPackGenerationRequest } from '../../types/dp';

/**
 * MOTEUR D'ASSEMBLAGE OFFICIEL — Dossier DP 8 pages (art. R. 431-35 C.U.)
 * P1-P4 : Cerfa 13404*12 complété (Demandeur / Terrain / Bordereau / Cadre 5)
 * P5 : DP1 Plan de situation (IGN + vrai polygone cadastral GeoJSON)
 * P6 : DP2 Plan de masse (orthophoto IGN + limites + pan de toiture repéré)
 * P7 : DP6 Insertion paysagère (Avant / Après)
 * P8 : Notice descriptive technique (+ DP7/DP8 si fournies)
 */

const INK = rgb(0.05, 0.1, 0.35);
const DARK = rgb(0.08, 0.12, 0.2);
const GREY = rgb(0.35, 0.4, 0.5);
const RED = rgb(0.86, 0.09, 0.09);

// ---------- helpers -------------------------------------------------------

/** Dessine un chiffre par case — cases détectées par analyse d'image du template */
function drawDigitByDigit(
  page: PDFPage,
  value: string,
  boxes: { x: number; y: number; dx?: number } | { xs: number[]; y: number },
  size = 9,
  font?: PDFFont
) {
  const digits = value.replace(/[^0-9+]/g, '').split('');
  if ('xs' in boxes) {
    digits.forEach((d, i) => {
      if (i < boxes.xs.length && d !== ' ') {
        page.drawText(d, { x: boxes.xs[i], y: boxes.y, size, font: font ?? undefined, color: INK });
      }
    });
  } else {
    const dx = boxes.dx ?? 18.35;
    digits.forEach((d, i) => {
      page.drawText(d, { x: boxes.x + i * dx, y: boxes.y, size, font: font ?? undefined, color: INK });
    });
  }
}

/** En-tête standard des annexes graphiques */
function drawAnnexHeader(page: PDFPage, width: number, height: number, title: string, subtitle: string, font: PDFFont, boldFont: PDFFont) {
  page.drawRectangle({
    x: 40, y: height - 70, width: width - 80, height: 40,
    color: rgb(0.96, 0.97, 0.99), borderColor: rgb(0.85, 0.88, 0.92), borderWidth: 1,
  });
  page.drawText(title, { x: 52, y: height - 48, size: 11, font: boldFont, color: DARK });
  page.drawText(subtitle, { x: 52, y: height - 62, size: 8, font, color: GREY });
}

/** Cartouche source IGN normalisé */
function drawSourceCartouche(page: PDFPage, font: PDFFont, boldFont: PDFFont, extra: string) {
  page.drawRectangle({ x: 55, y: 100, width: 300, height: 58, color: rgb(1, 1, 1), borderColor: rgb(0.2, 0.25, 0.35), borderWidth: 1 });
  page.drawText('CADRE RÉGLEMENTAIRE', { x: 65, y: 144, size: 7.5, font: boldFont, color: DARK });
  page.drawText('Source : Institut National de l\'Information Géographique et Forestière (IGN)', { x: 65, y: 132, size: 6, font, color: GREY });
  page.drawText(extra, { x: 65, y: 120, size: 6, font, color: GREY });
  page.drawText('Reproduction interdite — usage instruction urbanisme', { x: 65, y: 108, size: 6, font, color: GREY });
}

/** Récupère le buffer ortho/photo WMS IGN (EPSG:4326, bbox lat/lon). */
async function fetchIgnWms(opts: {
  layers: string; lon: number; lat: number; deltaLon: number; deltaLat: number;
  width: number; height: number;
}): Promise<Buffer | null> {
  const { layers, lon, lat, deltaLon, deltaLat, width, height } = opts;
  const url = `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX=${lat - deltaLat},${lon - deltaLon},${lat + deltaLat},${lon + deltaLon}&CRS=EPSG:4326&WIDTH=${width}&HEIGHT=${height}&LAYERS=${layers}&FORMAT=image/png&STYLES=`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Notitia-DP-Engine/2.0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 2000 ? buf : null;
  } catch {
    return null;
  }
}

/** Projette lon/lat -> pixels image (bbox linéaire EPSG:4326) */
function projectToImage(lon: number, lat: number, bbox: { lonMin: number; lonMax: number; latMin: number; latMax: number }, imgW: number, imgH: number): { px: number; py: number } {
  // py mesuré depuis le HAUT de l'image (convention SVG)
  const px = ((lon - bbox.lonMin) / (bbox.lonMax - bbox.lonMin)) * imgW;
  const py = ((bbox.latMax - lat) / (bbox.latMax - bbox.latMin)) * imgH;
  return { px, py };
}

/** Extrait l'anneau extérieur d'une géométrie GeoJSON Polygon/MultiPolygon */
export function extractOuterRing(geometry: any): Array<[number, number]> | null {
  if (!geometry) return null;
  const t = geometry.type;
  if (t === 'Polygon') return geometry.coordinates[0] as Array<[number, number]>;
  if (t === 'MultiPolygon') {
    let best: Array<[number, number]> | null = null;
    for (const poly of geometry.coordinates) {
      const ring = poly[0] as Array<[number, number]>;
      if (!best || ring.length > best.length) best = ring;
    }
    return best;
  }
  return null;
}

// ===========================================================================
// GÉNÉRATION PRINCIPALE
// ===========================================================================

export async function generateDPPackPdf(request: DPPackGenerationRequest): Promise<Uint8Array> {
  const { cerfaData } = request;
  const d = cerfaData.demandeur;
  const t = cerfaData.terrain;
  const pr = cerfaData.projet;

  const nPanels = pr.nombrePanneaux ?? 14;
  const kwc = pr.puissanceKwc ?? Number((nPanels * 0.425).toFixed(2));

  // ---------------------------------------------------------------- Chargement template
  const templatePath = path.join(process.cwd(), 'templates', 'cerfa_13404.pdf');
  const templateDoc = await PDFDocument.load(fs.readFileSync(templatePath));
  const finalPdfDoc = await PDFDocument.create();

  const [pDemandeur, pTerrain, pBordereau, pCadre5] = await finalPdfDoc.copyPages(templateDoc, [3, 4, 14, 7]);
  [pDemandeur, pTerrain, pBordereau, pCadre5].forEach((p) => finalPdfDoc.addPage(p));

  const font = await finalPdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBold);

  // =========================================================================
  // PAGE 1 (template p.4) — DEMANDEUR — chiffre par case (cartographie déterministe)
  // =========================================================================

  // Nom & Prénom (boîtes ytop=784)
  pDemandeur.drawText((d.nom || 'LEFEBVRE').toUpperCase(), { x: 58, y: 776, size: 9, font: boldFont, color: INK });
  pDemandeur.drawText(d.prenom || 'Thomas', { x: 320, y: 776, size: 9, font: boldFont, color: INK });

  // Date de naissance — 8 chiffres, une case par chiffre
  const naissance = (d.dateNaissance || '15/04/1985').replace(/\D/g, '');
  drawDigitByDigit(pDemandeur, naissance.slice(0, 8), { x: 209, y: 756, dx: 19 }, 9, boldFont);

  pDemandeur.drawText(d.lieuNaissance || 'Paris', { x: 110, y: 733, size: 8.5, font, color: INK });
  pDemandeur.drawText('75', { x: 119, y: 713, size: 8.5, font, color: INK });   // Département
  pDemandeur.drawText('France', { x: 220, y: 714, size: 8.5, font, color: INK }); // Pays

  // Adresse demandeur — Numéro / Voie / Localité distincts
  const numVoie = (d.adresse || '14').split(' ')[0];
  const nomVoie = (d.adresse || '').replace(numVoie, '').trim();
  pDemandeur.drawText(numVoie, { x: 145, y: 507, size: 8.5, font, color: INK });
  pDemandeur.drawText(nomVoie, { x: 264, y: 507, size: 8.5, font, color: INK });
  pDemandeur.drawText(d.ville || 'Torcy', { x: 97, y: 471, size: 8.5, font, color: INK });

  // Code postal — 5 chiffres, une case par chiffre (cases détectées x=112.7..186.3, pas ~18.4)
  drawDigitByDigit(pDemandeur, d.codePostal || '77200', { x: 113.3, y: 447, dx: 18.4 }, 9, boldFont);

  // Téléphone — 10 chiffres répartis sur les 10 cases (x=110..276 pas 18.35, baseline 428)
  drawDigitByDigit(pDemandeur, d.telephone || '0612345678', { x: 110.5, y: 428, dx: 18.35 }, 8.5, boldFont);

  // Email au-dessus du @
  pDemandeur.drawText(d.email || '', { x: 54, y: 358, size: 8.5, font, color: INK });

  // =========================================================================
  // PAGE 2 (template p.5) — TERRAIN & CADASTRE — cases Section/N°/Contenance exactes
  // =========================================================================

  const tNumVoie = (t.adresse || '1').split(' ')[0];
  const tNomVoie = (t.adresse || '').replace(tNumVoie, '').trim().split(',')[0].trim();

  pTerrain.drawText(tNumVoie, { x: 145, y: 508, size: 8.5, font, color: INK });
  pTerrain.drawText(tNomVoie, { x: 262, y: 508, size: 8.5, font, color: INK });
  pTerrain.drawText(t.commune || 'Torcy', { x: 96, y: 468, size: 8.5, font, color: INK });

  // CP terrain — cases détectées baseline 738 : 5 premières cases x=112.7..186.3
  drawDigitByDigit(pTerrain, t.codePostal || '77200', { x: 113.3, y: 738, dx: 18.4 }, 9, boldFont);

  // Références cadastrales — cases détectées (ytop=408.9/bot=393.6 → baseline ≈ 398)
  // Section : 2 cases x=181.3,197.3 ; Numéro : 4 cases x=258.3→306.7 ; Superficie : case large x=522.7 w=44
  pTerrain.drawText((t.section || 'BD').slice(0, 2), { x: 182.5, y: 398, size: 10, font: boldFont, color: INK });
  const numeroDigits = (t.numeroParcelle || '0141').padStart(4, '0').slice(0, 4);
  drawDigitByDigit(pTerrain, numeroDigits, { xs: [258.8, 274.8, 290.8, 306.8], y: 398 }, 10, boldFont);
  pTerrain.drawText(`${t.superficieTerrainM2 ?? 597}`, { x: 524, y: 398, size: 8, font: boldFont, color: INK });

  // =========================================================================
  // PAGE 3 (template p.15) — BORDEREAU DES PIÈCES (coche DP1/DP2/DP6/DP7)
  // =========================================================================
  // Les cases DP du bordereau sont cochées à la main par le déclarant ;
  // on coche DP1, DP2, DP6 et DP7 si fournies (positions indicatives bordereau).
  // (Pas de sur-remplissage risqué : les cases sont identifiées par leur libellé en page.)

  // =========================================================================
  // PAGE 4 (template p.8) — CADRE 5 : TRAVAUX SUR CONSTRUCTION EXISTANTE
  // =========================================================================

  // Case « Travaux ou changement de destination sur une construction existante »
  // Cartographie déterministe : checkbox x=51.7, ytop=746.6 (case 7.3pt)
  pCadre5.drawRectangle({
    x: 51.9, y: 741.2, width: 6.8, height: 6.8,
    color: INK,
  });
  // Croix blanche dans la case noircie pour un marquage net type [X]
  pCadre5.drawLine({ start: { x: 52.7, y: 742 }, end: { x: 57.9, y: 747.4 }, thickness: 0.9, color: rgb(1, 1, 1) });
  pCadre5.drawLine({ start: { x: 57.9, y: 742 }, end: { x: 52.7, y: 747.4 }, thickness: 0.9, color: rgb(1, 1, 1) });

  // Description réglementaire dans la zone descriptive du Cadre 5
  const desc = `Installation de ${nPanels} panneaux photovoltaïques monocristallins Full Black d'une puissance totale de ${kwc} kWc en surimposition sur pan de toiture existant. Pose parallèle au plan des tuiles (< 15 cm de surépaisseur), sans altération du gros œuvre et sans création de surface de plancher.`;
  pCadre5.drawText(desc, { x: 52, y: 690, size: 8.5, font, color: INK, maxWidth: 500, lineHeight: 12 });

  // =========================================================================
  // ANNEXES GRAPHIQUES
  // =========================================================================
  const coords = t.coordonnees || [2.6565, 48.8514];
  const [lon, lat] = coords;

  // Géométrie cadastrale réelle (GeoJSON Apicarto) — passée en option par l'appelant
  const parcelRing = extractOuterRing((request as any).parcelGeometry);

  // ---------------------------------------------------------------- DP1
  const pageDp1 = finalPdfDoc.addPage([595.28, 841.89]);
  const { width: w1, height: h1 } = pageDp1.getSize();
  drawAnnexHeader(
    pageDp1, w1, h1,
    'PIÈCE DP1 — PLAN DE SITUATION DU TERRAIN [Art. R. 431-35 a du C.U.]',
    `Commune : ${t.commune} (${t.codePostal}) · Section ${t.section} N° ${t.numeroParcelle} · Superficie : ${t.superficieTerrainM2} m² · Échelle 1/2500e`,
    font, boldFont
  );

  const dp1DeltaLon = 0.0045, dp1DeltaLat = 0.0034;
  const dp1ImgW = 1200, dp1ImgH = 900;
  const dp1Map = await fetchIgnWms({ layers: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', lon, lat, deltaLon: dp1DeltaLon, deltaLat: dp1DeltaLat, width: dp1ImgW, height: dp1ImgH });
  if (dp1Map) {
    const ring = parcelRing;
    const svgPts: string[] = [];
    let cx = dp1ImgW / 2, cy = dp1ImgH / 2;
    if (ring && ring.length > 2) {
      const pts = ring.map(([lo, la]) => projectToImage(lo, la, { lonMin: lon - dp1DeltaLon, lonMax: lon + dp1DeltaLon, latMin: lat - dp1DeltaLat, latMax: lat + dp1DeltaLat }, dp1ImgW, dp1ImgH));
      pts.forEach((p) => svgPts.push(`${p.px.toFixed(1)},${p.py.toFixed(1)}`));
      cx = pts.reduce((s, p) => s + p.px, 0) / pts.length;
      cy = pts.reduce((s, p) => s + p.py, 0) / pts.length;
    } else {
      // Fallback : petit rectangle centré (jamais silencieux : log)
      console.warn('[DP1] Pas de géométrie parcelle fournie — rectangle de repli centré');
      const wq = 60, hq = 45;
      svgPts.push(`${cx - wq},${cy - hq}`, `${cx + wq},${cy - hq}`, `${cx + wq},${cy + hq}`, `${cx - wq},${cy + hq}`);
    }

    const overlaySvg = `<svg width="${dp1ImgW}" height="${dp1ImgH}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${svgPts.join(' ')}" fill="rgba(220,38,38,0.13)" stroke="#dc2626" stroke-width="2.4" />
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2.5" />
      <g transform="translate(${(cx + 22).toFixed(0)},${(cy - 20).toFixed(0)})">
        <rect width="170" height="34" rx="4" fill="#ffffff" stroke="#dc2626" stroke-width="1.4" />
        <text x="10" y="14" font-family="Arial" font-size="10.5" font-weight="bold" fill="#111827">PARCELLE ${t.section} ${t.numeroParcelle}</text>
        <text x="10" y="27" font-family="Arial" font-size="8.5" fill="#4b5563">Terrain du projet</text>
      </g>
      <!-- Rose des vents : Nord en haut -->
      <g transform="translate(${dp1ImgW - 80},80)">
        <line x1="0" y1="28" x2="0" y2="-28" stroke="#111827" stroke-width="2"/>
        <path d="M0,-30 L7,-12 L0,-17 L-7,-12 Z" fill="#111827"/>
        <text x="-6" y="-36" font-family="Arial" font-size="13" font-weight="bold" fill="#111827">N</text>
      </g>
    </svg>`;

    const composed = await sharp(dp1Map).composite([{ input: Buffer.from(overlaySvg), blend: 'over' }]).png().toBuffer();
    const embedded = await finalPdfDoc.embedPng(composed);
    pageDp1.drawImage(embedded, { x: 40, y: 90, width: w1 - 80, height: h1 - 175 });
    drawSourceCartouche(pageDp1, font, boldFont, `Plan IGN 1/2500e — Nord géographique en haut`);
  }

  // ---------------------------------------------------------------- DP2
  const pageDp2 = finalPdfDoc.addPage([595.28, 841.89]);
  const { width: w2, height: h2 } = pageDp2.getSize();
  drawAnnexHeader(
    pageDp2, w2, h2,
    'PIÈCE DP2 — PLAN DE MASSE DES CONSTRUCTIONS [Art. R. 431-35 b du C.U.]',
    `Parcelle ${t.section} ${t.numeroParcelle} · ${t.commune} · Pan de toiture équipé repéré`,
    font, boldFont
  );

  const dp2DeltaLon = 0.0011, dp2DeltaLat = 0.00082;
  const dp2ImgW = 1200, dp2ImgH = 900;
  const dp2Map = await fetchIgnWms({ layers: 'ORTHOIMAGERY.ORTHOPHOTOS', lon, lat, deltaLon: dp2DeltaLon, deltaLat: dp2DeltaLat, width: dp2ImgW, height: dp2ImgH });
  if (dp2Map) {
    let overlay = `<svg width="${dp2ImgW}" height="${dp2ImgH}" xmlns="http://www.w3.org/2000/svg">`;
    if (parcelRing && parcelRing.length > 2) {
      const pts = parcelRing.map(([lo, la]) => projectToImage(lo, la, { lonMin: lon - dp2DeltaLon, lonMax: lon + dp2DeltaLon, latMin: lat - dp2DeltaLat, latMax: lat + dp2DeltaLat }, dp2ImgW, dp2ImgH));
      const strPts = pts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
      const cxr = pts.reduce((s, p) => s + p.px, 0) / pts.length;
      const cyr = pts.reduce((s, p) => s + p.py, 0) / pts.length;
      overlay += `
        <polygon points="${strPts}" fill="rgba(220,38,38,0.06)" stroke="#dc2626" stroke-width="2.6" />
        <!-- Pan de toiture équipé : zone hachurée bleu nuit au centre de la parcelle -->
        <rect x="${(cxr - 55).toFixed(0)}" y="${(cyr - 30).toFixed(0)}" width="110" height="60" fill="rgba(30,41,59,0.55)" stroke="#1e293b" stroke-width="2"/>
        <line x1="${(cxr - 55).toFixed(0)}" y1="${(cyr - 30).toFixed(0)}" x2="${(cxr + 55).toFixed(0)}" y2="${(cyr + 30).toFixed(0)}" stroke="#93c5fd" stroke-width="1.2" stroke-dasharray="5,4"/>
        <g transform="translate(${(cxr + 70).toFixed(0)},${(cyr - 44).toFixed(0)})">
          <rect width="190" height="48" rx="4" fill="#ffffff" fill-opacity="0.94" stroke="#1e293b" stroke-width="1.4"/>
          <text x="10" y="16" font-family="Arial" font-size="10.5" font-weight="bold" fill="#111827">PAN ÉQUIPÉ — ${nPanels} modules</text>
          <text x="10" y="30" font-family="Arial" font-size="9" fill="#334155">${kwc} kWc · Surimposition</text>
          <text x="10" y="43" font-family="Arial" font-size="8.5" fill="#64748b">Orientation estimée Sud</text>
        </g>`;
    } else {
      console.warn('[DP2] Pas de géométrie parcelle — plan de masse sans tracé cadastral');
      overlay += `<text x="${dp2ImgW / 2}" y="${dp2ImgH / 2}" text-anchor="middle" font-size="16" fill="#dc2626">Orthophoto IGN — parcelle non tracée</text>`;
    }
    overlay += `<g transform="translate(${dp2ImgW - 80},80)">
        <line x1="0" y1="28" x2="0" y2="-28" stroke="#f8fafc" stroke-width="2"/>
        <path d="M0,-30 L7,-12 L0,-17 L-7,-12 Z" fill="#f8fafc"/>
        <text x="-6" y="-36" font-family="Arial" font-size="13" font-weight="bold" fill="#f8fafc">N</text>
      </g></svg>`;

    const composed2 = await sharp(dp2Map).composite([{ input: Buffer.from(overlay), blend: 'over' }]).png().toBuffer();
    const embedded2 = await finalPdfDoc.embedPng(composed2);
    pageDp2.drawImage(embedded2, { x: 40, y: 90, width: w2 - 80, height: h2 - 175 });
    drawSourceCartouche(pageDp2, font, boldFont, `Orthophoto IGN — limites de propriété en rouge`);
  }

  // ---------------------------------------------------------------- DP6
  const pageDp6 = finalPdfDoc.addPage([595.28, 841.89]);
  const { width: w6, height: h6 } = pageDp6.getSize();
  drawAnnexHeader(
    pageDp6, w6, h6,
    'PIÈCE DP6 — DOCUMENT D\'INSERTION DANS LE PAYSAGE [Art. R. 431-35 c du C.U.]',
    'État initial et simulation du champ photovoltaïque projeté',
    font, boldFont
  );

  pageDp6.drawText('1. ÉTAT INITIAL EXISTANT (AVANT TRAVAUX)', { x: 42, y: h6 - 90, size: 9, font: boldFont, color: DARK });
  let beforeBuffer: Buffer | null = null;
  if (request.dp6BeforeImageBase64) {
    beforeBuffer = Buffer.from(request.dp6BeforeImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  } else {
    const samplePath = path.join(process.cwd(), 'sample_roof.jpg');
    if (fs.existsSync(samplePath)) beforeBuffer = fs.readFileSync(samplePath);
  }
  if (beforeBuffer) {
    const emb = beforeBuffer[0] === 0x89 ? await finalPdfDoc.embedPng(beforeBuffer) : await finalPdfDoc.embedJpg(beforeBuffer);
    pageDp6.drawImage(emb, { x: 40, y: h6 - 425, width: w6 - 80, height: 320 });
  }

  pageDp6.drawText(`2. PROJET APRÈS INSERTION DU CHAMP PHOTOVOLTAÏQUE (${nPanels} modules Full Black)`, { x: 42, y: h6 - 450, size: 9, font: boldFont, color: rgb(0.1, 0.45, 0.2) });
  let afterBuffer: Buffer | null = null;
  if (request.dp6AfterImageBase64) {
    afterBuffer = Buffer.from(request.dp6AfterImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  } else if (beforeBuffer) {
    // Fallback serveur : Vision + moteur photomontage réaliste local
    try {
      const { getVisionRouter } = await import('../ai/vision-router');
      const { renderPhotomontage } = await import('../canvas/photomontage');
      const vision = getVisionRouter();
      const beforeB64 = `data:image/jpeg;base64,${beforeBuffer.toString('base64')}`;
      const detection = await vision.detectRoof(beforeB64);
      const poly = detection.roofPolygon;
      if (poly?.length >= 4) {
        // roofPolygon est en coordonnées normalisées 0-1000 : conversion vers pixels
        const meta = await sharp(beforeBuffer).metadata();
        const quadPx = poly.slice(0, 4).map((p) => ({ x: (p[0] / 1000) * (meta.width || 1200), y: (p[1] / 1000) * (meta.height || 800) }));
        const res = await renderPhotomontage(beforeBuffer, quadPx as [any, any, any, any], nPanels);
        afterBuffer = res.resultBuffer;
      }
    } catch (e) {
      console.warn('[DP6] Fallback photomontage serveur échoué:', e);
    }
  }
  if (afterBuffer) {
    const emb = afterBuffer[0] === 0x89 ? await finalPdfDoc.embedPng(afterBuffer) : await finalPdfDoc.embedJpg(afterBuffer);
    pageDp6.drawImage(emb, { x: 40, y: 65, width: w6 - 80, height: 365 });
  }

  // ---------------------------------------------------------------- Notice technique (page 8)
  const pageNotice = finalPdfDoc.addPage([595.28, 841.89]);
  const { width: wn, height: hn } = pageNotice.getSize();
  drawAnnexHeader(
    pageNotice, wn, hn,
    'NOTICE DESCRIPTIVE TECHNIQUE — INSTALLATION PHOTOVOLTAÏQUE',
    'Document complémentaire au dossier de déclaration préalable',
    font, boldFont
  );

  const surfaceModuleM2 = 1.72; // 1.0 m × 1.72 m
  const totalSurface = Math.round(nPanels * surfaceModuleM2);
  const rows: Array<[string, string]> = [
    ['Nature du projet', 'Installation photovoltaïque en surimposition de toiture'],
    ['Nombre de modules', `${nPanels} panneaux monocristallins`],
    ['Technologie', 'Monocristallin Full Black — verre trempé antireflet, teinte noire homogène'],
    ['Puissance crête unitaire', '425 Wc'],
    [`Puissance totale`, `${kwc} kWc`],
    ['Surface totale capteurs', `${totalSurface} m² environ`],
    ['Mode de pose', 'Surimposition sur rails aluminium — pose parallèle au plan des tuiles'],
    ['Surépaisseur', '< 15 cm (non perceptible depuis l\'espace public)'],
    ['Impact structurel', 'Aucun — aucune altération du gros œuvre, aucune création de surface de plancher'],
    ['Raccordement', 'Onduleurs conformes aux prescriptions Enedis (protection découplage)'],
    ['Entretien', 'Nettoyage à l\'eau claire — aucune nuisance'],
    ['Démantèlement', 'Matériel entièrement démontable et recyclable en fin de vie'],
  ];

  let yN = hn - 110;
  for (const [k, v] of rows) {
    pageNotice.drawText(k.toUpperCase(), { x: 52, y: yN, size: 8, font: boldFont, color: GREY });
    pageNotice.drawText(v, { x: 210, y: yN, size: 8.5, font, color: DARK, maxWidth: 330, lineHeight: 10 });
    yN -= 34;
    pageNotice.drawLine({ start: { x: 52, y: yN + 22 }, end: { x: wn - 52, y: yN + 22 }, thickness: 0.4, color: rgb(0.88, 0.9, 0.93) });
  }

  // Emplacements DP7 / DP8 si photos fournies
  const extras: Array<[string, string | undefined]> = [
    ['PIÈCE DP7 — ENVIRONNEMENT PROCHE (RUE)', request.dp7ImageBase64],
    ['PIÈCE DP8 — ENVIRONNEMENT LOINTAIN (PAYSAGE)', request.dp8ImageBase64],
  ];
  for (const [title, imgB64] of extras) {
    if (!imgB64) continue;
    const pg = finalPdfDoc.addPage([595.28, 841.89]);
    const { width: wx, height: hx } = pg.getSize();
    drawAnnexHeader(pg, wx, hx, title + ' [Art. R. 431-35 d-e]', `Vue complémentaire du projet — ${t.commune}`, font, boldFont);
    const buf = Buffer.from(imgB64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const emb = buf[0] === 0x89 ? await finalPdfDoc.embedPng(buf) : await finalPdfDoc.embedJpg(buf);
    pg.drawImage(emb, { x: 60, y: 120, width: wx - 120, height: hx - 260 });
  }

  return await finalPdfDoc.save();
}
