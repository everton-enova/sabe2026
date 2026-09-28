# Contrato da integração

As consultas e os envios usam POST com segredo no corpo. GET não expõe indicações.
O índice temporário guarda apenas a posição da linha por NTE/polo por 5 minutos.
A linha é relida e sua localização conferida antes de retornar dados; nenhuma informação pessoal é armazenada nesse cache.

As colunas da aba oficial **CP- SABE** são localizadas pelo **cabeçalho**, nunca por
índice fixo — a planilha pode ganhar/reordenar colunas sem quebrar a integração.

`registro` identifica a linha consultada; `versao` é um resumo SHA-256 do conteúdo.
Na gravação, o script relê a indicação sob bloqueio e rejeita versões desatualizadas.

- `validar` usa os dados atuais da origem e apenas marca a linha como validada.
- `editar` grava as correções da mesma indicação na própria linha da CP- SABE.
- `alterar` exige CPF diferente e grava a pessoa substituta na própria linha.

Em todas as ações de CP a aba oficial recebe a data/hora em **ATUALIZADO** e um `✓`
em **VALIDADO/ALTERADO FORM**. O horário é gravado no **fuso da planilha** (Brasília,
UTC-3), formato `dd/MM/yyyy HH:mm:ss` — o `enviadoEm` chega do servidor em UTC
(`toISOString()`) e é convertido na gravação, para não ficar 3 horas à frente do
horário real da validação. A `INSCRICOES CP` não é mais usada para CP — a
validação vive na própria `CP- SABE` e a aba pode ser excluída. O endpoint
`tipo: "validados"` devolve os polos de um NTE cuja coluna **VALIDADO/ALTERADO FORM**
está preenchida.

O Supervisor Municipal (`modalidade: "SM"`) grava na aba oficial **`SM-SABE`**, na
linha do NTE + MUNICÍPIO, também com **ATUALIZADO** (horário de Brasília) e
**VALIDADO/ALTERADO FORM**.
A aba `INSCRICOES SM` não é mais usada.

O upload do SM é enviado como `multipart/form-data` para `/api/inscricoes`, convertido
em base64 e repassado ao Apps Script. O script salva o PDF (máximo 4 MB) em uma pasta
do Google Drive com o **nome do município**, dentro da pasta definida em
`SABE_DRIVE_FOLDER_ID`, e grava a URL do arquivo na coluna **DOCUMENTO** da `SM-SABE`.
Sem `arquivoBase64` o cadastro do SM é recusado com HTTP 400.

## Corrigir horários antigos da coluna ATUALIZADO

Validações feitas até a versão `2026-09-25-supabase` gravaram **UTC** (ex.:
`2026-09-25T23:07:35.658Z`) na coluna ATUALIZADO — 3 horas à frente do horário de
Brasília. Depois de publicar a nova versão, rode **uma vez** no editor do Apps Script:
`Executar → corrigirHorariosAtualizado`. Ela converte apenas as células com formato
ISO UTC para `dd/MM/yyyy HH:mm:ss` (fuso da planilha) e retorna quantas corrigiu
por aba (`CP- SABE ` e `SM-SABE`). Não é chamada pelo webhook.

## Aba MONITORAMENTO (cadastrados por NTE)

`atualizarMonitoramento()` cria/atualiza a aba **MONITORAMENTO**: uma linha por NTE
com os polos de Coordenador de Polo validados (coluna VALIDADO/ALTERADO FORM da
`CP- SABE `), os municípios com Supervisor Municipal cadastrado (mesma coluna da
`SM-SABE`), o total por NTE e o horário da última validação/cadastro de cada tipo
(convertido para o fuso da planilha). NTEs sem cadastro aparecem com zero, e a
última linha traz os totais gerais.

A aba é **criada automaticamente** ao fim de cada gravação bem-sucedida do webhook
(validar/editar/alterar do CP e cadastrar do SM) e também pode ser gerada sob
demanda no editor: `Executar → atualizarMonitoramento`. Ela lê todas as linhas das
duas abas oficiais, então reflete a planilha como está — sem políticas de exclusão
nem histórico.
