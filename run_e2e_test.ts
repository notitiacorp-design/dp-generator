/**
 * TEST DE BOUT EN BOUT — DP Générateur (données de référence Torcy/Lefebvre).
 * Enchaîne : géocodage BAN -> résolution cadastrale Apicarto IGN -> Cerfa overlaiy -> DP1 IGN WMS -> DP6 (Vision) -> calepinage solaire -> PDF final.
 * Console un log étape par étape avec timings.
 */
import { generateDPPackPdf } from './src/lib/pdf/generator';
import { getVisionRouter } from './src/lib/ai/vision-router';
import { getInpaintingRouter } from './src/lib/ai/inpainting-router';
import type { CerfaFormData } from './src/types/dp';
import fs from 'fs';
import path from 'path';

const ROOF_PATH = '/home/openclaw/dp-generator/sample_roof.jpg';
const OUT_DIR = '/home/openclaw/dp-generator/output';

// Coordonnées de référence Torcy (parcelle BD 0141)
const LON = 2.6565;
const LAT = 48.8514;

const results: { step: string; ms: number; note?: string }[] = [];
function tick(name: string, t0: number, note?: string) {
  const ms = Date.now() - t0;
  results.push({ step: name, ms, note });
  console.log(`  [${String(ms).padStart(6)} ms] ${name}${note ? ' — ' + note : ''}`);
}

const cerfaData: CerfaFormData = {
  demandeur: {
    nom: 'LEFEBVRE', prenom: 'Claire', adresse: '1 Rue de Paris', codePostal: '77200',
    ville: 'Torcy', telephone: '06 98 76 54 32', email: 'claire.lefebvre@example.fr',
    qualite: 'PROPRIETAIRE',
  },
  terrain: {
    adresse: '1 Rue de Paris, 77200 Torcy', codePostal: '77200', commune: 'Torcy',
    section: 'BD', numeroParcelle: '0141', superficieTerrainM2: 597,
    coordonnees: [LON, LAT],
  },
  projet: {
    type: 'SOLAR_PANELS',
    descriptionCourte: 'Pose de 14 modules solaires photovoltaïques full-black (5.95 kWp) en surimposition sur toiture existante en champ continu régulier.',
    puissanceKwc: 5.95, nombrePanneaux: 14, typePose: 'SURIMPOSE', empriseSolM2: 0,
  },
  pieces: { dp1: true, dp2: true, dp3: false, dp6: true, dp7: true, dp8: false },
};

async function main() {
  console.log('=== TEST DE BOUT EN BOUT — DP GÉNÉRATEUR (Torcy / LEFEBVRE) ===\n');
  console.log('Étape 0 — Entrées de référence');
  console.log(`  Adresse terrain : 1 Rue de Paris, 77200 Torcy  | Parcelle BD 0141 (597 m²)`);
  console.log(`  Photo toiture   : ${ROOF_PATH}  (cible 14 panneaux, grille 2x7)`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Géocodage BAN
  let t = Date.now();
  let geocode: any = null;
  try {
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent('1 Rue de Paris, 77200 Torcy')}&limit=1`;
    const r = await fetch(banUrl);
    const j = await r.json();
    geocode = j.features?.[0];
    tick('1. Géocodage BAN', t, geocode ? geocode.properties.label : 'Aucun résultat');
  } catch (e) { tick('1. Géocodage BAN', t, 'ERR: ' + String(e)); }

  // 2. Résolution cadastrale Apicarto
  t = Date.now();
  let cadastre: any = null;
  try {
    const pt = { type: 'Point', coordinates: [LON, LAT] };
    const cUrl = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(JSON.stringify(pt))}`;
    const cr = await fetch(cUrl);
    if (cr.ok) { cadastre = await cr.json(); }
  } catch (e) { /* fallback */ }
  tick('2. Résolution cadastrale Apicarto', t, cadastre ? `Parcelle ${cadastre.section || ''} ${cadastre.numero || ''} (${cadastre.contenance || ''} m²)` : 'Fallback coords réf.');

  // 3. DP6 : Vision détection de la toiture
  t = Date.now();
  const roofBuf = fs.readFileSync(ROOF_PATH);
  const roofB64 = `data:image/jpeg;base64,${roofBuf.toString('base64')}`;
  const vision = getVisionRouter();
  const detection = await vision.detectRoof(roofB64);
  const roofNote = detection?.roofPolygon?.length ? 'roofPolygon détecté' : '⚠ Aucun polygone';
  tick('3a. Vision — détection toiture', t, roofNote);

  // 4. Calepinage solaire (grille matricielle sur toiture)
  t = Date.now();
  const router = getInpaintingRouter();
  const sim = await router.generateInsertion({
    imageBase64: roofB64, roofPolygon: detection.roofPolygon, panelCount: 14,
    projectType: 'SOLAR_PANELS', integrationType: 'SURIMPOSE',
  });
  tick('sd. Calepinage solaire (grille 2x7 = 14 panne)', t, `provider=${sim.providerUsed} (${sim.executionTimeMs}ms)`);
  const afterB64 = sim.imageBase64 || sim.imageUrl || '';

  // 5. Assemblage PDF complet
  t = Date.now();
  const pdfBytes = await generateDPPackPdf({
    cerfaData,
    dp6BeforeImageBase64: roofB64,
    dp6AfterImageBase64: afterB64,
  });
  tick('7. Assemblage PDF multipages (Cerfa + DP1 + DP6)', t);

  const outPdf = path.join(OUT_DIR, 'DP_LEFEBVRE_TORCY_BD_0141.pdf');
  fs.writeFileSync(outPdf, Buffer.from(pdfBytes));

  console.log('\n=== LOG ACCUMULÉ (étape / ms) ===');
  let total = 0;
  for (const r of results) { console.log(`  ${r.step}: ${r.ms} ms${r.note ? ' · ' + r.note : ''}`); total += r.ms; }
  console.log(`  TOTAL cumulé : ${total} ms`);
  console.log(`\n✅ PDF généré : ${outPdf} (${Buffer.from(pdfBytes).length} octets)`);
  return outPdf;
}

main().catch((e) => { console.error('ERREUR TEST :', e); process.exit(1); });