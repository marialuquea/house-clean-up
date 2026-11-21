import { html, render } from './deps.js';
import App from './App.js';

render(html`<${App} />`, document.getElementById('root'));
