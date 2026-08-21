import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';

async function testPlacement() {
  const bytes = fs.readFileSync('templates/cerfa_13404.pdf');
  const srcDoc = await PDFDocument.load(bytes);
  const doc = await PDFDocument.create();

  const [p4, p5, p6] = await doc.copyPages(srcDoc, [3, 4, 5]);
  doc.addPage(p4);
  doc.addPage(p5);
  doc.addPage(p6);

  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.9, 0.1, 0.1); // rouge pour bien voir l'alignement sur les cases

  // PAGE 4 (Demandeur)
  // Nom & Prénom
  p4.drawText('LEFEBVRE', { x: 80, y: 787, size: 9, font, color });
  p4.drawText('Thomas', { x: 360, y: 787, size: 9, font, color });
  
  // Date de naissance & Lieu
  p4.drawText('15/04/1985', { x: 120, y: 747, size: 8.5, font, color });
  p4.drawText('Paris', { x: 230, y: 747, size: 8.5, font, color });
  p4.drawText('75', { x: 380, y: 747, size: 8.5, font, color });
  p4.drawText('France', { x: 450, y: 747, size: 8.5, font, color });

  // Adresse
  // Numéro / Voie / Lieu-dit / Localité / CP / BP / Cedex
  p4.drawText('14', { x: 95, y: 488, size: 8.5, font, color });
  p4.drawText('Allée des Cerisiers', { x: 180, y: 488, size: 8.5, font, color });
  p4.drawText('77200', { x: 110, y: 450, size: 8.5, font, color });
  p4.drawText('Torcy', { x: 280, y: 450, size: 8.5, font, color });

  // Téléphone & Courriel
  p4.drawText('06 12 34 56 78', { x: 140, y: 422, size: 8.5, font, color });
  p4.drawText('thomas.lefebvre@pro-solaire.fr', { x: 80, y: 350, size: 8.5, font, color });

  // PAGE 5 (Terrain & Cadastre)
  // Adresse terrain
  p5.drawText('14', { x: 95, y: 512, size: 8.5, font, color });
  p5.drawText('Allée des Cerisiers', { x: 180, y: 512, size: 8.5, font, color });
  p5.drawText('77200', { x: 110, y: 475, size: 8.5, font, color });
  p5.drawText('Torcy', { x: 280, y: 475, size: 8.5, font, color });

  // Cadastre : Section / Numéro / Superficie
  p5.drawText('BD', { x: 115, y: 395, size: 9, font, color });
  p5.drawText('0141', { x: 210, y: 395, size: 9, font, color });
  p5.drawText('597 m²', { x: 350, y: 395, size: 9, font, color });

  // PAGE 6 (Descriptif projet)
  const desc = "Installation de 14 modules photovoltaïques monocristallins (6.0 kWc) en surimposition sur pan de toiture existant. Pose intégrée et soignée, respectant l'harmonie architecturale et l'évitement des ouvrants.";
  p6.drawText(desc, { x: 52, y: 280, size: 8.5, font, color, maxWidth: 490, lineHeight: 12 });

  fs.writeFileSync('test_alignment_output.pdf', await doc.save());
  console.log('Saved test_alignment_output.pdf');
}

testPlacement();
