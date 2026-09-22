import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
    const webhookSecret = process.env.SABE_WEBHOOK_SECRET;
    
    // Validação das variáveis de ambiente
    if (!webhookUrl) {
      console.error('[SABE] SABE_SHEETS_WEBHOOK_URL não configurada');
      return NextResponse.json(
        { error: 'Configuração da planilha não encontrada. Contate o administrador.' },
        { status: 500 }
      );
    }

    if (!webhookSecret) {
      console.error('[SABE] SABE_WEBHOOK_SECRET não configurada');
      return NextResponse.json(
        { error: 'Configuração de segurança não encontrada. Contate o administrador.' },
        { status: 500 }
      );
    }

    console.log('[SABE] Enviando dados para a planilha...', {
      modalidade: body.modalidade,
      nte: body.nte,
      local: body.local,
      acao: body.acao
    });

    // Faz a requisição para o Google Apps Script
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        chave: webhookSecret,
        enviadoEm: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(30000), // Timeout de 30 segundos
    });

    const result = await response.json();
    console.log('[SABE] Resposta do Apps Script:', result);

    // Se o Apps Script retornou erro
    if (!response.ok || result.ok === false) {
      const errorMessage = result.message || result.code || 'Erro desconhecido';
      
      // Tratamento específico para duplicidade
      if (result.code === 'DUPLICATE') {
        return NextResponse.json(
          { error: 'Este NTE e Polo/Município já possui um registro validado. Alterações só podem ser feitas manualmente na planilha.', code: 'DUPLICATE' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status || 400 }
      );
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('[SABE] Erro na API de inscrições:', error);
    
    // Tratamento de timeout
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Tempo limite excedido ao tentar salvar na planilha. Tente novamente.' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: 'Não foi possível acessar a planilha. Tente novamente em alguns instantes.' },
      { status: 500 }
    );
  }
}