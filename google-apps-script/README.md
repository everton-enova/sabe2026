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
em **VALIDADO/ALTERADO FORM**. A aba de saída `INSCRICOES CP` continua sendo gravada
como histórico/auditoria. O endpoint `tipo: "validados"` devolve os polos de um NTE
cuja coluna **VALIDADO/ALTERADO FORM** está preenchida.
