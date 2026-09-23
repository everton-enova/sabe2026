import { NextResponse } from 'next/server';

export async function GET() {
  const webhookUrl = process.env.SABE_SHEETS_WEBHOOK_URL;
  const webhookSecret = process.env.SABE_WEBHOOK_SECRET;
  
  const diagnostico = {
    timestamp: new Date().toISOString(),
    variaveis: {
      webhookUrl: webhookUrl ? '✅ Configurada' : '❌ Faltando',
      webhookSecret: webhookSecret ? '✅ Configurado' : ' Faltando',
      urlCompleta: webhookUrl || 'N/A'
    },
    testeAppsScript: null as any
  };
  
  if (webhookUrl && webhookSecret) {
    try {
      const startTime = Date.now();
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'indicacao',
          nte: 'NTE 01',
          polo: 'AMÉRICA DOURADA',
          chave: webhookSecret,
        }),
        signal: AbortSignal.timeout(30000),
      });
      
      const elapsed = Date.now() - startTime;
      const result = await response.json();
      
      diagnostico.testeAppsScript = {
        status: response.status,
        tempo: `${elapsed}ms`,
        resposta: result,
        sucesso: response.ok && result.ok !== false
      };
    } catch (error: any) {
      diagnostico.testeAppsScript = {
        erro: error.message,
        tipo: error.name
      };
    }
  }
  
  return NextResponse.json(diagnostico);
}