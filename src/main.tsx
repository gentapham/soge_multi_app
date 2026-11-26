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

// Bản release: chặn tải lại trang (F5/Ctrl+R) vì sẽ làm mất hàng đợi tải/cài đang chạy
if (import.meta.env.PROD) {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f5' || ((e.ctrlKey || e.metaKey) && (k === 'r' || k === 'p')) || (e.ctrlKey && e.shiftKey && k === 'i')) {
      e.preventDefault();
    }
  });
}

// Chỉ hiện viền focus khi người dùng điều hướng bằng bàn phím
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') document.body.classList.add('kbd');
});
window.addEventListener('mousedown', () => document.body.classList.remove('kbd'));

// Chặn menu chuột phải mặc định của trình duyệt (trừ ô nhập liệu)
window.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement;
  if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) e.preventDefault();
});

// Chỉ bản dev: Ctrl+Shift+U giả lập quá trình cập nhật app để xem giao diện (không cài thật)
if (import.meta.env.DEV) {
  window.addEventListener('keydown', async (e) => {
    if (!(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'u')) return;
    const { useAppUpdate } = await import('./lib/appUpdate');
    const set = useAppUpdate.setState;
    const total = 3_900_000;
    set({ available: { version: '9.9.9' } as never, phase: 'downloading', received: 0, total: null });
    await new Promise((r) => setTimeout(r, 700));
    set({ total });
    for (let got = 0; got < total; got += 260_000) {
      set({ received: got });
      await new Promise((r) => setTimeout(r, 120));
    }
    set({ phase: 'ready', received: total });
    await new Promise((r) => setTimeout(r, 1800));
    set({ phase: 'installing' });
    await new Promise((r) => setTimeout(r, 2500));
    set({ phase: 'idle', available: null, justUpdated: { from: '0.2.7', to: '9.9.9' } });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
