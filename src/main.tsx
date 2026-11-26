import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource/nunito/vietnamese-700.css';
import '@fontsource/nunito/vietnamese-800.css';
import '@fontsource/nunito/vietnamese-900.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Chặn menu chuột phải mặc định của trình duyệt (trừ ô nhập liệu)
window.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement;
  if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
