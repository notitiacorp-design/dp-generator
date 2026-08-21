import { generateDPPackPdf } from './src/lib/pdf/generator';
import * as fs from 'fs';

async function runWitnessTest() {
  console.log('Generating witness PDF pack with official Cerfa, IGN contour, and DP6 avoidance...');
  const sampleRoofBuffer = fs.readFileSync('sample_roof.jpg');
  const sampleBase64 = `data:image/jpeg;base64,${sampleRoofBuffer.toString('base64')}`;

  const pdfBytes = await generateDPPackPdf({
    cerfaData: {
      demandeur: {
        qualite: 'PROPRIETAIRE',
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
        type: 'SOLAR_PANELS',
        puissanceKwc: 6.0,
        nombrePanneaux: 14,
        typePose: 'SURIMPOSE',
        descriptionCourte: 'Pose de 14 panneaux photovoltaïques (6 kWc) en surimposition de toiture existante.',
      },
      pieces: {
        dp1: true,
        dp2: true,
        dp3: false,
        dp6: true,
        dp7: false,
        dp8: false,
      },
    },
    dp6BeforeImageBase64: sampleBase64,
  });

  const outputPath = 'DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf';
  fs.writeFileSync(outputPath, Buffer.from(pdfBytes));
  console.log(`Successfully written ${pdfBytes.length} bytes to ${outputPath}`);
}

runWitnessTest().catch(console.error);
