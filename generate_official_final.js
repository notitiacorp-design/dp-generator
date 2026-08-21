import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

async function generateWitness() {
  const templatePath = path.join(process.cwd(), 'templates', 'cerfa_13404.pdf');
  const templateBytes = fs.readFileSync(templatePath);
  const templateDoc = await PDFDocument.load(templateBytes);
  const finalPdfDoc = await PDFDocument.create();

  const [pDemandeur, pTerrain, pProjet] = await finalPdfDoc.copyPages(templateDoc, [3, 4, 5]);
  finalPdfDoc.addPage(pDemandeur);
  finalPdfDoc.addPage(pTerrain);
  finalPdfDoc.addPage(pProjet);

  const font = await finalPdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBold);
  const inkColor = rgb(0.05, 0.1, 0.35);

  // PAGE 4
  pDemandeur.drawText('LEFEBVRE', { x: 80, y: 787, size: 9, font: boldFont, color: inkColor });
  pDemandeur.drawText('Thomas', { x: 360, y: 787, size: 9, font: boldFont, color: inkColor });
  pDemandeur.drawText('15/04/1985', { x: 120, y: 747, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('Paris', { x: 230, y: 747, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('75', { x: 380, y: 747, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('France', { x: 450, y: 747, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('14', { x: 95, y: 488, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('Allée des Cerisiers', { x: 180, y: 488, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('77200', { x: 110, y: 450, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('Torcy', { x: 280, y: 450, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('06 12 34 56 78', { x: 140, y: 422, size: 8.5, font, color: inkColor });
  pDemandeur.drawText('thomas.lefebvre@pro-solaire.fr', { x: 80, y: 350, size: 8.5, font, color: inkColor });

  // PAGE 5
  pTerrain.drawText('14', { x: 95, y: 512, size: 8.5, font, color: inkColor });
  pTerrain.drawText('Allée des Cerisiers', { x: 180, y: 512, size: 8.5, font, color: inkColor });
  pTerrain.drawText('77200', { x: 110, y: 475, size: 8.5, font, color: inkColor });
  pTerrain.drawText('Torcy', { x: 280, y: 475, size: 8.5, font, color: inkColor });
  pTerrain.drawText('BD', { x: 115, y: 395, size: 9, font: boldFont, color: inkColor });
  pTerrain.drawText('0141', { x: 210, y: 395, size: 9, font: boldFont, color: inkColor });
  pTerrain.drawText('597 m²', { x: 350, y: 395, size: 9, font: boldFont, color: inkColor });

  // PAGE 6
  const desc = "Installation de 14 modules solaires photovoltaïques monocristallins full-black (6.0 kWc) en surimposition sur pan de toiture existant. Pose en champ continu régulier avec intégration soignée, préservation des ouvrants et de la toiture sans altération du gros œuvre.";
  pProjet.drawText(desc, { x: 52, y: 280, size: 8.5, font, color: inkColor, maxWidth: 490, lineHeight: 12 });

  // PAGE DP1 (IGN + Parcelle rouge)
  const pageDp1 = finalPdfDoc.addPage([595.28, 841.89]);
  const { width, height } = pageDp1.getSize();

  pageDp1.drawRectangle({
    x: 40,
    y: height - 70,
    width: width - 80,
    height: 40,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  pageDp1.drawText('PIÈCE DP1 — PLAN DE SITUATION DU TERRAIN [Art. R. 431-35 a du C.U.]', {
    x: 52,
    y: height - 48,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.12, 0.2),
  });

  pageDp1.drawText('Commune : Torcy (77200) | Réf. cadastrale : Section BD N° 0141 | Superficie : 597 m²', {
    x: 52,
    y: height - 62,
    size: 8,
    font,
    color: rgb(0.35, 0.4, 0.5),
  });

  const delta = 0.0025;
  const lon = 2.6565;
  const lat = 48.8514;
  const ignWmsUrl = `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX=${lat - delta},${lon - delta * 1.3},${lat + delta},${lon + delta * 1.3}&CRS=EPSG:4326&WIDTH=1200&HEIGHT=900&LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png&STYLES=`;
  const res = await fetch(ignWmsUrl, { headers: { 'User-Agent': 'Notitia-DP-Engine/2.0' } });
  const ignBuffer = Buffer.from(await res.arrayBuffer());

  const mapOverlaySvg = `
    <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
      <polygon points="560,405 645,395 655,475 570,485" 
               fill="rgba(239, 68, 68, 0.15)" 
               stroke="#dc2626" 
               stroke-width="3" 
               stroke-dasharray="8,4" />
      <circle cx="605" cy="440" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2.5" />
      <g transform="translate(625, 420)">
        <rect x="0" y="0" width="160" height="34" rx="4" fill="#ffffff" stroke="#dc2626" stroke-width="1.5" />
        <text x="10" y="14" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#111827">PARCELLE BD 0141</text>
        <text x="10" y="27" font-family="Arial, sans-serif" font-size="8.5" fill="#4b5563">Emplacement du projet</text>
      </g>
    </svg>
  `;

  const dp1ImgBytes = await sharp(ignBuffer)
    .composite([{ input: Buffer.from(mapOverlaySvg), blend: 'over' }])
    .png()
    .toBuffer();

  const embeddedIgn = await finalPdfDoc.embedPng(dp1ImgBytes);
  pageDp1.drawImage(embeddedIgn, {
    x: 40,
    y: 90,
    width: width - 80,
    height: height - 175,
  });

  pageDp1.drawRectangle({
    x: 55,
    y: 105,
    width: 280,
    height: 52,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.2, 0.25, 0.35),
    borderWidth: 1,
  });

  pageDp1.drawText('CADRE RÉGLEMENTAIRE — PLAN DE SITUATION', {
    x: 65,
    y: 144,
    size: 7.5,
    font: boldFont,
    color: rgb(0.08, 0.12, 0.2),
  });
  pageDp1.drawText('Source : Institut National de l\'Information Géographique et Forestière (IGN)', {
    x: 65,
    y: 132,
    size: 6.5,
    font,
    color: rgb(0.3, 0.35, 0.4),
  });
  pageDp1.drawText(`Échelle d'affichage : 1/2500e | Orientation : Nord géographique en haut`, {
    x: 65,
    y: 120,
    size: 6.5,
    font,
    color: rgb(0.3, 0.35, 0.4),
  });

  // PAGE DP6
  const pageDp6 = finalPdfDoc.addPage([595.28, 841.89]);
  pageDp6.drawRectangle({
    x: 40,
    y: height - 70,
    width: width - 80,
    height: 40,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  pageDp6.drawText('PIÈCE DP6 — DOCUMENT D\'INSERTION DANS LE PAYSAGE [Art. R. 431-35 c du C.U.]', {
    x: 52,
    y: height - 48,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.12, 0.2),
  });

  pageDp6.drawText('Représentation de l\'état initial existant et simulation du champ photovoltaïque continu projeté', {
    x: 52,
    y: height - 62,
    size: 8,
    font,
    color: rgb(0.35, 0.4, 0.5),
  });

  pageDp6.drawText('1. ÉTAT INITIAL EXISTANT (AVANT TRAVAUX)', {
    x: 42,
    y: height - 90,
    size: 9,
    font: boldFont,
    color: rgb(0.15, 0.2, 0.3),
  });

  const beforeBuffer = fs.readFileSync('sample_roof.jpg');
  const embeddedBefore = await finalPdfDoc.embedJpg(beforeBuffer);
  pageDp6.drawImage(embeddedBefore, {
    x: 40,
    y: height - 425,
    width: width - 80,
    height: 320,
  });

  pageDp6.drawText('2. PROJET PROJETÉ — INSERTION PHOTORÉALISTE DU CHAMP PHOTOVOLTAÏQUE', {
    x: 42,
    y: height - 450,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.5, 0.2),
  });

  // Insertion continue homogène sur le pan de toiture à droite du Velux
  const meta = await sharp(beforeBuffer).metadata();
  const w = meta.width || 1200;
  const h = meta.height || 800;

  const startX = Math.round(w * 0.60);
  const startY = Math.round(h * 0.34);
  const cols = 5;
  const rows = 2;
  const modW = Math.round(w * 0.052);
  const modH = Math.round(h * 0.12);
  const spacing = 3;

  let modulesSvg = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mx = startX + c * (modW + spacing) + r * 10;
      const my = startY + r * (modH + spacing);
      modulesSvg += `
        <rect x="${mx}" y="${my}" width="${modW}" height="${modH}" rx="1" fill="#080c14" stroke="#1e293b" stroke-width="1.2" />
        <rect x="${mx + 1.5}" y="${my + 1.5}" width="${modW - 3}" height="${modH - 3}" fill="url(#photovoltaicCell)" />
        <line x1="${mx + 1}" y1="${my + modH / 2}" x2="${mx + modW - 1}" y2="${my + modH / 2}" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="0.8" />
        <line x1="${mx + modW / 2}" y1="${my + 1}" x2="${mx + modW / 2}" y2="${my + modH - 1}" stroke="#38bdf8" stroke-opacity="0.25" stroke-width="0.8" />
      `;
    }
  }

  const fieldWidth = cols * (modW + spacing) + rows * 10 + 10;
  const fieldHeight = rows * (modH + spacing) + 8;

  const overlaySvg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="photovoltaicCell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#090d16" />
          <stop offset="50%" stop-color="#020408" />
          <stop offset="100%" stop-color="#111c2e" />
        </linearGradient>
        <linearGradient id="glassSheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5" />
          <stop offset="60%" stop-color="#ffffff" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <g transform="skewX(-10) skewY(2)">
        <rect x="${startX - 4}" y="${startY - 2}" width="${fieldWidth + 10}" height="${fieldHeight + 8}" rx="4" fill="rgba(0,0,0,0.45)" />
        <rect x="${startX - 2}" y="${startY - 2}" width="${fieldWidth + 4}" height="${fieldHeight + 4}" rx="3" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        ${modulesSvg}
        <polygon points="${startX},${startY} ${startX + fieldWidth},${startY} ${startX},${startY + fieldHeight}" fill="url(#glassSheen)" opacity="0.35" />
      </g>
    </svg>
  `;

  const afterBuffer = await sharp(beforeBuffer)
    .composite([{ input: Buffer.from(overlaySvg), blend: 'over' }])
    .jpeg({ quality: 98 })
    .toBuffer();

  const embeddedAfter = await finalPdfDoc.embedJpg(afterBuffer);
  pageDp6.drawImage(embeddedAfter, {
    x: 40,
    y: 65,
    width: width - 80,
    height: 365,
  });

  const pdfFinal = await finalPdfDoc.save();
  fs.writeFileSync('DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf', pdfFinal);
  console.log('SUCCESS: DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf regenerated!');
}

generateWitness().catch(console.error);
