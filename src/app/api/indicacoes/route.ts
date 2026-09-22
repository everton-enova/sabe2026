import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
    const webhookSecret = process.env.SABE_WEBHOOK_SECRET;
    
    if (!webhookUrl || !webhookSecret) {
      return NextResponse.json(
        { error: 'Configuração não encontrada' },
        { status: 500 }
      );
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'indicacao',
        nte: body.nte,
        polo: body.polo,
        chave: webhookSecret,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json();

    if (!response.ok || result.ok === false) {
      return NextResponse.json(
        { error: result.message || 'Indicação não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.coordinator);
    
  } catch (error) {
    console.error('[SABE] Erro na API de indicações:', error);
    return NextResponse.json(
      { error: 'Não foi possível consultar a indicação' },
      { status: 500 }
    );
  }
}