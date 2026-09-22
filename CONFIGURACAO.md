# Configuração SABE 2026

## 1. Publicar o Google Apps Script

1. Abra a planilha **SABE 2026 GERAL**.
2. Acesse **Extensões → Apps Script**.
3. Apague o conteúdo inicial de `Código.gs` e cole o conteúdo de `google-apps-script/Code.gs` deste projeto.
4. Abra **Configurações do projeto → Propriedades do script**.
5. Crie a propriedade `SABE_WEBHOOK_SECRET` e informe um segredo forte.
6. Clique em **Implantar → Nova implantação**.
7. Escolha **Aplicativo da Web**.
8. Configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**.
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

Marque os ambientes **Production**, **Preview** e **Development**. Depois abra **Deployments**, localize o último deploy e use **Redeploy** para que as variáveis entrem em vigor.

## 3. Teste final

1. Abra `/aplicacao/cp`, selecione um NTE e um polo e confirme que nome e CPF aparecem.
2. Abra `/aplicacao/sm`, preencha um cadastro de teste e confirme o envio.
3. Confira as abas `INSCRICOES CP` e `INSCRICOES SM` na planilha.
4. Exclua o cadastro de teste antes de liberar a aplicação.

## O que funciona sem variáveis

- Seleção de NTE, polo e município.
- Consulta de nome e CPF do CP.
- Formulários, validações e revisão.

As variáveis são necessárias para gravar os envios na planilha e aplicar o bloqueio definitivo no servidor.
