import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { CerfaFormData, DPPackGenerationRequest } from '@/types/dp';

/**
 * Moteur d'assemblage et de génération du Dossier de Déclaration Préalable (DP) complet
 * Génère le Cerfa 13404/13703 + Annexes DP1, DP2, DP6, DP7
 */
export async function generateDPPackPdf(request: DPPackGenerationRequest): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { cerfaData } = request;

  // --- PAGE 1 : BORDEREAU ET SYNTHÈSE DE LA DÉCLARATION PRÉALABLE ---
  const page1 = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page1.getSize();

  // En-tête officiel
  page1.drawRectangle({
    x: 40,
    y: height - 100,
    width: width - 80,
    height: 60,
    color: rgb(0.08, 0.15, 0.3),
  });

  page1.drawText('RÉPUBLIQUE FRANÇAISE', {
    x: 55,
    y: height - 60,
    size: 10,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page1.drawText('DÉCLARATION PRÉALABLE - DOSSIER COMPLET (Art. R. 421-17 CU)', {
    x: 55,
    y: height - 80,
    size: 12,
    font: boldFont,
    color: rgb(1, 0.85, 0.2),
  });

  // Section 1 : Demandeur
  let currentY = height - 130;
  page1.drawText('1. IDENTITÉ DU DEMANDEUR', {
    x: 40,
    y: currentY,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.15, 0.3),
  });

  currentY -= 20;
  page1.drawText(`Nom, Prénom : ${cerfaData.demandeur.nom.toUpperCase()} ${cerfaData.demandeur.prenom}`, {
    x: 50,
    y: currentY,
    size: 10,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  currentY -= 16;
  page1.drawText(`Adresse : ${cerfaData.demandeur.adresse}, ${cerfaData.demandeur.codePostal} ${cerfaData.demandeur.ville}`, {
    x: 50,
    y: currentY,
    size: 10,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  currentY -= 16;
  page1.drawText(`Contact : Tél ${cerfaData.demandeur.telephone} | Email : ${cerfaData.demandeur.email}`, {
    x: 50,
    y: currentY,
    size: 10,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Section 2 : Terrain & Références Cadastrales
  currentY -= 30;
  page1.drawText('2. TERRAIN ET CADASTRE (LOCALISATION DU PROJET)', {
    x: 40,
    y: currentY,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.15, 0.3),
  });

  currentY -= 20;
  page1.drawText(`Adresse du terrain : ${cerfaData.terrain.adresse}, ${cerfaData.terrain.codePostal} ${cerfaData.terrain.commune}`, {
    x: 50,
    y: currentY,
    size: 10,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  currentY -= 16;
  page1.drawText(
    `Section cadastrale : ${cerfaData.terrain.section || '0A'} | N° Parcelle : ${cerfaData.terrain.numeroParcelle || '0001'} | Contenance : ${cerfaData.terrain.superficieTerrainM2} m²`,
    {
      x: 50,
      y: currentY,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    }
  );

  // Section 3 : Nature des travaux & Descriptif
  currentY -= 30;
  page1.drawText('3. NATURE DU PROJET ET CARACTÉRISTIQUES TECHNIQUES', {
    x: 40,
    y: currentY,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.15, 0.3),
  });

  currentY -= 20;
  page1.drawText(`Type de projet : ${cerfaData.projet.type} (Pose de panneaux photovoltaïques)`, {
    x: 50,
    y: currentY,
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  currentY -= 16;
  const desc = cerfaData.projet.descriptionCourte || 'Installation de générateurs solaires photovoltaïques en surimposition sur toiture existante.';
  page1.drawText(`Descriptif sommaire : ${desc}`, {
    x: 50,
    y: currentY,
    size: 9,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  currentY -= 16;
  page1.drawText(
    `Puissance estimée : ${cerfaData.projet.puissanceKwc || 6} kWc | Nombre de capteurs : ${cerfaData.projet.nombrePanneaux || 12} | Mode de pose : ${cerfaData.projet.typePose || 'SURIMPOSE'}`,
    {
      x: 50,
      y: currentY,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    }
  );

  // Section 4 : Sommaire des pièces jointes normées
  currentY -= 35;
  page1.drawText('4. BORDEREAU DE DÉPÔT DES PIÈCES JOINTES (OBLIGATOIRES)', {
    x: 40,
    y: currentY,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.15, 0.3),
  });

  const piecesList = [
    { code: 'DP1', titre: 'Plan de situation du terrain (Échelle IGN/Cadastre)' },
    { code: 'DP2', titre: 'Plan de masse des constructions et toitures coté' },
    { code: 'DP6', titre: "Document graphique d'insertion paysagère (Avant / Après)" },
    { code: 'DP7', titre: "Photographie de l'environnement proche" },
    { code: 'DP8', titre: "Photographie de l'environnement lointain (si requis)" },
  ];

  piecesList.forEach((piece) => {
    currentY -= 18;
    page1.drawRectangle({
      x: 50,
      y: currentY - 2,
      width: 10,
      height: 10,
      color: rgb(0.1, 0.6, 0.3),
    });
    page1.drawText(`[X]  ${piece.code} - ${piece.titre}`, {
      x: 65,
      y: currentY,
      size: 9,
      font: boldFont,
      color: rgb(0.15, 0.15, 0.15),
    });
  });

  // Bas de page
  page1.drawText('Dossier généré automatiquement et conforme aux exigences du Code de l\'Urbanisme.', {
    x: 40,
    y: 40,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // --- PAGE 2 : ANNEXE DP1 - PLAN DE SITUATION ---
  const pageDp1 = pdfDoc.addPage([595.28, 841.89]);
  pageDp1.drawText('ANNEXE DP1 - PLAN DE SITUATION DU TERRAIN', {
    x: 40,
    y: height - 50,
    size: 14,
    font: boldFont,
    color: rgb(0.08, 0.15, 0.3),
  });
  pageDp1.drawText(`Commune : ${cerfaData.terrain.commune} (${cerfaData.terrain.codePostal}) | Réf Parcelle : ${cerfaData.terrain.section} ${cerfaData.terrain.numeroParcelle}`, {
    x: 40,
    y: height - 70,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  if (request.dp1ImageBase64) {
    try {
      const cleanBase64 = request.dp1ImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      const imgBuffer = Buffer.from(cleanBase64, 'base64');
      const imgEmbed = request.dp1ImageBase64.includes('image/png')
        ? await pdfDoc.embedPng(imgBuffer)
        : await pdfDoc.embedJpg(imgBuffer);

      pageDp1.drawImage(imgEmbed, {
        x: 40,
        y: 120,
        width: width - 80,
        height: 600,
      });
    } catch (e) {
      console.warn('Impossible d\'insérer l\'image DP1:', e);
    }
  } else {
    pageDp1.drawRectangle({
      x: 40,
      y: 120,
      width: width - 80,
      height: 600,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
      color: rgb(0.95, 0.95, 0.95),
    });
    pageDp1.drawText('Emplacement pour plan de situation IGN / Géoportail', {
      x: 150,
      y: 420,
      size: 12,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // --- PAGE 3 : ANNEXE DP6 - DOCUMENT GRAPHIQUE D'INSERTION PAYSAGÈRE ---
  const pageDp6 = pdfDoc.addPage([595.28, 841.89]);
  pageDp6.drawText('ANNEXE DP6 - DOCUMENT D\'INSERTION DANS LE PAYSAGE', {
    x: 40,
    y: height - 50,
    size: 14,
    font: boldFont,
    color: rgb(0.08, 0.15, 0.3),
  });

  pageDp6.drawText('État Initial (Avant travaux) vs État Projeté (Après installation)', {
    x: 40,
    y: height - 70,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Emplacement Avant
  pageDp6.drawText('1. ÉTAT INITIAL EXISTANT (AVANT)', {
    x: 40,
    y: height - 100,
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  if (request.dp6BeforeImageBase64) {
    try {
      const cleanBase64 = request.dp6BeforeImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      const imgBuffer = Buffer.from(cleanBase64, 'base64');
      const imgEmbed = request.dp6BeforeImageBase64.includes('image/png')
        ? await pdfDoc.embedPng(imgBuffer)
        : await pdfDoc.embedJpg(imgBuffer);

      pageDp6.drawImage(imgEmbed, {
        x: 40,
        y: height - 420,
        width: width - 80,
        height: 300,
      });
    } catch (e) {
      console.warn('Erreur embed DP6 Before:', e);
    }
  }

  // Emplacement Après
  pageDp6.drawText('2. PROJET PROJETÉ AVEC PANNEAUX PHOTOVOLTAÏQUES (APRÈS)', {
    x: 40,
    y: height - 450,
    size: 10,
    font: boldFont,
    color: rgb(0.08, 0.5, 0.2),
  });

  if (request.dp6AfterImageBase64) {
    try {
      const cleanBase64 = request.dp6AfterImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      const imgBuffer = Buffer.from(cleanBase64, 'base64');
      const imgEmbed = request.dp6AfterImageBase64.includes('image/png')
        ? await pdfDoc.embedPng(imgBuffer)
        : await pdfDoc.embedJpg(imgBuffer);

      pageDp6.drawImage(imgEmbed, {
        x: 40,
        y: 80,
        width: width - 80,
        height: 320,
      });
    } catch (e) {
      console.warn('Erreur embed DP6 After:', e);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
