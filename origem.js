// A URL pública vem da configuração da hospedagem, nunca do Host enviado pelo visitante.
export function resolvePublicConfig(env = process.env) {
  const render = env.RENDER === 'true';
  const production = env.NODE_ENV === 'production' || render;
  const localHost = hostname => hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127\./.test(hostname) || hostname === '0.0.0.0';
  function parse(value, name) {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} deve conter uma URL completa, como https://seu-site.onrender.com.`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${name} deve conter apenas protocolo e domínio, sem credenciais, caminho ou parâmetros.`);
    return url;
  }
  let url = env.APP_ORIGIN?.trim() ? parse(env.APP_ORIGIN.trim(), 'APP_ORIGIN') : null;
  const ignoredLocalOrigin = Boolean(render && url && localHost(url.hostname));
  if (ignoredLocalOrigin) url = null;
  if (!url && render && env.RENDER_EXTERNAL_URL) url = parse(env.RENDER_EXTERNAL_URL, 'RENDER_EXTERNAL_URL');
  if (!url && production) throw new Error('Configure APP_ORIGIN com a URL HTTPS pública do site. No Render, RENDER_EXTERNAL_URL também pode fornecer esse endereço.');
  if (!url) url = parse(`http://localhost:${env.PORT || 3000}`, 'URL local');
  if (production && (url.protocol !== 'https:' || localHost(url.hostname))) throw new Error('Em produção, o endereço público deve usar HTTPS e não pode ser localhost.');
  return {origin:url.origin, production, ignoredLocalOrigin};
}
