import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
    const webhookSecret = process.env.SABE_WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
      return NextResponse.json(
        { error: 'Configuração não encontrada', code: 'CONFIG_ERROR' },
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
      signal: AbortSignal.timeout(55000),
    });

    const text = await response.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Resposta inválida da planilha. Tente novamente.', code: 'BAD_JSON' },
        { status: 502 }
      );
    }

    if (result.code === 'ALREADY_VALIDATED') {
      return NextResponse.json(
        { error: 'Este polo já foi validado.', code: 'ALREADY_VALIDATED' },
        { status: 409 }
      );
    }

    if (!response.ok || result.ok === false || !result.coordinator) {
      return NextResponse.json(
        { error: result.message || 'Indicação não encontrada', code: result.code || 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.coordinator);
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json(
        { error: 'A planilha demorou demais para responder. Tente novamente.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível consultar a indicação', code: 'ERROR' },
      { status: 500 }
    );
  }
}