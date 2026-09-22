import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nte = searchParams.get('nte');
    const mode = searchParams.get('mode');
    
    if (!nte || mode !== 'cp') {
      return NextResponse.json({ validated: [] });
    }

    const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
    const webhookSecret = process.env.SABE_WEBHOOK_SECRET;
    
    if (!webhookUrl || !webhookSecret) {
      return NextResponse.json({ validated: [] });
    }

    // Consulta ao Apps Script
    const response = await fetch(`${webhookUrl}?acao=validados&nte=${encodeURIComponent(nte)}&chave=${webhookSecret}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json({ validated: [] });
    }

    const result = await response.json();
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[SABE] Erro ao buscar validacao-status:', error);
    return NextResponse.json({ validated: [] });
  }
}