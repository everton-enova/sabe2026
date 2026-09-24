# Configuração SABE 2026

## 1. Publicar o Google Apps Script

1. Abra a planilha **SABE 2026 GERAL**.
2. Acesse **Extensões → Apps Script**.
3. Apague o conteúdo inicial de `Código.gs` e cole o conteúdo de `google-apps-script/Code.gs` deste projeto.
4. Abra **Configurações do projeto → Propriedades do script**.
5. Crie a propriedade `SABE_WEBHOOK_SECRET` e informe um segredo forte.
6. Clique em **Implantar → Nova implantação**.
7. Escolha **Aplicativo da Web**.
8. Configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**. A planilha em si deve permanecer restrita à equipe; remova o compartilhamento público e não use mais o endpoint público de visualização.
9. Autorize o acesso solicitado e copie a URL final terminada em `/exec`.

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

## 4. Apagar as abas antigas

No editor do Apps Script, escolha no topo a função **`removerAbasSaida`** e clique em **Executar** (uma vez). Isso apaga as abas `INSCRICOES CP` e `INSCRICOES SM`. Também é possível excluí-las à mão (botão direito na aba → Excluir).

## 5. Teste final

1. Abra `/aplicacao/cp`, selecione um NTE e um polo e confirme que nome e CPF aparecem.
2. Abra `/aplicacao/sm`, preencha um cadastro de teste e confirme o envio.
3. Confira na aba `CP- SABE` se a linha do polo ficou com `✓` em `VALIDADO/ALTERADO FORM` e a data/hora em `ATUALIZADO` (e, no caso de editar/alterar, com os dados atualizados). Para o Supervisor Municipal, confira a aba `SM-SABE`.
4. Exclua o cadastro de teste antes de liberar a aplicação.

## O que funciona sem variáveis

- Seleção de NTE, polo e município.
- Consulta autenticada dos dados do CP, com leitura otimizada. Se o webhook falhar, a rota cai na leitura pública do CSV como última alternativa e registra a causa.
- Formulários, validações e revisão.
- Verificação anti-bot fica desativada enquanto `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` não estiverem configuradas.

As variáveis de planilha são necessárias para gravar os envios em produção.
