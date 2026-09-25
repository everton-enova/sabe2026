# Configuração SABE 2026

## 1. Publicar o Google Apps Script

1. Abra a planilha **SABE 2026 GERAL**.
2. Acesse **Extensões → Apps Script**.
3. Apague o conteúdo inicial de `Código.gs` e cole o conteúdo de `google-apps-script/Code.gs` deste projeto.
4. Abra **Configurações do projeto → Propriedades do script**.
5. Crie a propriedade `SABE_WEBHOOK_SECRET` e informe um segredo forte.
6. (Upload SM) Crie a propriedade `SABE_DRIVE_FOLDER_ID` com o ID da pasta do Google Drive que receberá os documentos dos Supervisores Municipais. Uma pasta por município é criada automaticamente dentro dela. Sem essa propriedade, o script cria e usa a pasta `SABE 2026 - Documentos SM` na raiz do Drive de quem publicou o script.
7. Clique em **Implantar → Nova implantação**.
8. Escolha **Aplicativo da Web**.
9. Configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**. A planilha em si deve permanecer restrita à equipe; remova o compartilhamento público e não use mais o endpoint público de visualização.
10. Autorize o acesso solicitado e copie a URL final terminada em `/exec`.

> **Cuidado:** depois de editar o código, use **Implantar → Gerenciar implantações → Editar (lápis) → Versão: Nova versão → Implantar**. Isso mantém a **mesma URL `/exec`**. Se você usar **"Nova implantação"**, é gerada uma URL nova e a Vercel continua apontando para a antiga (que roda o código velho).

> **Este é o motivo mais comum de "ainda grava em INSCRICOES CP":** o código do repositório já não usa essa aba, mas o Apps Script **publicado** é uma versão antiga. A Vercel não atualiza o Apps Script — são dois deploys separados.

Para gerar um segredo no terminal:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Não envie esse segredo por mensagem e não salve o valor no GitHub.

## 2. Cadastrar as variáveis na Vercel

No projeto **sabe2026**, acesse **Settings → Environment Variables** e cadastre:

| Nome | Valor |
| --- | --- |
| `SABE_SHEETS_WEBHOOK_URL` | URL `/exec` copiada do Apps Script |
| `SABE_WEBHOOK_SECRET` | Mesmo segredo salvo nas propriedades do Apps Script |
| `SABE_DIAGNOSTICO_SECRET` | (Opcional) Segredo para acessar `/api/diagnostico?chave=...`. Sem ele o endpoint fica fechado |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | (Opcional) Sitekey do Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | (Opcional) Secret do Cloudflare Turnstile (mesmo par do sitekey) |

Marque os ambientes **Production**, **Preview** e **Development**. Depois abra **Deployments**, localize o último deploy e use **Redeploy** para que as variáveis entrem em vigor.
> Sempre que `google-apps-script/Code.gs` mudar, edite a implantação existente em **Implantar → Gerenciar implantações → Editar → Versão: Nova versão**. Não crie uma "Nova implantação" (isso troca a URL e a Vercel fica apontando para o código antigo).

## 3. Confirmar que a versão nova está no ar

Abra no navegador:

```
https://SEU-PROJETO.vercel.app/api/versao
```

- `{ "ok": true, "versao": "2026-09-24-sem-inscricoes" }` → o Apps Script novo está publicado.
- `{ "ok": false, "code": "INVALID" }` → a implantação publicada ainda é **antiga** (por isso ainda grava em `INSCRICOES CP`). Repita o item 1 com **Nova versão**.

Na primeira chamada válida, o script **migra sozinho** o histórico da `INSCRICOES CP` para a `CP- SABE` (a resposta traz `"migracao": { "migrados": N }`):

- registros com ação `validar` → apenas marcam `ATUALIZADO` e `VALIDADO/ALTERADO FORM`;
- registros com ação `editar`/`alterar` → gravam os dados na linha da `CP- SABE` (incluindo a separação de dígito de agência/conta) e marcam.

A migração roda uma única vez. Para forçá-la de novo, apague a propriedade `MIGRACAO_INSCRICOES_CP` em **Configurações do projeto → Propriedades do script** e chame de novo, ou use internamente `tipo: "migrar"`.

## 4. Apagar as abas antigas

No editor do Apps Script, escolha no topo a função **`removerAbasSaida`** e clique em **Executar** (uma vez). Isso apaga as abas `INSCRICOES CP` e `INSCRICOES SM`. Também é possível excluí-las à mão (botão direito na aba → Excluir).

## 5. Teste final

1. Abra `/aplicacao/cp`, selecione um NTE e um polo e confirme que nome e CPF aparecem.
2. Abra `/aplicacao/sm`, preencha um cadastro de teste, anexe um PDF e confirme o envio. Verifique se o arquivo apareceu na pasta do município dentro de `SABE_DRIVE_FOLDER_ID` e se o link foi gravado na coluna **DOCUMENTO** da aba `SM-SABE` (crie a coluna se ela ainda não existir).
3. Confira na aba `CP- SABE` se a linha do polo ficou com `✓` em `VALIDADO/ALTERADO FORM` e a data/hora em `ATUALIZADO` (e, no caso de editar/alterar, com os dados atualizados). Para o Supervisor Municipal, confira a aba `SM-SABE`.
4. Exclua o cadastro de teste antes de liberar a aplicação.

## O que funciona sem variáveis

- Seleção de NTE, polo e município.
- Consulta autenticada dos dados do CP, com leitura otimizada. Se o webhook falhar, a rota cai na leitura pública do CSV como última alternativa e registra a causa.
- Formulários, validações e revisão.
- Verificação anti-bot fica desativada enquanto `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` não estiverem configuradas.

As variáveis de planilha são necessárias para gravar os envios em produção.

## 6. Diagnóstico rápido e erros conhecidos

Rode em qualquer ambiente (local ou CI) com as variáveis carregadas:

```bash
node scripts/diagnostico.mjs
```

Isso testa, na ordem: variáveis, webhook GAS, fallback público da planilha e Supabase Storage.

### “Não foi possível consultar os dados deste polo.” (erro genérico 502)

A mensagem é o fallback de erro da API (`failure()` em `src/lib/api-security.ts`) para exceções
não esperadas. As causas reais que já aparecem no projeto:

1. **`SABE_WEBHOOK_SECRET` errado/desatualizado na Vercel** — o Apps Script responde
   `UNAUTHORIZED` para todo POST. Sintoma: `/api/versao` responde `{ code: "UNAUTHORIZED" }`
   ou `DESATUALIZADO`. Correção: no painel **Vercel → Settings → Environment Variables**,
   apague `SABE_WEBHOOK_SECRET` e `SABE_SHEETS_WEBHOOK_URL` (Produção, Prévia, Desenvolvimento),
   cadastre os valores que funcionam localmente (confira o `.env`) e faça **Redeploy**.
2. **Google Sheets público lento/indisponível** — quando o webhook falha, a consulta cai na
   leitura pública (gviz). Com retry e timeout de 25s (versão atual) ela resiste melhor; se
   ainda assim falhar, a resposta mostra a causa em `detalhe` na tela.
3. **Assinatura/tempo** — o formulário espera a resposta em JSON; um proxy ou firewall pode
   devolver HTML e o erro aparece como “resposta inválida”.

### Upload do Supervisor Municipal (SM) falha com “Bucket not found”

O PDF do SM sobe para o **Supabase Storage** no bucket `sabe2026-documentos`. Se o bucket não
existir no projeto (ver `scripts/diagnostico.mjs`), crie com um clique:

1. Abra o **Supabase Dashboard** do projeto e vá em **SQL Editor**.
2. Cole o conteúdo de `supabase-setup.sql` e clique **Run**.

O script cria o bucket público `sabe2026-documentos` (4 MB, só PDF) e as policies de INSERT/SELECT
anônimo — necessário porque o app usa a publishable key quando a service role não está presente.
São idempotentes: pode rodar de novo sem risco.

Depois cadastre `SUPABASE_SERVICE_ROLE_KEY` na Vercel (Produção/Prévia/Desenvolvimento) e faça
**Redeploy**. Localmente, coloque-a no `.env`.

## 7. Corrigir as variáveis da Vercel de uma vez (recomendado)

O erro `UNAUTHORIZED` no `/api/versao` significa que `SABE_WEBHOOK_SECRET`/`SABE_SHEETS_WEBHOOK_URL`
no painel da Vercel estão desatualizados (o `.env` local funciona). Em vez de trocar variável por
variável à mão, rode o script pronto:

```bash
npm i -g vercel
vercel login       # abre o navegador com sua conta
bash scripts/setup-vercel-env.sh
```

Ele copia **todas** as variáveis do `.env` local para Produção, Prévia e Desenvolvimento na Vercel
(sobrescrevendo as antigas, pulando as que estão vazias) e dispara o redeploy de produção.

Confirme no final:

```
https://sabe2026.vercel.app/api/versao
```

- `{ "ok": true, "versao": "2026-09-25-..." }` → pronto.
- `{ "ok": false, "code": "UNAUTHORIZED" }` → o `.env` local também está com segredo errado
  (confira as propriedades do script no Apps Script).
- `{ "ok": false, "code": "INVALID" }` → o Apps Script publicado é antigo; publique nova versão
  do `Code.gs` (seção 1).
