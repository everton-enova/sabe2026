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
| `SABE_CP_ACCESS_CODE` | Código institucional com pelo menos 16 caracteres |
| `SABE_APP_ORIGIN` | URL pública exata da aplicação, incluindo `https://` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key do Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | Secret key do Cloudflare Turnstile |
| `UPSTASH_REDIS_REST_URL` | URL REST do Redis Upstash para rate limit compartilhado |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST do Redis Upstash |

Marque os ambientes **Production**, **Preview** e **Development**. Depois abra **Deployments**, localize o último deploy e use **Redeploy** para que as variáveis entrem em vigor.

O Turnstile precisa ser configurado para as origens de produção e preview usadas pela aplicação. O Redis REST é obrigatório em produção para que o limite de requisições seja compartilhado entre as funções serverless.

## 3. Teste final

1. Abra `/aplicacao/cp`, selecione um NTE e um polo e confirme que nome e CPF aparecem.
2. Abra `/aplicacao/sm`, preencha um cadastro de teste e confirme o envio.
3. Confira as abas `INSCRICOES CP` e `INSCRICOES SM` na planilha.
4. Exclua o cadastro de teste antes de liberar a aplicação.

## O que funciona sem variáveis

- Seleção de NTE, polo e município.
- Consulta autenticada dos dados do CP, com leitura otimizada e sem fallback público.
- Formulários, validações e revisão.

As variáveis de planilha, acesso institucional, Turnstile e Redis são necessárias para liberar a operação em produção.
