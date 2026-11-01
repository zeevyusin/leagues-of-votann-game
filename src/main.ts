import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/share-tech-mono/400.css';
import './ui/style.css';
import { loadGameData } from './engine/data';
import { App } from './ui/app';

const root = document.getElementById('app')!;
try {
  new App(root, loadGameData());
} catch (e) {
  // Bad data stops the game loudly instead of failing halfway through a scene.
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = e instanceof Error ? e.message : String(e);
  root.replaceChildren(pre);
  throw e;
}
