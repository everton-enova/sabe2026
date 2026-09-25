# SABE 2026

Plataforma de aplicações SABE 2026 em Next.js, TypeScript e App Router.

## Rotas

- `/` — seleção da modalidade
- `/aplicacao/cp` — seleção de NTE/polo, validação da indicação ou alteração cadastral
- `/aplicacao/sm` — seleção de NTE/município, cadastro do supervisor e upload do ofício/e-mail em PDF
- `/api/inscricoes` — valida e encaminha os envios ao Google Sheets
- `/api/indicacoes` — consulta autenticada do CP, sem GET público

Os seletores usam a relação consolidada de 27 NTEs, 168 polos e 417 municípios. A base versionada pode ser regenerada a partir de um arquivo exportado da planilha com `scripts/generate-sabe-data.py`.

O campo Banco usa a relação pública do Cartão BNDES e oferece a opção `OUTROS` para instituições não listadas. A lista pode ser atualizada com `scripts/generate-banks.py`.

No CP, a consulta exibe todos os campos disponíveis em modo de conferência. `Editar Dados` preserva o coordenador e permite corrigir seus dados; `Alterar Coordenador de Polo` inicia uma indicação substituta. A consulta usa um índice temporário de linha no Apps Script, relê somente o registro selecionado e valida uma versão antes de gravar.

## Executar

```bash
pnpm install
pnpm dev
```

## Validar

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Conectar ao Google Sheets

Copie `.env.example` para `.env.local` e configure `SABE_SHEETS_WEBHOOK_URL` com a URL publicada de um Google Apps Script. No Vercel, cadastre as mesmas variáveis de ambiente. O endpoint recebe JSON e só bloqueia o formulário no navegador depois que o webhook confirma a gravação.

O arquivo `google-apps-script/Code.gs` contém o endpoint esperado. No Apps Script, defina a propriedade `SABE_WEBHOOK_SECRET`, publique como aplicativo da Web e use a URL `/exec` nas variáveis do projeto. O script rejeita GET, exige segredo, protege fórmulas inseridas e usa bloqueio concorrente. As validações são gravadas diretamente nas abas oficiais: CP na `CP- SABE` e Supervisor Municipal na `SM-SABE` (colunas **ATUALIZADO** e **VALIDADO/ALTERADO FORM**).

Em produção, configure apenas as variáveis da planilha descritas em `CONFIGURACAO.md`.

Consulte `CONFIGURACAO.md` para o passo a passo completo da planilha e da Vercel.
