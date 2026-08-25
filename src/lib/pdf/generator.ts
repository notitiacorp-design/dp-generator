import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { CerfaFormData, DPPackGenerationRequest } from '../../types/dp';
import { getInpaintingRouter } from '../ai/inpainting-router';
import { getVisionRouter } from '../ai/vision-router';

/**
 * Moteur d'assemblage conforme Cerfa 13404*12 & Dossier DP Réglementaire
 * Remplissage au millimètre sur les cases du formulaire officiel de l'État.
 */
export async function generateDPPackPdf(request: DPPackGenerationRequest): Promise<Uint8Array> {
  const { cerfaData } = request;

  // 1. Chargement du formulaire Cerfa officiel 13404*12
  const templatePath = path.join(process.cwd(), 'templates', 'cerfa_13404.pdf');
  const templateBytes = fs.readFileSync(templatePath);
  const templateDoc = await PDFDocument.load(templateBytes);
  const finalPdfDoc = await PDFDocument.create();

  // On extrait les pages réglementaires de la déclaration :
  // Page 4 (Demandeur), Page 5 (Terrain & Cadastre), Page 6 (Projet & Description)
  const [pDemandeur, pTerrain, pProjet] = await finalPdfDoc.copyPages(templateDoc, [3, 4, 5]);
  finalPdfDoc.addPage(pDemandeur);
  finalPdfDoc.addPage(pTerrain);
  finalPdfDoc.addPage(pProjet);

  const font = await finalPdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBold);
  const inkColor = rgb(0.05, 0.1, 0.35); // Encre bleu nuit administrative

  // =========================================================================
  // PAGE 4 : CADRE 1 - IDENTITÉ DU DEMANDEUR
  // =========================================================================
  
  // Nom & Prénom (boîtes ytop=784, ybottom=769)
  pDemandeur.drawText((cerfaData.demandeur.nom || 'LEFEBVRE').toUpperCase(), { x: 58, y: 776, size: 9, font: boldFont, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.prenom || 'Thomas', { x: 320, y: 776, size: 9, font: boldFont, color: inkColor });

  // Date et lieu de naissance — champs distincts (déterminé par analyse du template)
  // Date (8 cases : ytop=764, ybottom=749), Commune (ytop=744 x=105 w=340), Département (3 cases ytop=724), Pays (ytop=724 x=216)
  // Date de naissance — découpée case par case (8 cases : x de 208 à 348, ytop=764/bottom=749, larg 14, pas ~19)
  const naissance = (cerfaData.demandeur.dateNaissance || '15/04/1985').replace(/\//g, '');
  const dateDigits = naissance.slice(0, 8).padEnd(8, ' ').split('');
  dateDigits.forEach((d, i) => {
    if (d === ' ') return;
    pDemandeur.drawText(d, { x: 209 + i * 19, y: 756, size: 9, font: boldFont, color: inkColor });
  });
  pDemandeur.drawText(cerfaData.demandeur.lieuNaissance || 'Paris', { x: 110, y: 733, size: 8.5, font, color: inkColor });
  pDemandeur.drawText((cerfaData.demandeur as any).deptNaissance || '75', { x: 119, y: 713, size: 8.5, font, color: inkColor });
  pDemandeur.drawText((cerfaData.demandeur as any).paysNaissance || 'France', { x: 220, y: 714, size: 8.5, font, color: inkColor });

  // Adresse postale — Numéro (x=143 ytop=519), Voie (x=260), Localité (ytop=499), Code postal (cases ytop=459)
  const addr = cerfaData.demandeur.adresse || '14 Allée des Cerisiers';
  const numVoie = addr.split(' ')[0] || '14';
  const nomVoie = addr.replace(numVoie, '').trim() || 'Allée des Cerisiers';

  pDemandeur.drawText(numVoie, { x: 145, y: 507, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(nomVoie, { x: 264, y: 507, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.ville || 'Torcy', { x: 97, y: 471, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.codePostal || '77200', { x: 114, y: 448, size: 8.5, font, color: inkColor });

  // Coordonnées de contact — Téléphone (cases ytop=439) & Email (champ au-dessus de @, ytop=369)
  pDemandeur.drawText(cerfaData.demandeur.telephone || '06 12 34 56 78', { x: 113, y: 428, size: 8.5, font, color: inkColor });
  pDemandeur.drawText(cerfaData.demandeur.email || 'thomas.lefebvre@pro-solaire.fr', { x: 54, y: 358, size: 8.5, font, color: inkColor });

  // =========================================================================
  // PAGE 5 : CADRE 2 & 3 - TERRAIN DU PROJET & CADASTRE
  // =========================================================================
  
  // Adresse du terrain
  const tAddr = cerfaData.terrain.adresse || '14 Allée des Cerisiers';
  const tNumVoie = tAddr.split(' ')[0] || '14';
  const tNomVoie = tAddr.replace(tNumVoie, '').trim() || 'Allée des Cerisiers';
  
  pTerrain.drawText(tNumVoie, { x: 95, y: 512, size: 8.5, font, color: inkColor });
  pTerrain.drawText(tNomVoie, { x: 180, y: 512, size: 8.5, font, color: inkColor });
  pTerrain.drawText(cerfaData.terrain.codePostal || '77200', { x: 110, y: 475, size: 8.5, font, color: inkColor });
  pTerrain.drawText(cerfaData.terrain.commune || 'Torcy', { x: 280, y: 475, size: 8.5, font, color: inkColor });

  // Références cadastrales (Section / Numéro / Superficie) — calé au millimétre sur les cases réelles
  pTerrain.drawText(cerfaData.terrain.section || 'BD', { x: 183, y: 401, size: 9, font: boldFont, color: inkColor });
  pTerrain.drawText(cerfaData.terrain.numeroParcelle || '0141', { x: 253, y: 401, size: 9, font: boldFont, color: inkColor });
  pTerrain.drawText(`${cerfaData.terrain.superficieTerrainM2 || 597} m²`, { x: 465, y: 401, size: 9, font: boldFont, color: inkColor });

  // =========================================================================
  // PAGE 6 : CADRE 5 - COURTE DESCRIPTION DES TRAVAUX
  // =========================================================================
  const projetDesc = `Installation de ${cerfaData.projet.nombrePanneaux || 14} modules solaires photovoltaïques monocristallins full-black (${cerfaData.projet.puissanceKwc || 6.0} kWc) en surimposition sur pan de toiture existant. Pose en champ continu régulier avec intégration soignée, préservation des ouvrants et de la toiture sans altération du gros œuvre.`;
  pProjet.drawText(projetDesc, {
    x: 52,
    y: 280,
    size: 8.5,
    font,
    color: inkColor,
    maxWidth: 490,
    lineHeight: 12,
  });

  // =========================================================================
  // PAGE ANNEXE DP1 : PLAN DE SITUATION DU TERRAIN (IGN HD + PARCELLE ROUGE)
  // =========================================================================
  const pageDp1 = finalPdfDoc.addPage([595.28, 841.89]);
  const { width, height } = pageDp1.getSize();

  // En-tête normé DP1
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

  // Récupération de la carte IGN et traçage du polygone rouge
  const coords = cerfaData.terrain.coordonnees || [2.6565, 48.8514];
  const [lon, lat] = coords;
  const delta = 0.0025;
  const ignWmsUrl = `https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX=${lat - delta},${lon - delta * 1.3},${lat + delta},${lon + delta * 1.3}&CRS=EPSG:4326&WIDTH=1200&HEIGHT=900&LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png&STYLES=`;

  try {
    const res = await fetch(ignWmsUrl, { headers: { 'User-Agent': 'Notitia-DP-Engine/2.0' } });
    if (res.ok) {
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

      // Cartouche technique
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
    }
  } catch (e) {
    console.warn('Erreur chargement IGN WMS pour DP1:', e);
  }

  // =========================================================================
  // PAGE ANNEXE DP6 : DOCUMENT D'INSERTION DANS LE PAYSAGE (AVANT / APRÈS)
  // =========================================================================
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

  // Photo 1 : État initial (Avant)
  pageDp6.drawText('1. ÉTAT INITIAL EXISTANT (AVANT TRAVAUX)', {
    x: 42,
    y: height - 90,
    size: 9,
    font: boldFont,
    color: rgb(0.15, 0.2, 0.3),
  });

  let beforeBuffer: Buffer | null = null;
  if (request.dp6BeforeImageBase64) {
    const clean = request.dp6BeforeImageBase64.replace(/^data:image\/\w+;base64,/, '');
    beforeBuffer = Buffer.from(clean, 'base64');
  } else {
    const samplePath = path.join(process.cwd(), 'sample_roof.jpg');
    if (fs.existsSync(samplePath)) {
      beforeBuffer = fs.readFileSync(samplePath);
    }
  }

  if (beforeBuffer) {
    const embeddedBefore = (beforeBuffer[0] === 0x89)
      ? await finalPdfDoc.embedPng(beforeBuffer)
      : await finalPdfDoc.embedJpg(beforeBuffer);

    pageDp6.drawImage(embeddedBefore, {
      x: 40,
      y: height - 425,
      width: width - 80,
      height: 320,
    });
  }

  // Photo 2 : État projeté (Après avec calepinage continu et inpainting)
  pageDp6.drawText('2. PROJET PROJETÉ — INSERTION PHOTORÉALISTE DU CHAMP PHOTOVOLTAÏQUE', {
    x: 42,
    y: height - 450,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.5, 0.2),
  });

  let afterBuffer: Buffer | null = null;
  if (request.dp6AfterImageBase64) {
    const clean = request.dp6AfterImageBase64.replace(/^data:image\/\w+;base64,/, '');
    afterBuffer = Buffer.from(clean, 'base64');
  } else if (beforeBuffer) {
    // Analyse vision pour détection du polygone puis Inpainting IA
    const vision = getVisionRouter();
    const beforeB64 = `data:image/jpeg;base64,${beforeBuffer.toString('base64')}`;
    const detection = await vision.detectRoof(beforeB64);

    const router = getInpaintingRouter();
    const simRes = await router.generateInsertion({
      imageBase64: beforeB64,
      roofPolygon: detection.roofPolygon,
      panelCount: cerfaData.projet.nombrePanneaux || 14,
      projectType: 'SOLAR_PANELS',
    });
    const cleanAfter = (simRes.imageBase64 || simRes.imageUrl || '').replace(/^data:image\/\w+;base64,/, '');
    if (cleanAfter) {
      afterBuffer = Buffer.from(cleanAfter, 'base64');
    }
  }

  if (afterBuffer) {
    const embeddedAfter = (afterBuffer[0] === 0x89)
      ? await finalPdfDoc.embedPng(afterBuffer)
      : await finalPdfDoc.embedJpg(afterBuffer);

    pageDp6.drawImage(embeddedAfter, {
      x: 40,
      y: 65,
      width: width - 80,
      height: 365,
    });
  }

  return await finalPdfDoc.save();
}
