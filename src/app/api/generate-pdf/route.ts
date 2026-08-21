import { NextRequest, NextResponse } from 'next/server';
import { generateDPPackPdf } from '@/lib/pdf/generator';
import { DPPackGenerationRequest } from '@/types/dp';

export async function POST(request: NextRequest) {
  try {
    const body: DPPackGenerationRequest = await request.json();

    if (!body.cerfaData) {
      return NextResponse.json({ error: 'Données Cerfa requises' }, { status: 400 });
    }

    // Génération du flux binaire PDF
    const pdfBytes = await generateDPPackPdf(body);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Dossier_DP_${body.cerfaData.demandeur.nom || 'Complet'}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Erreur Génération PDF:', error);
    return NextResponse.json({ error: error.message || 'Erreur lors de la génération PDF' }, { status: 500 });
  }
}
