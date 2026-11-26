//! Các kiểm tra bảo mật. App chạy quyền Administrator nên KHÔNG tin bất cứ dữ liệu nào
//! nằm ở vùng người dùng thường ghi được (thư mục tải, %APPDATA%, danh mục chưa ký).
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Khoá công khai ed25519 dùng để xác minh catalog/resolved.json(.sig).
/// Khoá bí mật tương ứng chỉ nằm ở máy chủ repo (~/.soge) và GitHub Actions secret.
const CATALOG_PUBLIC_KEY_HEX: &str = "3ffdebec45a9df86446759886a82fb81eadeb776f249ac59223f545af03484e2";

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// Xác minh chữ ký danh mục. `sig_b64` là nội dung file .sig (base64).
pub fn verify_catalog(data: &[u8], sig_b64: &str) -> bool {
    let Ok(key_bytes) = hex::decode(CATALOG_PUBLIC_KEY_HEX) else { return false };
    let Ok(key_arr) = <[u8; 32]>::try_from(key_bytes.as_slice()) else { return false };
    let Ok(key) = VerifyingKey::from_bytes(&key_arr) else { return false };
    let Ok(sig_bytes) = base64::engine::general_purpose::STANDARD.decode(sig_b64.trim()) else { return false };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else { return false };
    key.verify(data, &sig).is_ok()
}

/// Đường dẫn có phải reparse point (junction/symlink) không.
pub fn is_reparse(p: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        std::fs::symlink_metadata(p)
            .map(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        std::fs::symlink_metadata(p).map(|m| m.file_type().is_symlink()).unwrap_or(false)
    }
}

/// Ghép `rel` vào `root` an toàn: chỉ chấp nhận đường dẫn tương đối gồm các thành phần thường
/// (không "..", không ổ đĩa/UNC), và không thành phần nào là junction/symlink.
pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel_path = Path::new(rel);
    if rel.is_empty() || rel_path.is_absolute() {
        bail!("Đường dẫn không hợp lệ");
    }
    let mut out = root.to_path_buf();
    for comp in rel_path.components() {
        match comp {
            Component::Normal(c) => {
                out.push(c);
                if is_reparse(&out) {
                    bail!("Phát hiện liên kết thư mục bất thường (junction) — đã chặn để bảo vệ máy");
                }
            }
            _ => bail!("Đường dẫn không hợp lệ"),
        }
    }
    Ok(out)
}

/// Tạo thư mục con dưới root (từng cấp), từ chối nếu gặp junction/symlink.
pub fn create_dir_safe(root: &Path, rel: &Path) -> Result<PathBuf> {
    let mut out = root.to_path_buf();
    for comp in rel.components() {
        let Component::Normal(c) = comp else { bail!("Đường dẫn không hợp lệ") };
        out.push(c);
        if is_reparse(&out) {
            bail!("Phát hiện liên kết thư mục bất thường (junction) — đã chặn để bảo vệ máy");
        }
        if !out.exists() {
            std::fs::create_dir(&out).with_context(|| format!("Không tạo được thư mục {}", out.display()))?;
        }
    }
    Ok(out)
}

pub fn sha256_file(p: &Path) -> Result<String> {
    let mut f = std::fs::File::open(p)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

/// Kiểm tra chữ ký số Authenticode (Windows). Trả về Some(tên nhà phát hành) nếu hợp lệ.
/// Đường dẫn truyền qua biến môi trường để tránh chèn lệnh.
pub async fn authenticode_signer(p: &Path) -> Option<String> {
    let script = "$s = Get-AuthenticodeSignature -LiteralPath $env:SOGE_VERIFY_PATH; \
                  if ($s.Status -eq 'Valid') { Write-Output ('OK|' + $s.SignerCertificate.Subject) } else { Write-Output ('NO|' + $s.Status) }";
    let mut cmd = tokio::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .env("SOGE_VERIFY_PATH", p);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().await.ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    text.strip_prefix("OK|").map(|s| {
        // Lấy CN=... cho gọn
        s.split(',')
            .find_map(|p| p.trim().strip_prefix("CN=").map(|x| x.trim_matches('"').to_string()))
            .unwrap_or_else(|| s.to_string())
    })
}

/// Thư mục tạm riêng cho mỗi lần cài: %ProgramData%\soge-staging-<ngẫu nhiên>.
/// Bản release (chạy Admin) khoá quyền chỉ Administrators/SYSTEM truy cập, để không ai
/// tráo bộ cài hoặc cài DLL độc cạnh bộ cài trước khi chạy.
pub async fn new_staging_dir() -> Result<PathBuf> {
    let base = std::env::var_os("ProgramData")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\ProgramData"));
    let name = format!("soge-staging-{}", random_hex(16));
    let dir = base.join(name);
    std::fs::create_dir(&dir).context("Không tạo được thư mục tạm để cài đặt")?;
    #[cfg(all(windows, not(debug_assertions)))]
    {
        let status = tokio::process::Command::new("icacls.exe")
            .arg(&dir)
            .args(["/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .await?;
        if !status.success() {
            let _ = std::fs::remove_dir_all(&dir);
            bail!("Không khoá được quyền thư mục tạm");
        }
    }
    // Phải trống: không ai được chen file vào trước khi khoá quyền
    if std::fs::read_dir(&dir)?.next().is_some() {
        bail!("Thư mục tạm bị can thiệp — đã dừng cài đặt");
    }
    Ok(dir)
}

/// Dọn các thư mục tạm cũ hơn 6 giờ (bộ cài khởi động có thể còn dùng file một lúc sau khi thoát).
pub fn cleanup_old_staging() {
    let Some(base) = std::env::var_os("ProgramData").map(PathBuf::from) else { return };
    let Ok(rd) = std::fs::read_dir(&base) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if !name.starts_with("soge-staging-") || is_reparse(&e.path()) {
            continue;
        }
        let old = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .map(|d| d.as_secs() > 6 * 3600)
            .unwrap_or(false);
        if old {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|e| anyhow!(e)).expect("os rng");
    hex::encode(buf)
}

/// Chỉ cho phép URL https (link tải, chuyển hướng).
pub fn is_https(url: &str) -> bool {
    url.len() > 8 && url[..8].eq_ignore_ascii_case("https://")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_signature_valid_and_tamper_detected() {
        let data = std::fs::read("../catalog/resolved.json").expect("resolved.json");
        let sig = std::fs::read_to_string("../catalog/resolved.json.sig").expect("resolved.json.sig");
        assert!(verify_catalog(&data, &sig), "chữ ký thật phải hợp lệ");
        let mut bad = data.clone();
        let i = bad.len() / 2;
        bad[i] ^= 1;
        assert!(!verify_catalog(&bad, &sig), "sửa 1 byte phải bị từ chối");
        assert!(!verify_catalog(&data, "AAAA"), "chữ ký rác phải bị từ chối");
        assert!(!verify_catalog(&data, ""), "thiếu chữ ký phải bị từ chối");
    }

    #[test]
    fn safe_join_rejects_escape() {
        let root = std::env::temp_dir().join(format!("soge-test-{}", random_hex(4)));
        std::fs::create_dir_all(root.join("a")).unwrap();
        assert!(safe_join(&root, "a/b.exe").is_ok());
        assert!(safe_join(&root, r"..\x.exe").is_err());
        assert!(safe_join(&root, r"a\..\..\x.exe").is_err());
        assert!(safe_join(&root, r"C:\Windows\System32\cmd.exe").is_err());
        assert!(safe_join(&root, r"\\host\share\x.msi").is_err());
        assert!(safe_join(&root, "").is_err());
        std::fs::remove_dir_all(&root).ok();
    }

    #[cfg(windows)]
    #[test]
    fn safe_join_rejects_junction() {
        let root = std::env::temp_dir().join(format!("soge-test-{}", random_hex(4)));
        let target = std::env::temp_dir().join(format!("soge-target-{}", random_hex(4)));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&target).unwrap();
        let link = root.join("j");
        let ok = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&target)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            assert!(is_reparse(&link));
            assert!(safe_join(&root, r"j\x.exe").is_err(), "đi qua junction phải bị chặn");
            assert!(create_dir_safe(&root, Path::new("j/sub")).is_err());
            std::fs::remove_dir(&link).ok();
        }
        std::fs::remove_dir_all(&root).ok();
        std::fs::remove_dir_all(&target).ok();
    }

    #[test]
    fn https_only() {
        assert!(is_https("https://example.com/a.exe"));
        assert!(!is_https("http://example.com/a.exe"));
        assert!(!is_https("file:///C:/x.exe"));
    }

    #[cfg(windows)]
    #[test]
    fn authenticode_accepts_signed_rejects_unsigned() {
        let signed = PathBuf::from(std::env::var("SystemRoot").unwrap_or("C:/Windows".into())).join("System32").join("msiexec.exe");
        let who = tauri::async_runtime::block_on(authenticode_signer(&signed));
        assert!(who.as_deref().unwrap_or("").contains("Microsoft"), "msiexec.exe phải có chữ ký Microsoft: {who:?}");
        let fake = std::env::temp_dir().join(format!("soge-fake-{}.exe", random_hex(4)));
        std::fs::write(&fake, b"MZ not really a program").unwrap();
        assert!(tauri::async_runtime::block_on(authenticode_signer(&fake)).is_none(), "file không ký phải bị từ chối");
        std::fs::remove_file(&fake).ok();
    }

}
