import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export function abrirChrome(url) {
  const caminhos = [
    join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')] : [])
  ];
  const executavel = caminhos.find(caminho => existsSync(caminho));
  if (!executavel) { console.warn(`Chrome não encontrado. Abra manualmente: ${url}`); return; }
  const navegador = spawn(executavel, [url], { detached: true, stdio: 'ignore', windowsHide: true });
  navegador.on('error', () => console.warn(`Não foi possível abrir o Chrome. Abra manualmente: ${url}`));
  navegador.unref();
}
