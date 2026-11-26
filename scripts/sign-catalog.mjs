#!/usr/bin/env node
// Ký số catalog/resolved.json bằng ed25519 → catalog/resolved.json.sig (base64).
// App chỉ chấp nhận danh mục có chữ ký hợp lệ (khoá công khai nhúng sẵn trong app).
//
// Khoá bí mật (PEM PKCS#8) lấy từ:
//   - biến môi trường SOGE_SIGNING_KEY (GitHub Actions secret), hoặc
//   - file ~/.soge/catalog-signing-key.pem trên máy của chủ repo.
// TUYỆT ĐỐI không commit khoá bí mật vào repo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'catalog', 'resolved.json');

const pem = process.env.SOGE_SIGNING_KEY || (() => {
  const p = path.join(os.homedir(), '.soge', 'catalog-signing-key.pem');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
})();
if (!pem.trim()) {
  console.error('Thiếu khoá ký (SOGE_SIGNING_KEY hoặc ~/.soge/catalog-signing-key.pem)');
  process.exit(2);
}

const key = crypto.createPrivateKey(pem);
const data = fs.readFileSync(FILE);
const sig = crypto.sign(null, data, key);
// Tự kiểm tra lại bằng khoá công khai suy ra từ khoá bí mật
if (!crypto.verify(null, data, crypto.createPublicKey(key), sig)) {
  console.error('Tự kiểm tra chữ ký thất bại');
  process.exit(1);
}
fs.writeFileSync(FILE + '.sig', sig.toString('base64') + '\n');
const pub = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
console.log(`Đã ký catalog/resolved.json (${data.length} bytes) — khoá công khai ${pub}`);
