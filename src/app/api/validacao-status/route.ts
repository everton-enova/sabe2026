import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    const response = await fetch(
      `${webhookUrl}?acao=validados&nte=${encodeURIComponent(nte)}&mode=${mode}&chave=${encodeURIComponent(webhookSecret)}`,
      { method: 'GET', signal: AbortSignal.timeout(55000) }
    );

    const text = await response.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      return NextResponse.json({ validated: [] });
    }

    return NextResponse.json({ validated: result.validated || [] });
  } catch {
    return NextResponse.json({ validated: [] });
  }
}