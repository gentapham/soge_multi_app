//! Tải bộ cài: stream về file .part, báo tiến trình, kiểm tra SHA256,
//! xoá bản cũ của CHÍNH phần mềm đó rồi ghi vào thư viện.
use crate::models::{AppInfo, LibraryEntry, ProgressEvent};
use crate::security;
use crate::store::{self, sanitize};
use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

pub const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 SOGE-Multi-App/0.1";

#[derive(Default)]
pub struct DownloadState {
    pub cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Khoá ghi thư viện để các lượt tải song song không ghi đè nhau
    pub library_lock: tokio::sync::Mutex<()>,
}

/// HTTP client chỉ cho phép https, kể cả khi bị chuyển hướng.
pub fn http_client() -> Result<reqwest::Client> {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            attempt.error("Quá nhiều lần chuyển hướng")
        } else if attempt.url().scheme() != "https" {
            attempt.error("Từ chối chuyển hướng sang kết nối không mã hoá (http)")
        } else {
            attempt.follow()
        }
    });
    Ok(reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .https_only(true)
        .redirect(policy)
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .build()?)
}

fn lock<'a, T>(m: &'a Mutex<T>) -> std::sync::MutexGuard<'a, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub async fn download(app_handle: &AppHandle, state: &DownloadState, app: AppInfo) -> Result<LibraryEntry> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut c = lock(&state.cancels);
        if c.contains_key(&app.id) {
            bail!("Phần mềm này đang được tải");
        }
        c.insert(app.id.clone(), cancel.clone());
    }
    let res = download_inner(app_handle, state, &app, &cancel).await;
    lock(&state.cancels).remove(&app.id);
    res
}

async fn download_inner(app_handle: &AppHandle, state: &DownloadState, app: &AppInfo, cancel: &AtomicBool) -> Result<LibraryEntry> {
    let release = app.release.clone().context("Phần mềm này chưa có link tải")?;
    if !security::is_https(&release.url) {
        bail!("Link tải không an toàn (không phải https)");
    }
    let root = store::download_root(app_handle)?;
    let rel_dir = PathBuf::from(sanitize(&app.tab_folder))
        .join(sanitize(&app.category_folder))
        .join(sanitize(&app.name));
    let dir = security::create_dir_safe(&root, &rel_dir)?;

    let file_name = sanitize(&release.file_name);
    let final_path = dir.join(&file_name);
    let part_path = dir.join(format!("{file_name}.part"));

    let result = stream_to_file(app_handle, &app.id, &release, &part_path, cancel).await;
    let (size, sha) = match result {
        Ok(v) => v,
        Err(e) => {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(e);
        }
    };

    let _guard = state.library_lock.lock().await;
    let mut lib = store::load_library(&root);

    if security::is_reparse(&final_path) || final_path.is_dir() {
        let _ = std::fs::remove_file(&part_path);
        bail!("Tên file bị chiếm bởi một thư mục/liên kết lạ");
    }
    // Đổi tên trước (ghi đè nếu trùng tên), thành công rồi mới xoá bản cũ
    if let Err(e) = rename_with_retry(&part_path, &final_path).await {
        let _ = std::fs::remove_file(&part_path);
        return Err(e);
    }
    // Xoá bản cũ: CHỈ file đã ghi trong thư viện của chính app này (cùng thư mục).
    if let Some(old) = lib.entries.get(&app.id) {
        if let Ok(old_path) = security::safe_join(&root, &old.rel_path) {
            if old_path != final_path && old_path.parent() == Some(dir.as_path()) {
                let _ = std::fs::remove_file(&old_path);
            }
        }
    }
    remove_subdir_safe(&dir, "setup");

    let entry = LibraryEntry {
        app_id: app.id.clone(),
        app_name: app.name.clone(),
        version: release.version.clone(),
        file_name: file_name.clone(),
        rel_path: rel_dir.join(&file_name).to_string_lossy().to_string(),
        size,
        sha256: Some(sha),
        installer_type: release.installer_type.clone(),
        downloaded_at: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0),
    };
    lib.entries.insert(entry.app_id.clone(), entry.clone());
    store::save_library(&root, &lib)?;
    Ok(entry)
}

/// Xoá thư mục con (vd. "app" đã giải nén) — bỏ qua nếu là junction.
pub fn remove_subdir_safe(dir: &Path, name: &str) {
    let p = dir.join(name);
    if security::is_reparse(&p) {
        let _ = std::fs::remove_dir(&p); // chỉ gỡ liên kết, không đi vào bên trong
        return;
    }
    if p.is_dir() {
        let _ = std::fs::remove_dir_all(&p);
    }
}

/// Phần mềm diệt virus thường khoá file vừa tải vài giây để quét — thử lại vài lần.
async fn rename_with_retry(from: &Path, to: &Path) -> Result<()> {
    let mut last = None;
    for _ in 0..8 {
        match tokio::fs::rename(from, to).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last = Some(e);
                tokio::time::sleep(Duration::from_millis(700)).await;
            }
        }
    }
    Err(last.map(anyhow::Error::from).unwrap_or_else(|| anyhow::anyhow!("rename failed")))
        .context("Không đổi tên được file vừa tải (có thể phần mềm diệt virus đang quét)")
}

async fn stream_to_file(
    app: &AppHandle,
    app_id: &str,
    release: &crate::models::Release,
    part_path: &Path,
    cancel: &AtomicBool,
) -> Result<(u64, String)> {
    let client = http_client()?;
    let resp = client
        .get(&release.url)
        .send()
        .await
        .context("Không kết nối được tới máy chủ tải")?;
    if !resp.status().is_success() {
        bail!("Máy chủ trả về lỗi HTTP {}", resp.status());
    }
    let total = resp.content_length().or(release.size);
    // Luôn xoá .part cũ: nếu nó là symlink/hardlink do kẻ xấu tạo sẵn thì chỉ gỡ cái tên,
    // không ghi xuyên vào file thật ở nơi khác.
    let _ = std::fs::remove_file(part_path);
    let mut file = tokio::fs::File::create(part_path).await?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();

    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut window_start = Instant::now();
    let mut window_bytes: u64 = 0;
    let mut speed: u64 = 0;

    loop {
        let next = tokio::select! {
            n = stream.next() => n,
            _ = tokio::time::sleep(Duration::from_millis(300)) => {
                if cancel.load(Ordering::Relaxed) {
                    bail!("CANCELLED");
                }
                continue;
            }
        };
        let Some(chunk) = next else { break };
        if cancel.load(Ordering::Relaxed) {
            bail!("CANCELLED");
        }
        let chunk = chunk.context("Mất kết nối khi đang tải")?;
        file.write_all(&chunk).await?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        window_bytes += chunk.len() as u64;

        let win = window_start.elapsed();
        if win >= Duration::from_millis(800) {
            speed = (window_bytes as f64 / win.as_secs_f64()) as u64;
            window_start = Instant::now();
            window_bytes = 0;
        }
        if last_emit.elapsed() >= Duration::from_millis(150) {
            last_emit = Instant::now();
            let _ = app.emit(
                "download://progress",
                ProgressEvent { app_id: app_id.to_string(), received, total, speed },
            );
        }
    }
    file.flush().await?;
    file.sync_all().await.ok();
    drop(file);

    if received == 0 {
        bail!("File tải về bị rỗng");
    }
    let actual = hex::encode(hasher.finalize());
    if let Some(expected) = release.sha256.as_deref().filter(|s| !s.is_empty()) {
        if !actual.eq_ignore_ascii_case(expected) {
            // Link cố định (không có số phiên bản) có thể đã lên bản mới hơn danh mục.
            // Chỉ chấp nhận nếu file có chữ ký số hợp lệ; nếu không thì từ chối.
            if security::authenticode_signer(part_path).await.is_none() {
                bail!("File tải về không khớp mã kiểm tra SHA256 (có thể bị lỗi mạng hoặc bị can thiệp). Vui lòng thử lại sau.");
            }
        }
    }
    let _ = app.emit(
        "download://progress",
        ProgressEvent { app_id: app_id.to_string(), received, total: Some(received), speed },
    );
    Ok((received, actual))
}

pub fn cancel(state: &DownloadState, app_id: &str) -> bool {
    if let Some(flag) = lock(&state.cancels).get(app_id) {
        flag.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}
