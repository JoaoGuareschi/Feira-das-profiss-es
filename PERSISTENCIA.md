# Preservar avaliações no Render

O código já usa SQLite em arquivo. O banco só sobrevive à substituição da
instância se estiver em um disco persistente. DATA_DIR não cria esse disco.
O banco local do computador não é o banco do site publicado.

## Ordem da mudança no serviço existente

1. Antes de qualquer deploy ou alteração de plano/disco, interrompa a coleta
   de novas avaliações e exporte o CSV pelo painel administrativo. Guarde-o
   no computador. CSV é uma cópia dos dados, não uma restauração automática.
2. Se houver acesso ao Shell/SSH da instância atual, faça uma cópia SQLite
   consistente do banco e baixe-a para fora do Render. Não publique código
   apenas para obter a ferramenta: o deploy pode apagar o banco temporário.
   A ferramenta `banco.js` pode ser enviada separadamente por SSH, quando
   disponível. Exemplo, a partir da pasta do projeto:

   ```sh
   node banco.js dados/feira.sqlite /tmp/feira-antes-da-migracao.sqlite
   ```

   Se DATA_DIR já estiver configurado, use o caminho real como origem.
   Baixe a cópia por SCP antes de continuar. Ela também está temporária.
   Se só houver CSV, preserve-o para uma importação específica antes de
   liberar a coleta; não tente abrir CSV como SQLite.
3. No serviço existente do Render, adicione disco persistente montado em
   `/var/data` (requer serviço pago). A criação do disco dispara um deploy.
   Não crie outro serviço nem remova o serviço atual.
4. Com a coleta interrompida, envie o backup preservado para a instância e
   copie-o para `/var/data/feira.sqlite` ANTES de apontar DATA_DIR para essa
   pasta. A ferramenta recusa sobrescrever arquivos existentes:

   ```sh
   node banco.js /tmp/feira-antes-da-migracao.sqlite /var/data/feira.sqlite
   ```

   Se o destino já existir, examine e preserve ambos os bancos. Não apague
   um banco para forçar a restauração. Se não há dados anteriores para
   recuperar, o servidor pode criar um banco novo no disco persistente.
5. Configure `DATA_DIR=/var/data` e `NODE_ENV=production` em Environment.
   Preserve as demais variáveis privadas. Publique os arquivos atualizados.
6. Confira nos logs `Arquivo do banco: /var/data/feira.sqlite` e no painel
   o total de avaliações. Faça uma avaliação de teste, reinicie o serviço
   e confirme que ela e as avaliações antigas continuam disponíveis.
   Só então retome a coleta.

## Backups posteriores

```sh
node banco.js /var/data/feira.sqlite /var/data/backups/feira-AAAA-MM-DD.sqlite
```

Use um nome diferente a cada cópia e baixe backups regularmente para outro
local. A ferramenta usa a API de backup do SQLite, verifica integridade e
contagem de respostas, e não altera a origem nem sobrescreve o destino.
Não é um agendador automático nem substitui armazenamento persistente.
Dados que já desapareceram do disco temporário dependem de backups anteriores.

Referências: https://render.com/docs/disks e https://nodejs.org/api/sqlite.html
