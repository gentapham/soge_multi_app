# SOGE Multi App

Ứng dụng Windows giúp **tải & cài phần mềm chính chủ chỉ với một cú nhấp** — dành cho tất cả mọi người, kể cả người không rành máy tính.

- 3 tab: **Phần Mềm Miễn Phí**, **Phần Mềm Bản Quyền** (chỉ bộ cài chính chủ / dùng thử — không crack), **Games** (launcher của các NPH).
- Mỗi tab chia nhiều danh mục: Trình duyệt, Bộ gõ chữ, Văn phòng, Lập trình, Tiện ích hệ thống…
- Lần đầu mở app bắt buộc **chọn thư mục lưu**; bộ cài được sắp xếp `Thư mục/Tab/Danh mục/Tên phần mềm/`.
- **Cài silent** (không cần bấm Next) với MSI / Inno Setup / NSIS / WiX Burn; phần mềm portable được giải nén và tạo lối tắt ngoài Desktop.
- **Kiểm tra cập nhật**: so phiên bản bộ cài trong thư mục với bản mới nhất → tự tải bản mới và **xoá bản cũ**.
- Kiểm tra mã SHA256 khi có, phát hiện phần mềm đã cài trên máy (Registry), chọn nhiều app để cài hàng loạt.
- Song ngữ Việt / Anh, giao diện sáng / tối.

## Công nghệ

[Tauri 2](https://tauri.app) (Rust) + React 19 + TypeScript + Tailwind CSS. Font: Be Vietnam Pro & Nunito.

## Cấu trúc

```
catalog/catalog.json      ← danh mục nguồn (sửa file này để thêm/bớt phần mềm)
catalog/resolved.json     ← sinh tự động: phiên bản + link tải mới nhất (app đọc file này)
scripts/resolve-catalog.mjs  tra cứu winget / GitHub Releases / link trực tiếp / trang web
scripts/fetch-icons.mjs      tải icon vào public/icons/
src/                      ← giao diện React
src-tauri/src/            ← lõi Rust: tải, cài, đọc Registry, lưu cài đặt
design/art/               ← hình gốc mascot & banner (Codex vẽ)
```

App tải `catalog/resolved.json` từ nhánh `main` của repo này mỗi khi mở / bấm "Kiểm tra cập nhật",
nên **thêm phần mềm hay sửa link không cần phát hành lại app**. GitHub Actions (`.github/workflows/catalog.yml`)
chạy lại script hằng ngày để cập nhật phiên bản mới.

### Thêm một phần mềm

Thêm một mục vào `catalog/catalog.json`, ví dụ:

```jsonc
{ "id": "notepadpp", "name": "Notepad++", "category": "office", "homepage": "https://notepad-plus-plus.org/",
  "detect": ["Notepad++"],
  "desc": { "vi": "Soạn thảo văn bản & code nhẹ.", "en": "Lightweight text/code editor." },
  "source": { "type": "winget", "id": "Notepad++.Notepad++" } }
```

`source.type`:
| type | dùng khi | trường |
|---|---|---|
| `winget` | phần mềm có trong [winget-pkgs](https://github.com/microsoft/winget-pkgs) | `id`, `scope?` |
| `github` | phát hành qua GitHub Releases | `repo`, `asset` (regex), `installerType` |
| `direct` | link cố định luôn trỏ bản mới nhất | `url`, `installerType`, `silentArgs?`, `fileName?`, `version?` |
| `page` | link nằm trong trang tải | `page`, `pattern` (regex, nhóm 1 = phiên bản), `fallbackUrl` |

Tuỳ chọn khác: `installMode` (`silent` mặc định · `interactive` · `portable`), `launch` (exe trong gói portable),
`buyUrl` (nút "Mua bản quyền"), `icon` (URL icon), `detect` (tên trong *Programs and Features* để nhận biết đã cài).

Sau đó chạy `npm run catalog` (hoặc đẩy lên `main`, Actions sẽ tự chạy).

## Phát triển

Yêu cầu: Node 22+, Rust stable, Visual Studio Build Tools (C++).

```bash
npm install
npm run app:dev      # chạy app
npm run app:build    # build bộ cài NSIS → src-tauri/target/release/bundle/nsis/
npm run catalog      # cập nhật catalog/resolved.json (đặt GITHUB_TOKEN để tránh giới hạn API)
```

Bản release yêu cầu quyền Administrator khi mở (1 lần UAC) để cài silent phần mềm cho toàn máy.
Bản dev chạy quyền thường và tự xin UAC cho từng bộ cài khi cần.

Phát hành: tạo tag `v0.1.0` → workflow `release.yml` build và tạo GitHub Release (bản nháp).
