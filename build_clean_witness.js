import { generateDPPackPdf } from './src/lib/pdf/generator.js';
import * as fs from 'fs';

async function buildCleanWitness() {
  const roof = fs.readFileSync('sample_roof.jpg');
  const b64 = `data:image/jpeg;base64,${roof.toString('base64')}`;

  const bytes = await generateDPPackPdf({
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
    dp6BeforeImageBase64: b64,
  });

  fs.writeFileSync('DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf', Buffer.from(bytes));
  console.log('Regenerated DOSSIER_DP_LEFEBVRE_OFFICIEL.pdf cleanly!');
}

buildCleanWitness().catch(console.error);
