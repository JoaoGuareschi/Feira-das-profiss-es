const media = matchMedia('(prefers-color-scheme: dark)');
let preference;
try { preference = localStorage.getItem('feira-tema'); } catch {}
function apply(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const button = document.getElementById('alternar-tema');
  if (button) { button.textContent = dark ? 'Modo claro' : 'Modo escuro'; button.setAttribute('aria-pressed', String(dark)); }
}
apply(preference ? preference === 'dark' : media.matches);
media.addEventListener('change', event => { if (!preference) apply(event.matches); });
document.addEventListener('DOMContentLoaded', () => {
  const tools = document.createElement('div'); tools.className = 'theme-tools';
  const button = document.createElement('button'); button.id = 'alternar-tema'; button.type = 'button';
  button.addEventListener('click', () => {
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('feira-tema', preference); } catch {}
    apply(preference === 'dark');
  });
  tools.append(button); document.querySelector('main').prepend(tools);
  if (document.getElementById('form')) {
    const motion = document.createElement('button');
    motion.type = 'button';
    let paused = false;
    try { paused = localStorage.getItem('feira-movimento') === 'paused'; } catch {}
    const updateMotion = () => {
      document.documentElement.dataset.motion = paused ? 'paused' : 'running';
      motion.textContent = paused ? 'Retomar animações' : 'Pausar animações';
      motion.setAttribute('aria-pressed', String(paused));
    };
    motion.addEventListener('click', () => {
      paused = !paused;
      try { localStorage.setItem('feira-movimento', paused ? 'paused' : 'running'); } catch {}
      updateMotion();
    });
    updateMotion();
    tools.append(motion);
  }
  apply(document.documentElement.dataset.theme === 'dark');
});
