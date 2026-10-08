#!/usr/bin/env node

/**
 * Script para recuperar dados que não foram gravados na planilha.
 * 
 * Uso:
 *   node scripts/recuperar-dados.js                    # Lista todas as submissões não gravadas
 *   node scripts/recuperar-dados.js --nte 1 --local "Nome do Polo"  # Filtra por NTE e local
 *   node scripts/recuperar-dados.js --exportar         # Exporta para JSON
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Erro: Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function listarSubmissoesNaoGravadas(filtros = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/sabe2026_submissoes`);
  
  // Filtra apenas submissões não gravadas
  url.searchParams.set('gravado_na_planilha', 'eq.false');
  url.searchParams.set('order', 'enviado_em.desc');
  
  if (filtros.nte) {
    url.searchParams.set('nte', `eq.${filtros.nte}`);
  }
  
  if (filtros.local) {
    url.searchParams.set('local', `eq.${filtros.local}`);
  }
  
  const response = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Erro ao consultar Supabase: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const filtros = {};
  let exportar = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--nte' && args[i + 1]) {
      filtros.nte = args[i + 1];
      i++;
    } else if (args[i] === '--local' && args[i + 1]) {
      filtros.local = args[i + 1];
      i++;
    } else if (args[i] === '--exportar') {
      exportar = true;
    }
  }
  
  console.log('Buscando submissões não gravadas na planilha...\n');
  
  try {
    const submissoes = await listarSubmissoesNaoGravadas(filtros);
    
    if (submissoes.length === 0) {
      console.log('✅ Nenhuma submissão não gravada encontrada.');
      return;
    }
    
    console.log(`📋 ${submissoes.length} submissão(ões) não gravada(s) encontrada(s):\n`);
    
    submissoes.forEach((sub, index) => {
      console.log(`--- Submissão ${index + 1} ---`);
      console.log(`ID: ${sub.id}`);
      console.log(`Data: ${new Date(sub.enviado_em).toLocaleString('pt-BR')}`);
      console.log(`Modalidade: ${sub.modalidade}`);
      console.log(`Ação: ${sub.acao}`);
      console.log(`NTE: ${sub.nte}`);
      console.log(`Local: ${sub.local}`);
      console.log(`Nome: ${sub.nome || '-'}`);
      console.log(`CPF: ${sub.cpf || '-'}`);
      console.log(`PIX: ${sub.pix || '-'}`);
      console.log(`Erro: ${sub.erro_gravacao || '-'}`);
      console.log('');
    });
    
    if (exportar) {
      const fs = await import('fs');
      const nomeArquivo = `submissoes-nao-gravadas-${Date.now()}.json`;
      fs.writeFileSync(nomeArquivo, JSON.stringify(submissoes, null, 2));
      console.log(`\n💾 Dados exportados para: ${nomeArquivo}`);
    }
    
    console.log('\n💡 Para gravar manualmente na planilha, use os dados acima.');
    console.log('   Ou execute o endpoint /api/inscricoes novamente com os dados corretos.');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
