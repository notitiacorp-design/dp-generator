import { generateDPPackPdf } from './src/lib/pdf/generator';
import { CerfaFormData, DPPackGenerationRequest } from './src/types/dp';
import * as fs from 'fs';

async function runEndToEndValidation() {
  console.log("=== EXECUTION DU CRASH-TEST COMPLET DES 2 CAS ===");

  const cases = [
    {
      id: "Cas 1 (Standard - Toiture droite)",
      cerfa: {
        demandeur: {
          nom: "MARTIN",
          prenom: "Alexandre",
          adresse: "12 Avenue Jean Moulin",
          codePostal: "34500",
          ville: "Béziers",
          telephone: "06 11 22 33 44",
          email: "alexandre.martin@example.fr",
          qualite: "PROPRIETAIRE" as const
        },
        terrain: {
          adresse: "12 Avenue Jean Moulin",
          codePostal: "34500",
          commune: "Béziers",
          section: "OZ",
          numeroParcelle: "0018",
          superficieTerrainM2: 160,
          coordonnees: [3.220751, 43.347227] as [number, number]
        },
        projet: {
          type: "SOLAR_PANELS" as const,
          descriptionCourte: "Pose de 12 modules photovoltaïques en surimposition sur toiture tuiles existante.",
          puissanceKwc: 5.1,
          nombrePanneaux: 12,
          surfaceCapteursM2: 24,
          typePose: "SURIMPOSE" as const,
          empriseSolM2: 0,
          surfacePlancherCreeM2: 0,
          hauteurMaxM: 6.8
        },
        pieces: { dp1: true, dp2: true, dp3: false, dp6: true, dp7: true, dp8: false }
      }
    },
    {
      id: "Cas 2 (Complexe - Toiture asymétrique & Velux)",
      cerfa: {
        demandeur: {
          nom: "LEFEBVRE",
          prenom: "Claire",
          adresse: "1 Rue de Paris",
          codePostal: "77200",
          ville: "Torcy",
          telephone: "06 99 88 77 66",
          email: "claire.lefebvre@example.fr",
          qualite: "PROPRIETAIRE" as const
        },
        terrain: {
          adresse: "1 Rue de Paris",
          codePostal: "77200",
          commune: "Torcy",
          section: "BD",
          numeroParcelle: "0141",
          superficieTerrainM2: 597,
          coordonnees: [2.647102, 48.85856] as [number, number]
        },
        projet: {
          type: "SOLAR_PANELS" as const,
          descriptionCourte: "Installation de 16 panneaux solaires avec contournement de fenêtre de toit existante.",
          puissanceKwc: 6.8,
          nombrePanneaux: 16,
          surfaceCapteursM2: 32,
          typePose: "SURIMPOSE" as const,
          empriseSolM2: 0,
          surfacePlancherCreeM2: 0,
          hauteurMaxM: 7.2
        },
        pieces: { dp1: true, dp2: true, dp3: false, dp6: true, dp7: true, dp8: false }
      }
    }
  ];

  for (const c of cases) {
    console.log(`\nTesting PDF Generation for: ${c.id}...`);
    const req: DPPackGenerationRequest = {
      cerfaData: c.cerfa as CerfaFormData
    };
    const pdfBytes = await generateDPPackPdf(req);
    const filename = `/home/openclaw/dp-generator/test_output_${c.cerfa.demandeur.nom}.pdf`;
    fs.writeFileSync(filename, Buffer.from(pdfBytes));
    console.log(`✓ PDF Pack généré avec succès (${pdfBytes.length} octets) -> ${filename}`);
  }

  console.log("\n=== CRASH-TEST TERMINE AVEC SUCCES ===");
}

runEndToEndValidation().catch(console.error);
