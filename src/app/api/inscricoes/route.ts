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
        { error: 'Configuração da planilha não encontrada', code: 'CONFIG_ERROR' },
        { status: 500 }
      );
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        chave: webhookSecret,
        enviadoEm: new Date().toISOString(),
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

    if (!response.ok || result.ok === false) {
      return NextResponse.json(
        { error: result.message || 'Erro ao salvar na planilha', code: result.code || 'ERROR' },
        { status: response.status || 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json(
        { error: 'A planilha demorou demais para responder. Tente novamente.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível acessar a planilha. Tente novamente.', code: 'ERROR' },
      { status: 500 }
    );
  }
}