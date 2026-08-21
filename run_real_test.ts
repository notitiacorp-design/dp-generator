import { generateDPPackPdf } from './src/lib/pdf/generator';
import fs from 'fs';

async function runRealTest() {
  const roofBuffer = fs.readFileSync('/home/openclaw/dp-generator/sample_roof.jpg');
  const roofBase64 = `data:image/jpeg;base64,${roofBuffer.toString('base64')}`;

  // 1. Inpainting réel
  const inpaintRes = await fetch('http://localhost:3000/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'inpaint_dp6',
      imageBase64: roofBase64,
      panelCount: 14,
    }),
  });
  const inpaintData = await inpaintRes.json();
  const afterImageBase64 = inpaintData.result?.imageUrl || inpaintData.result?.imageBase64;
  console.log('Inpainting result status:', inpaintData.success, 'provider:', inpaintData.result?.providerUsed);

  // 2. Génération PDF avec les vraies images
  const request = {
    cerfaData: {
      demandeur: {
        nom: 'LEFEBVRE',
        prenom: 'Claire',
        adresse: '1 Rue de Paris',
        codePostal: '77200',
        ville: 'Torcy',
        telephone: '06 98 76 54 32',
        email: 'claire.lefebvre@example.fr',
        qualite: 'PROPRIETAIRE' as const,
      },
      terrain: {
        adresse: '1 Rue de Paris, 77200 Torcy',
        codePostal: '77200',
        commune: 'Torcy',
        section: 'BD',
        numeroParcelle: '0141',
        superficieTerrainM2: 597,
        coordonnees: [2.6565, 48.8514] as [number, number],
      },
      projet: {
        type: 'SOLAR_PANELS' as const,
        descriptionCourte: 'Pose de 14 modules solaires photovoltaïques full-black (5.95 kWc) en surimposition sur toiture existante.',
        puissanceKwc: 5.95,
        nombrePanneaux: 14,
        typePose: 'SURIMPOSE' as const,
        empriseSolM2: 0,
      },
      pieces: {
        dp1: true,
        dp2: true,
        dp3: false,
        dp6: true,
        dp7: true,
        dp8: false,
      },
    },
    dp6BeforeImageBase64: roofBase64,
    dp6AfterImageBase64: afterImageBase64,
  };

  const pdfBytes = await generateDPPackPdf(request);
  fs.writeFileSync('/home/openclaw/dp-generator/test_output_LEFEBVRE_REAL.pdf', Buffer.from(pdfBytes));
  console.log('PDF généré avec succès ! Taille:', pdfBytes.length, 'octets');
}

runRealTest().catch(console.error);
