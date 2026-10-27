# Proteções e limites

O código do servidor, `.env`, arquivos Git e banco SQLite não são servidos pelo HTTP. Apenas as rotas e os arquivos públicos explicitamente permitidos são acessíveis. O painel, a exportação e a exclusão exigem autenticação no servidor; alterar o HTML pelo Inspecionar não altera essas permissões.

HTML, CSS e JavaScript executados no navegador são públicos por natureza. Não bloqueamos F12, seleção de texto ou o botão direito: essas medidas não protegem dados. Requisições são validadas novamente no servidor; consultas usam parâmetros, textos são escapados e operações administrativas exigem sessão e proteção contra CSRF.

A página pública restringe scripts com Content Security Policy e hash do script inline. Cabeçalhos bloqueiam enquadramento em outros sites, detecção indevida de tipos e acesso à câmera, microfone e localização. Em produção, HSTS é enviado; configure HTTPS e redirecionamento de HTTP na hospedagem.

O envio público tem limite de 120 tentativas por IP a cada 10 minutos, em memória, além de limite de tamanho do corpo e dos textos. Isso reduz abuso, mas não impede robôs distribuídos nem garante que cada avaliação corresponda a uma pessoa diferente. Proxies e redes compartilhadas podem agrupar visitantes no mesmo limite. Ao publicar, considere limitação adicional na hospedagem e CAPTCHA caso haja abuso.

Em desenvolvimento, o servidor atende apenas no próprio computador. Para testar com celulares na mesma rede, configure HOST=0.0.0.0 conscientemente e ajuste APP_ORIGIN ao endereço usado. O login HTTP destina-se apenas ao ambiente local. Não exponha sua máquina por encaminhamento de portas.

O projeto está marcado UNLICENSED, sem concessão de licença de código aberto. Para manter o código-fonte restrito, use repositório privado e limite colaboradores e acesso à hospedagem. Essa configuração não torna os arquivos enviados ao navegador secretos. Não há repositório remoto configurado localmente; a visibilidade no GitHub não foi alterada.

Mantenha a senha administrativa exclusiva, o sistema atualizado e backups periódicos do SQLite. Sessões e limites são locais a um processo; use uma única instância ou adapte esses mecanismos para armazenamento compartilhado antes de escalar. Não há garantia de invulnerabilidade.
