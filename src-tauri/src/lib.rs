mod download;
mod install;
mod models;
mod store;

use download::DownloadState;
use models::*;
use std::time::Duration;
use tauri::{AppHandle, State};

/// Danh mục phần mềm đã được resolve (phiên bản + link mới nhất), cập nhật hằng ngày bởi GitHub Actions.
const REMOTE_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/gentapham/soge_multi_app/main/catalog/resolved.json";
const BUNDLED_CATALOG: &str = include_str!("../../catalog/resolved.json");

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    store::load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> CmdResult<Settings> {
    if let Some(dir) = settings.download_dir.as_deref().filter(|d| !d.is_empty()) {
        std::fs::create_dir_all(dir).map_err(|e| format!("Không tạo được thư mục: {e}"))?;
        // Kiểm tra quyền ghi
        let probe = std::path::Path::new(dir).join(".soge-write-test");
        std::fs::write(&probe, b"ok").map_err(|_| "Không có quyền ghi vào thư mục này, hãy chọn thư mục khác.".to_string())?;
        let _ = std::fs::remove_file(probe);
    }
    store::save_settings(&app, &settings).map_err(err)?;
    Ok(settings)
}

#[tauri::command]
async fn load_catalog(app: AppHandle, prefer_remote: bool) -> CmdResult<CatalogPayload> {
    let cache = store::data_dir(&app).map_err(err)?.join("catalog-cache.json");
    if prefer_remote {
        if let Ok(client) = download::http_client() {
            let url = format!(
                "{REMOTE_CATALOG_URL}?t={}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0)
            );
            let res = client.get(url).timeout(Duration::from_secs(8)).send().await;
            if let Ok(resp) = res {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                            if data.get("apps").is_some() {
                                let _ = std::fs::write(&cache, &text);
                                return Ok(CatalogPayload { source: "remote".into(), data });
                            }
                        }
                    }
                }
            }
        }
    }
    let bundled: serde_json::Value = serde_json::from_str(BUNDLED_CATALOG).map_err(err)?;
    if let Some(cached) = std::fs::read_to_string(&cache)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    {
        // Dùng bản mới hơn giữa cache và bản đóng gói
        let ts = |v: &serde_json::Value| v.get("generatedAt").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if ts(&cached) >= ts(&bundled) {
            return Ok(CatalogPayload { source: "cache".into(), data: cached });
        }
    }
    Ok(CatalogPayload { source: "bundled".into(), data: bundled })
}

#[tauri::command]
fn get_library(app: AppHandle) -> CmdResult<Library> {
    match store::download_root(&app) {
        Ok(root) => Ok(store::load_library(&root)),
        Err(_) => Ok(Library::default()),
    }
}

#[tauri::command]
async fn download_app(
    app: AppHandle,
    state: State<'_, DownloadState>,
    request: DownloadRequest,
) -> CmdResult<LibraryEntry> {
    download::download(&app, &state, request).await.map_err(err)
}

#[tauri::command]
fn cancel_download(state: State<'_, DownloadState>, app_id: String) -> bool {
    download::cancel(&state, &app_id)
}

#[tauri::command]
async fn install_app(app: AppHandle, app_id: String, interactive: bool) -> CmdResult<InstallResult> {
    let root = store::download_root(&app).map_err(err)?;
    let lib = store::load_library(&root);
    let entry = lib
        .entries
        .get(&app_id)
        .ok_or_else(|| "Chưa tải bộ cài của phần mềm này.".to_string())?
        .clone();
    install::install(&root, &entry, interactive).await.map_err(err)
}

#[tauri::command]
fn delete_download(app: AppHandle, app_id: String) -> CmdResult<()> {
    let root = store::download_root(&app).map_err(err)?;
    let mut lib = store::load_library(&root);
    if let Some(e) = lib.entries.remove(&app_id) {
        if let Some(dir) = root.join(&e.rel_path).parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
        store::save_library(&root, &lib).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
async fn installed_programs() -> Vec<InstalledProgram> {
    tokio::task::spawn_blocking(install::installed_programs)
        .await
        .unwrap_or_default()
}

/// Mở thư mục gốc, hoặc chọn sẵn file bộ cài của 1 phần mềm trong Explorer.
#[tauri::command]
fn reveal(app: AppHandle, app_id: Option<String>) -> CmdResult<()> {
    let root = store::download_root(&app).map_err(err)?;
    let mut cmd = std::process::Command::new("explorer.exe");
    match app_id.and_then(|id| store::load_library(&root).entries.get(&id).cloned()) {
        Some(e) => {
            cmd.arg(format!("/select,{}", root.join(&e.rel_path).display()));
        }
        None => {
            cmd.arg(&root);
        }
    }
    cmd.spawn().map_err(err)?;
    Ok(())
}

#[tauri::command]
fn suggest_download_dir() -> String {
    for drive in ["D", "E", "F"] {
        let root = format!("{drive}:\\");
        if std::path::Path::new(&root).exists() {
            return format!("{drive}:\\SOGE Software");
        }
    }
    "C:\\SOGE Software".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DownloadState::default())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            load_catalog,
            get_library,
            download_app,
            cancel_download,
            install_app,
            delete_download,
            installed_programs,
            reveal,
            suggest_download_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
