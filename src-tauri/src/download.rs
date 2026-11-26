//! Tải bộ cài: stream về file .part, báo tiến trình, kiểm tra SHA256,
//! xoá bản cũ trong thư mục của phần mềm rồi ghi vào thư viện.
use crate::models::{DownloadRequest, LibraryEntry, ProgressEvent};
use crate::store::{self, sanitize};
use anyhow::{anyhow, bail, Context, Result};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
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
}

pub fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .build()?)
}

pub async fn download(
    app: &AppHandle,
    state: &DownloadState,
    req: DownloadRequest,
) -> Result<LibraryEntry> {
    let root = store::download_root(app)?;
    let rel_dir = PathBuf::from(sanitize(&req.tab_folder))
        .join(sanitize(&req.category_folder))
        .join(sanitize(&req.app_name));
    let dir = root.join(&rel_dir);
    tokio::fs::create_dir_all(&dir)
        .await
        .with_context(|| format!("Không tạo được thư mục {}", dir.display()))?;

    let file_name = sanitize(&req.release.file_name);
    let final_path = dir.join(&file_name);
    let part_path = dir.join(format!("{file_name}.part"));

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .cancels
        .lock()
        .unwrap()
        .insert(req.app_id.clone(), cancel.clone());

    let result = stream_to_file(app, &req, &part_path, &cancel).await;
    state.cancels.lock().unwrap().remove(&req.app_id);

    let size = match result {
        Ok(s) => s,
        Err(e) => {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(e);
        }
    };

    // Xoá bản cũ (mọi thứ khác trong thư mục phần mềm), rồi đổi tên file mới.
    let mut rd = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let p = entry.path();
        if p == part_path {
            continue;
        }
        if entry.file_type().await?.is_dir() {
            let _ = tokio::fs::remove_dir_all(&p).await;
        } else {
            let _ = tokio::fs::remove_file(&p).await;
        }
    }
    tokio::fs::rename(&part_path, &final_path)
        .await
        .context("Không đổi tên được file vừa tải")?;

    let entry = LibraryEntry {
        app_id: req.app_id.clone(),
        app_name: req.app_name.clone(),
        version: req.release.version.clone(),
        file_name: file_name.clone(),
        rel_path: rel_dir.join(&file_name).to_string_lossy().to_string(),
        size,
        installer_type: req.release.installer_type.clone(),
        silent_args: req.release.silent_args.clone(),
        install_mode: req.install_mode.clone(),
        launch: req.launch.clone(),
        archive_entry: req.release.archive_entry.clone(),
        downloaded_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    let mut lib = store::load_library(&root);
    lib.entries.insert(entry.app_id.clone(), entry.clone());
    store::save_library(&root, &lib)?;
    Ok(entry)
}

async fn stream_to_file(
    app: &AppHandle,
    req: &DownloadRequest,
    part_path: &PathBuf,
    cancel: &AtomicBool,
) -> Result<u64> {
    let client = http_client()?;
    let resp = client
        .get(&req.release.url)
        .send()
        .await
        .context("Không kết nối được tới máy chủ tải")?;
    if !resp.status().is_success() {
        bail!("Máy chủ trả về lỗi HTTP {}", resp.status());
    }
    let total = resp.content_length().or(req.release.size);
    let mut file = tokio::fs::File::create(part_path).await?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();

    let started = Instant::now();
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut window_start = Instant::now();
    let mut window_bytes: u64 = 0;
    let mut speed: u64 = 0;

    while let Some(chunk) = stream.next().await {
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
            if speed == 0 && started.elapsed().as_secs_f64() > 0.0 {
                speed = (received as f64 / started.elapsed().as_secs_f64()) as u64;
            }
            let _ = app.emit(
                "download://progress",
                ProgressEvent { app_id: req.app_id.clone(), received, total, speed },
            );
        }
    }
    file.flush().await?;
    drop(file);

    if received == 0 {
        bail!("File tải về bị rỗng");
    }
    if let Some(expected) = req.release.sha256.as_deref().filter(|s| !s.is_empty()) {
        let actual = hex::encode(hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(anyhow!(
                "File tải về không khớp mã kiểm tra SHA256 (có thể bị lỗi mạng). Vui lòng thử lại."
            ));
        }
    }
    let _ = app.emit(
        "download://progress",
        ProgressEvent { app_id: req.app_id.clone(), received, total: Some(received), speed },
    );
    Ok(received)
}

pub fn cancel(state: &DownloadState, app_id: &str) -> bool {
    if let Some(flag) = state.cancels.lock().unwrap().get(app_id) {
        flag.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}
