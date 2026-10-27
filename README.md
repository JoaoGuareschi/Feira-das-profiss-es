# Feira das Profissões

Aplicação web em JavaScript para coletar avaliações dos stands e acompanhar os resultados em um painel administrativo. Inclui emojis de satisfação, elogios e sugestões separados, modo claro/escuro e gráficos por curso.

## GitHub e hospedagem

Consulte [SECURITY.md](SECURITY.md) para as proteções e limites do sistema. O projeto está marcado como `UNLICENSED`; mantenha o repositório privado para restringir o acesso ao código-fonte. Os arquivos executados no navegador continuam inspecionáveis.

Este repositório contém o código do projeto. O GitHub Pages não executa o servidor Node.js nem o SQLite: para disponibilizar o questionário completo na internet, é necessária uma hospedagem Node.js 24+ com HTTPS e disco persistente.

Depois de clonar ou baixar o código, copie `.env.example` para `.env`, configure suas credenciais e execute `npm start`. Não há dependências externas para instalar. O `.env`, as avaliações em `dados/` e arquivos SQLite não devem ser enviados ao GitHub. Cada instalação mantém seu próprio banco; baixar o código não copia respostas da feira.

Questionário em JavaScript para celular, com servidor Node.js e banco SQLite central. Não pede identificação dos visitantes. Os 12 cursos da feira estão configurados em `cursos.json`.

## Rodar

1. Instale Node.js 24 ou superior.
2. Confira os cursos em `cursos.json`. Se alterar a lista, reinicie o servidor.
3. Abra um terminal nesta pasta e execute `npm start`. Não há dependências para instalar.
4. No computador, acesse `http://localhost:3000`.

O servidor precisa continuar ligado. Por padrão, em desenvolvimento ele atende somente no próprio computador. Para testes pelo mesmo Wi-Fi, configure `HOST=0.0.0.0` e `APP_ORIGIN` com o endereço e porta usados, se a rede e o firewall permitirem. Use HTTPS para o acesso administrativo em rede compartilhada; prefira publicar o sistema para o uso na feira.

Para visitantes em redes diferentes, hospede este servidor em um serviço Node.js com HTTPS e disco persistente. Não basta abrir o HTML nem usar hospedagem apenas de arquivos estáticos. O link público e o QR Code ainda não foram criados.

## Dados e planilha

O arquivo `dados/feira.sqlite` guarda todas as respostas no servidor. Preserve essa pasta entre reinícios e faça backups com o servidor parado. Serviços com disco temporário perdem os dados.

O questionário possui dois campos opcionais independentes: **O que você gostou?** e **Sugestões para melhorar**, com até 1.000 caracteres cada. O banco é atualizado automaticamente ao iniciar, adicionando as colunas sem apagar registros. Comentários anteriores continuam disponíveis como **Comentário antigo** no painel e no CSV. Nos gráficos, o contador de comentários representa avaliações com pelo menos um texto preenchido, incluindo comentários antigos, sem contar duas vezes quem preencheu ambos os novos campos.

## Login do administrador

1. Copie `.env.example` para `.env` dentro de `feira-profissoes`:

```powershell
Copy-Item .env.example .env
```

2. Edite `.env` no seu computador:

```dotenv
ADMIN_EMAIL=seu-email@exemplo.com
ADMIN_PASSWORD="escolha-uma-senha-unica-com-16-ou-mais-caracteres"
APP_ORIGIN=http://localhost:3000
NODE_ENV=development
PORT=3000
```

3. Substitua os exemplos pelo seu e-mail e uma senha longa e exclusiva. Não use a senha do seu e-mail. Use aspas na senha para preservar caracteres como `#`.
4. Reinicie o servidor pelo F5 (configuração **Feira: iniciar e abrir no Chrome**) ou `npm start`. O F5 abre o Chrome diretamente, sem depuração do navegador; mantenha o servidor em execução durante o uso.
5. Acesse `http://localhost:3000/admin` e faça login. No painel, consulte as avaliações, clique em **Baixar todas em CSV** ou em **Sair**.

### Gráficos da feira

No painel de avaliações, use a pesquisa para encontrar curso, elogio, sugestão ou comentário antigo. Combine filtros por curso e nota e ordene por data, nota ou nome do curso. Clique em **Aplicar pesquisa e filtros**. A lista tem 50 avaliações por página e os filtros são mantidos na navegação. **Limpar filtros** restaura a lista completa. A exportação CSV continua incluindo todas as avaliações, independentemente dos filtros.

Para apagar uma resposta, clique em **Excluir avaliação** no cartão, confira o curso e a nota, marque a confirmação e clique em **Excluir definitivamente**. A operação é permanente; apenas abrir a confirmação não apaga nada. É necessário estar autenticado, e a requisição exige origem válida e token CSRF. A avaliação removida deixa de aparecer na exportação e nos gráficos ao atualizá-los.

No painel, clique em **Ver gráficos e indicadores**, ou acesse `/admin/graficos` após entrar. A página é protegida pela mesma sessão administrativa e inclui pizzas de distribuição das notas e participação por curso, barras de quantidade e média por curso, indicadores e uma tabela detalhada. Usa todas as avaliações do banco, com cores fixas por curso. Sem respostas, mostra um estado vazio, sem dados fictícios.

As animações são contínuas e podem ser pausadas pelo controle **Pausar animações**. A preferência de movimento reduzido do dispositivo é respeitada. Clique em **Atualizar dados** para obter novas respostas; não existe atualização automática. Totais representam avaliações e não visitantes únicos.

O servidor carrega `.env` automaticamente, inclusive ao executar pelo F5. Variáveis já definidas no ambiente têm prioridade. O arquivo `.env` está ignorado pelo Git e nunca é servido pelo servidor. Não compartilhe esse arquivo nem envie sua senha no chat.

Somente o par exato de e-mail e senha configurado permite entrar. Não existe cadastro nem liberação por apenas informar o e-mail. Sem as duas variáveis ou com senha menor que 16 caracteres, o login fica indisponível e os dados permanecem protegidos, mas o questionário continua funcionando. O antigo `ADMIN_TOKEN` não dá mais acesso à exportação.

### Sessão e proteção

- A sessão usa um identificador aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Strict`, sem armazenamento em localStorage. Em produção, adiciona `Secure` e o prefixo `__Host-`.
- O servidor guarda apenas o hash do identificador da sessão em memória. Sessões expiram após 30 minutos sem uso ou 8 horas no total; reiniciar o servidor encerra todas as sessões.
- A senha é comparada no servidor usando scrypt e comparação de tempo constante. O valor original continua no `.env`; proteja o acesso ao arquivo e à máquina.
- O login renova o identificador. Logout exige POST, origem correta e token CSRF; o cookie é apagado e a sessão é revogada no servidor.
- Tentativas de login são limitadas a 5 por IP a cada 15 minutos, com limite global de 100. Atrás de proxy, visitantes podem compartilhar o IP do proxy; cabeçalhos de IP encaminhado não são confiados automaticamente. Reinícios limpam os limites.
- `/admin` e subpáginas exigem sessão e redirecionam para login; `/api/exportar` retorna 401 sem sessão. O servidor não publica arquivos do banco ou do projeto.
- O painel mostra as 500 avaliações mais recentes. O CSV inclui todas, com datas em UTC. Comentários são escapados no HTML.

### Publicar com HTTPS

Na hospedagem, configure `NODE_ENV=production`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` nas variáveis privadas do serviço. No Render, remova `APP_ORIGIN` para usar automaticamente `RENDER_EXTERNAL_URL`, fornecida pela plataforma, ou configure `APP_ORIGIN=https://seu-dominio.com` se usar um domínio personalizado. Não use a porta interna `10000` no endereço público HTTPS.

No painel do Render, abra **Environment**, remova o `APP_ORIGIN` que aponta para localhost (ou substitua pelo endereço HTTPS real) e escolha **Save, rebuild, and deploy** após enviar os arquivos atualizados ao repositório conectado. Depois, abra uma nova página de `/admin/login` no domínio público. Não reenvie o formulário antigo do navegador. O código local precisa ser publicado no Render para essa correção entrar em vigor.

Login, logout, exclusão e envio das avaliações usam a mesma origem configurada. No Render, uma configuração antiga de `APP_ORIGIN` com localhost é ignorada com aviso no log. Se um domínio personalizado estiver configurado, acesse por ele. O sistema não confia no cabeçalho Host ou X-Forwarded-Proto enviado pelo visitante para autorizar requisições. Fora do Render, produção exige `APP_ORIGIN` HTTPS explicitamente. Cookies administrativos recebem Secure em produção e no Render. Configure a hospedagem para redirecionar HTTP para HTTPS.

Use um único processo Node.js e disco persistente para o SQLite. Para múltiplos processos ou servidores, será necessário compartilhar sessões e limites de tentativas em um serviço central. A configuração local HTTP destina-se ao desenvolvimento: use HTTPS antes de fazer login pela internet ou por uma rede compartilhada.

Referência: [OWASP — gerenciamento de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Situação

O teste automatizado `npm test` valida redirecionamento de visitantes sem sessão, bloqueio do CSV, login correto/incorreto, rejeição de origem externa, atributos do cookie, escape de comentários, proteção CSRF do logout, revogação de sessão e limite de tentativas. Ele usa um banco temporário, sem alterar as avaliações reais.

Publicação e teste visual no navegador ainda pendentes. Antes da feira, validar o envio em dois celulares, reiniciar o servidor e conferir a permanência das respostas e a exportação CSV.
