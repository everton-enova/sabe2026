import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[SABE]  Iniciando consulta de indicação');
  
  try {
    const body = await request.json();
    console.log('[SABE] 📝 Body recebido:', { nte: body.nte, polo: body.polo });
    
    const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
    const webhookSecret = process.env.SABE_WEBHOOK_SECRET;
    
    console.log('[SABE] 🔑 Webhook URL configurada:', !!webhookUrl);
    console.log('[SABE] 🔑 Secret configurado:', !!webhookSecret);
    
    if (!webhookUrl || !webhookSecret) {
      console.error('[SABE] ❌ Variáveis de ambiente faltando');
      return NextResponse.json(
        { error: 'Configuração não encontrada', code: 'CONFIG_ERROR' },
        { status: 500 }
      );
    }

    console.log('[SABE] 🌐 Fazendo fetch para Apps Script...');
    console.log('[SABE] URL:', webhookUrl);
    
    // Aumentei o timeout para 60 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'indicacao',
        nte: body.nte,
        polo: body.polo,
        chave: webhookSecret,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const elapsed = Date.now() - startTime;
    console.log(`[SABE] ⏱️ Tempo de resposta: ${elapsed}ms`);
    console.log('[SABE] 📊 Status:', response.status);
    
    const result = await response.json();
    console.log('[SABE] 📄 Resposta:', JSON.stringify(result).substring(0, 500));

    if (result.code === 'ALREADY_VALIDATED') {
      return NextResponse.json(
        { error: 'Este polo já foi validado.', code: 'ALREADY_VALIDATED' },
        { status: 409 }
      );
    }

    if (!response.ok || result.ok === false) {
      return NextResponse.json(
        { error: result.message || 'Indicação não encontrada', code: result.code || 'NOT_FOUND' },
        { status: response.status || 404 }
      );
    }

    console.log('[SABE] ✅ Sucesso! Coordenador:', result.coordinator?.nome);
    return NextResponse.json(result.coordinator);
    
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[SABE] ❌ Erro após ${elapsed}ms:`, error.message);
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Tempo limite excedido. Tente novamente.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: 'Não foi possível consultar a indicação', code: 'ERROR' },
      { status: 500 }
    );
  }
}