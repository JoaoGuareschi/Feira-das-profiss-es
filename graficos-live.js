(() => {
  const dados = document.getElementById('dados-graficos');
  if (!dados) return;
  const status = document.getElementById('status-graficos');
  const button = document.getElementById('atualizar-graficos');
  let busy = false;
  let expired = false;
  async function atualizar(event) {
    event?.preventDefault();
    if (busy || expired) return;
    busy = true;
    button.setAttribute('aria-disabled', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/admin/graficos', {credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if (response.status === 401 || new URL(response.url, location.href).pathname === '/admin/login') {
        expired = true;
        clearInterval(timer);
        dados.replaceChildren();
        document.getElementById('login-graficos').hidden = false;
        status.textContent = 'Atualização interrompida: faça login novamente.';
        return;
      }
      if (!response.ok) throw new Error('Falha na atualização');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const updated = page.getElementById('dados-graficos');
      const consulted = page.getElementById('consulta-graficos');
      if (!updated || !consulted) throw new Error('Resposta inesperada');
      // Evita reiniciar animações quando nenhuma avaliação mudou.
      if (dados.innerHTML !== updated.innerHTML) {
        const scroll = dados.querySelector('.table-wrap')?.scrollLeft || 0;
        dados.replaceChildren(...updated.childNodes);
        const table = dados.querySelector('.table-wrap');
        if (table) table.scrollLeft = scroll;
      }
      document.getElementById('consulta-graficos').textContent = consulted.textContent;
      status.textContent = 'Dados atualizados. Próxima consulta em 20 segundos.';
    } catch {
      status.textContent = 'Não foi possível atualizar. Mantivemos os últimos dados; tentaremos novamente em 20 segundos.';
    } finally {
      clearTimeout(timeout);
      busy = false;
      button.setAttribute('aria-disabled', String(expired));
    }
  }
  button.addEventListener('click', atualizar);
  let timer = setInterval(atualizar, 20000);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', event => {
    if (event.persisted && !expired) { timer = setInterval(atualizar, 20000); atualizar(); }
  });
})();
