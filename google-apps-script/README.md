# Contrato da integração

As consultas e os envios usam POST com segredo no corpo. GET não expõe indicações.
O índice temporário guarda apenas a posição da linha por NTE/polo por 5 minutos.
A linha é relida e sua localização conferida antes de retornar dados; nenhuma informação pessoal é armazenada nesse cache.

`registro` identifica a linha consultada; `versao` é um resumo SHA-256 do conteúdo.
Na gravação, o script relê a indicação sob bloqueio e rejeita versões desatualizadas.
`validar` usa os dados atuais da origem; `editar` registra correções da mesma indicação;
`alterar` exige CPF diferente e registra a pessoa substituta. As operações continuam
gravando nas abas INSCRICOES CP/SM, sem sobrescrever a aba oficial CP- SABE.
Colunas de auditoria são acrescentadas depois das 13 colunas já existentes.
