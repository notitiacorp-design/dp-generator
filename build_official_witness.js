import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

function generateSmartSolarGrid(params) {
  const { roofWidth, roofHeight, obstacleBox, panelCount } = params;
  const velux = obstacleBox || {
    x: Math.round(roofWidth * 0.48),
    y: Math.round(roofHeight * 0.36),
    w: Math.round(roofWidth * 0.14),
    h: Math.round(roofHeight * 0.20),
  };
  const margin = 20;
  const panelW = Math.round(roofWidth * 0.058);
  const panelH = Math.round(roofHeight * 0.11);
  const gap = 8;
  const candidateSlots = [];

  const leftStartX = Math.round(roofWidth * 0.24);
  const leftEndX = velux.x - margin;
  const rightStartX = velux.x + velux.w + margin;
  const rightEndX = Math.round(roofWidth * 0.82);
  const startY = Math.round(roofHeight * 0.32);
  const rows = 2;

  let curX = leftStartX;
  while (curX + panelW <= leftEndX) {
    for (let r = 0; r < rows; r++) {
      const py = startY + r * (panelH + gap);
      candidateSlots.push({ x: curX + r * 6, y: py, skewX: -8, skewY: 1 });
    }
    curX += panelW + gap;
  }

  curX = rightStartX;
  while (curX + panelW <= rightEndX) {
    for (let r = 0; r < rows; r++) {
      const py = startY + r * (panelH + gap);
      candidateSlots.push({ x: curX + r * 6, y: py, skewX: -8, skewY: 1 });
    }
    curX += panelW + gap;
  }

  if (candidateSlots.length < panelCount) {
    const bottomY = velux.y + velux.h + margin;
    if (bottomY + panelH <= Math.round(roofHeight * 0.70)) {
      let bX = leftStartX;
      while (bX + panelW <= rightEndX && candidateSlots.length < panelCount) {
        candidateSlots.push({ x: bX + 12, y: bottomY, skewX: -8, skewY: 1 });
        bX += panelW + gap;
      }
    }
  }

  return candidateSlots.slice(0, panelCount);
}

async function generateDPPackPdf(request) {
  const { cerfaData } = request;
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

  pDemandeur.drawText(cerfaData.demandeur.nom.toUpperCase(), { x: 120, y: 785, size: 9, font: boldFont, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.prenom, { x: 380, y: 785, size: 9, font: boldFont, color: inkColor });
  pDemandeur.drawText('France (Demandeur principal)', { x: 180, y: 755, size: 8, font, color: inkColor });

  const numVoie = cerfaData.demandeur.adresse.split(' ')[0] || '';
  const nomVoie = cerfaData.demandeur.adresse.replace(numVoie, '').trim();
  pDemandeur.drawText(numVoie, { x: 70, y: 480, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(nomVoie, { x: 180, y: 480, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.codePostal, { x: 80, y: 450, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.ville, { x: 220, y: 450, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.telephone, { x: 130, y: 420, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.email, { x: 130, y: 395, size: 8.5, font, color: inkColor });

  pTerrain.drawText(cerfaData.terrain.adresse, { x: 140, y: 515, size: 8.5, font, color: inkColor });
  pTerrain.drawText(`${cerfaData.terrain.codePostal} ${cerfaData.terrain.commune}`, { x: 140, y: 495, size: 8.5, font, color: inkColor });
  pTerrain.drawText(cerfaData.terrain.section || 'BD', { x: 130, y: 395, size: 9, font: boldFont, color: inkColor });
  pTerrain.drawText(cerfaData.terrain.numeroParcelle || '0141', { x: 220, y: 395, size: 9, font: boldFont, color: inkColor });
  pTerrain.drawText(`${cerfaData.terrain.superficieTerrainM2 || 597} m²`, { x: 350, y: 395, size: 9, font: boldFont, color: inkColor });

  const projetDesc = `Installation de ${cerfaData.projet.nombrePanneaux || 14} modules solaires photovoltaïques en surimposition de toiture existante (${cerfaData.projet.puissanceKwc || 6} kWc). Pose conforme sans modification de charpente, respect de l'alignement architectural.`;
  pProjet.drawText(projetDesc, {
    x: 55,
    y: 270,
    size: 8.5,
    font,
    color: inkColor,
    maxWidth: 480,
    lineHeight: 12,
  });

  // PAGE DP1
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

  pageDp1.drawText(`Commune : ${cerfaData.terrain.commune} (${cerfaData.terrain.codePostal}) | Réf. cadastrale : Section ${cerfaData.terrain.section || 'BD'} N° ${cerfaData.terrain.numeroParcelle || '0141'} | Superficie : ${cerfaData.terrain.superficieTerrainM2 || 597} m²`, {
    x: 52,
    y: height - 62,
    size: 8,
    font,
    color: rgb(0.35, 0.4, 0.5),
  });

  const coords = cerfaData.terrain.coordonnees || [2.6565, 48.8514];
  const [lon, lat] = coords;
  const delta = 0.0025;
  const ignWmsUrl = `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX=${lat - delta},${lon - delta * 1.3},${lat + delta},${lon + delta * 1.3}&CRS=EPSG:4326&WIDTH=1200&HEIGHT=900&LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png&STYLES=`;

  const res = await fetch(ignWmsUrl, { headers: { 'User-Agent': 'Notitia-DP-Engine/2.0' } });
  const ignBuffer = Buffer.from(await res.arrayBuffer());

  const mapOverlaySvg = `
    <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.3"/>
        </filter>
      </defs>
      <polygon points="560,405 645,395 655,475 570,485" 
               fill="rgba(239, 68, 68, 0.15)" 
               stroke="#dc2626" 
               stroke-width="3" 
               stroke-dasharray="8,4" 
               filter="url(#shadow)" />
      <circle cx="605" cy="440" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2.5" />
      <g transform="translate(625, 420)">
        <rect x="0" y="0" width="160" height="34" rx="4" fill="#ffffff" stroke="#dc2626" stroke-width="1.5" />
        <text x="10" y="14" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#111827">PARCELLE ${cerfaData.terrain.section || 'BD'} ${cerfaData.terrain.numeroParcelle || '0141'}</text>
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

  pageDp6.drawText('Représentation de l\'état initial existant et simulation de l\'état futur projeté avec modules solaires intégrés', {
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

  pageDp6.drawText('2. PROJET PROJETÉ — SIMULATION PHOTORÉALISTE DES MODULES PHOTOVOLTAÏQUES', {
    x: 42,
    y: height - 450,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.5, 0.2),
  });

  const metadata = await sharp(beforeBuffer).metadata();
  const imgWidth = metadata.width || 1200;
  const imgHeight = metadata.height || 800;

  const slots = generateSmartSolarGrid({
    roofWidth: imgWidth,
    roofHeight: imgHeight,
    panelCount: 14,
  });

  const panelW = Math.round(imgWidth * 0.058);
  const panelH = Math.round(imgHeight * 0.11);

  let svgPanels = '';
  slots.forEach((slot) => {
    const { x: px, y: py, skewX, skewY } = slot;
    svgPanels += `
      <g transform="skewX(${skewX}) skewY(${skewY})">
        <rect x="${px + 4}" y="${py + 4}" width="${panelW}" height="${panelH}" rx="2" fill="rgba(0,0,0,0.4)" />
        <rect x="${px}" y="${py}" width="${panelW}" height="${panelH}" rx="2" fill="#0b0f14" stroke="#1f2937" stroke-width="1.8" />
        <rect x="${px + 2}" y="${py + 2}" width="${panelW - 4}" height="${panelH - 4}" rx="1" fill="url(#solarGrad)" />
        <line x1="${px + 2}" y1="${py + panelH / 3}" x2="${px + panelW - 2}" y2="${py + panelH / 3}" stroke="#38bdf8" stroke-opacity="0.2" stroke-width="0.75" />
        <line x1="${px + 2}" y1="${py + (2 * panelH) / 3}" x2="${px + panelW - 2}" y2="${py + (2 * panelH) / 3}" stroke="#38bdf8" stroke-opacity="0.2" stroke-width="0.75" />
        <polygon points="${px + 2},${py + 2} ${px + panelW / 2},${py + 2} ${px + 2},${py + panelH - 4}" fill="url(#glassGleam)" opacity="0.28" />
      </g>
    `;
  });

  const svgOverlay = `
    <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="solarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="60%" stop-color="#050811" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
        <linearGradient id="glassGleam" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${svgPanels}
    </svg>
  `;

  const afterBuffer = await sharp(beforeBuffer)
    .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
    .jpeg({ quality: 98 })
    .toBuffer();

  const embeddedAfter = await finalPdfDoc.embedJpg(afterBuffer);
  pageDp6.drawImage(embeddedAfter, {
    x: 40,
    y: 65,
    width: width - 80,
    height: 365,
  });

  return await finalPdfDoc.save();
}

async function run() {
  const bytes = await generateDPPackPdf({
    cerfaData: {
      demandeur: {
        nom: 'LEFEBVRE',
        prenom: 'Thomas',
        email: 'thomas.lefebvre@pro-solaire.fr',
        telephone: '06 12 34 56 78',
        adresse: '14 Allée des Cerisiers',
        codePostal: '77200',
        ville: 'Torcy',
      },
      terrain: {
        adresse: '14 Allée des Cerisiers',
        commune: 'Torcy',
        codePostal: '77200',
        section: 'BD',
        numeroParcelle: '0141',
        superficieTerrainM2: 597,
        coordonnees: [2.6565, 48.8514],
      },
      projet: {
        nombrePanneaux: 14,
        puissanceKwc: 6.0,
      }
    }
  });

  fs.writeFileSync('DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf', bytes);
  console.log('SUCCESS: DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf written, size:', bytes.length);
}

run();
