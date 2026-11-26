mod download;
mod install;
mod models;
mod security;
mod store;

use download::DownloadState;
use models::*;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, State};

/// Danh mục phần mềm đã resolve, kèm chữ ký ed25519 (.sig). Cập nhật bởi GitHub Actions.
const REMOTE_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/gentapham/soge_multi_app/main/catalog/resolved.json";
/// Bản đóng gói sẵn trong app (nằm trong file exe nên được tin cậy).
const BUNDLED_CATALOG: &str = include_str!("../../catalog/resolved.json");

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    format!("{e:#}")
}

/// Danh mục đã xác minh mà backend dùng để quyết định tải/cài gì.
/// Frontend chỉ gửi app_id, không bao giờ gửi link/tham số cài.
#[derive(Default)]
struct CatalogState(Mutex<Option<serde_json::Value>>);

/// Chỉ chạy một trình cài đặt tại một thời điểm (kể cả khi giao diện bị tải lại).
#[derive(Default)]
struct InstallLock(tokio::sync::Mutex<()>);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn app_info(state: &CatalogState, app_id: &str) -> Result<AppInfo, String> {
    let guard = lock(&state.0);
    let cat = guard.as_ref().ok_or("Danh mục chưa sẵn sàng, hãy thử lại.")?;
    let apps = cat.get("apps").and_then(|a| a.as_array()).ok_or("Danh mục lỗi")?;
    let app = apps
        .iter()
        .find(|a| a.get("id").and_then(|x| x.as_str()) == Some(app_id))
        .ok_or("Không tìm thấy phần mềm trong danh mục")?;
    let s = |k: &str| app.get(k).and_then(|x| x.as_str()).map(String::from);
    let tab_id = s("tab").unwrap_or_default();
    let cat_id = s("category").unwrap_or_default();
    let folder = |list: &str, id: &str| {
        cat.get(list)
            .and_then(|a| a.as_array())
            .and_then(|a| a.iter().find(|x| x.get("id").and_then(|v| v.as_str()) == Some(id)))
            .and_then(|x| x.get("folder"))
            .and_then(|x| x.as_str())
            .map(String::from)
            .unwrap_or_else(|| id.to_string())
    };
    let release: Option<Release> = app
        .get("release")
        .filter(|r| !r.is_null())
        .and_then(|r| serde_json::from_value(r.clone()).ok());
    Ok(AppInfo {
        id: app_id.to_string(),
        name: s("name").unwrap_or_else(|| app_id.to_string()),
        tab_folder: folder("tabs", &tab_id),
        category_folder: folder("categories", &cat_id),
        install_mode: s("installMode"),
        launch: s("launch"),
        release,
    })
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    store::load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> CmdResult<Settings> {
    let mut settings = settings;
    settings.max_concurrent = settings.max_concurrent.clamp(1, 8);
    if let Some(dir) = settings.download_dir.as_deref().filter(|d| !d.is_empty()) {
        let p = std::path::Path::new(dir);
        if !p.is_absolute() {
            return Err("Hãy chọn một thư mục hợp lệ.".into());
        }
        std::fs::create_dir_all(p).map_err(|e| format!("Không tạo được thư mục: {e}"))?;
        let probe = p.join(format!(".soge-write-test-{}", security::random_hex(4)));
        std::fs::write(&probe, b"ok").map_err(|_| "Không có quyền ghi vào thư mục này, hãy chọn thư mục khác.".to_string())?;
        let _ = std::fs::remove_file(probe);
    }
    store::save_settings(&app, &settings).map_err(err)?;
    Ok(settings)
}

/// Tải danh mục: ưu tiên bản mới nhất trên GitHub, rồi bản lưu tạm, rồi bản đóng gói.
/// Bản trên mạng & bản lưu tạm CHỈ được dùng khi chữ ký ed25519 hợp lệ.
#[tauri::command]
async fn load_catalog(app: AppHandle, state: State<'_, CatalogState>, prefer_remote: bool) -> CmdResult<CatalogPayload> {
    let dir = store::data_dir(&app).map_err(err)?;
    let cache = dir.join("catalog-cache.json");
    let cache_sig = dir.join("catalog-cache.json.sig");
    let bundled: serde_json::Value = serde_json::from_str(BUNDLED_CATALOG).map_err(err)?;
    let ts = |v: &serde_json::Value| v.get("generatedAt").and_then(|x| x.as_str()).unwrap_or("").to_string();

    let mut chosen: Option<(String, serde_json::Value)> = None;
    if prefer_remote {
        if let Ok((text, sig)) = fetch_remote_catalog().await {
            if security::verify_catalog(text.as_bytes(), &sig) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                    if data.get("apps").is_some() {
                        let _ = std::fs::write(&cache, &text);
                        let _ = std::fs::write(&cache_sig, &sig);
                        chosen = Some(("remote".into(), data));
                    }
                }
            }
        }
    }
    if chosen.is_none() {
        let cached = std::fs::read(&cache).ok().zip(std::fs::read_to_string(&cache_sig).ok());
        if let Some((bytes, sig)) = cached {
            if security::verify_catalog(&bytes, &sig) {
                if let Ok(data) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if ts(&data) >= ts(&bundled) {
                        chosen = Some(("cache".into(), data));
                    }
                }
            }
        }
    }
    let (source, data) = chosen.unwrap_or_else(|| ("bundled".into(), bundled));
    *lock(&state.0) = Some(data.clone());
    Ok(CatalogPayload { source, data })
}

async fn fetch_remote_catalog() -> anyhow::Result<(String, String)> {
    let client = download::http_client()?;
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let get = |url: String| {
        let c = client.clone();
        async move {
            let r = c.get(url).timeout(Duration::from_secs(8)).send().await?.error_for_status()?;
            anyhow::Ok(r.text().await?)
        }
    };
    let (text, sig) = tokio::try_join!(
        get(format!("{REMOTE_CATALOG_URL}?t={t}")),
        get(format!("{REMOTE_CATALOG_URL}.sig?t={t}"))
    )?;
    Ok((text, sig))
}

#[tauri::command]
async fn get_library(app: AppHandle) -> CmdResult<Library> {
    match store::download_root(&app) {
        Ok(root) => Ok(tokio::task::spawn_blocking(move || store::load_library(&root)).await.unwrap_or_default()),
        Err(_) => Ok(Library::default()),
    }
}

#[tauri::command]
async fn download_app(
    app: AppHandle,
    dl: State<'_, DownloadState>,
    catalog: State<'_, CatalogState>,
    app_id: String,
) -> CmdResult<LibraryEntry> {
    let info = app_info(&catalog, &app_id)?;
    download::download(&app, &dl, info).await.map_err(err)
}

#[tauri::command]
fn cancel_download(state: State<'_, DownloadState>, app_id: String) -> bool {
    download::cancel(&state, &app_id)
}

#[tauri::command]
async fn install_app(
    app: AppHandle,
    catalog: State<'_, CatalogState>,
    install_lock: State<'_, InstallLock>,
    app_id: String,
    interactive: bool,
) -> CmdResult<InstallResult> {
    let info = app_info(&catalog, &app_id)?;
    let _guard = install_lock.0.lock().await;
    let root = store::download_root(&app).map_err(err)?;
    let lib = store::load_library(&root);
    let entry = lib
        .entries
        .get(&app_id)
        .ok_or_else(|| "Chưa tải bộ cài của phần mềm này.".to_string())?
        .clone();
    install::install(&root, &entry, &info, interactive).await.map_err(err)
}

/// Xoá bộ cài đã tải (chỉ file bộ cài & thư mục giải nén tạm của nó; phần mềm portable
/// đã "cài" nằm ở chỗ khác nên không bị ảnh hưởng).
#[tauri::command]
async fn delete_download(app: AppHandle, dl: State<'_, DownloadState>, app_id: String) -> CmdResult<()> {
    let root = store::download_root(&app).map_err(err)?;
    let _guard = dl.library_lock.lock().await;
    let mut lib = store::load_library(&root);
    if let Some(e) = lib.entries.remove(&app_id) {
        let file = security::safe_join(&root, &e.rel_path).map_err(err)?;
        let _ = std::fs::remove_file(&file);
        if let Some(dir) = file.parent() {
            download::remove_subdir_safe(dir, "setup");
            let _ = std::fs::remove_dir(dir); // chỉ xoá nếu thư mục đã trống
        }
        store::save_library(&root, &lib).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
async fn installed_programs() -> Vec<InstalledProgram> {
    tokio::task::spawn_blocking(install::installed_programs).await.unwrap_or_default()
}

/// Mở thư mục gốc, hoặc chọn sẵn file bộ cài của 1 phần mềm trong Explorer.
#[tauri::command]
fn reveal(app: AppHandle, app_id: Option<String>) -> CmdResult<()> {
    let root = store::download_root(&app).map_err(err)?;
    let mut cmd = std::process::Command::new("explorer.exe");
    let entry = app_id.and_then(|id| store::load_library(&root).entries.get(&id).cloned());
    match entry.and_then(|e| security::safe_join(&root, &e.rel_path).ok()) {
        Some(p) => {
            cmd.arg(format!("/select,{}", p.display()));
        }
        None => {
            cmd.arg(&root);
        }
    }
    cmd.spawn().map_err(err)?;
    Ok(())
}

/// Mở link https trong trình duyệt mặc định. Đi qua explorer.exe để trình duyệt chạy
/// với quyền người dùng thường (không thừa hưởng quyền Admin của app).
#[tauri::command]
fn open_url(url: String) -> CmdResult<()> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Link không hợp lệ".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Chỉ mở được link https".into());
    }
    std::process::Command::new("explorer.exe").arg(parsed.as_str()).spawn().map_err(err)?;
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
    std::thread::spawn(security::cleanup_old_staging);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(DownloadState::default())
        .manage(CatalogState::default())
        .manage(InstallLock::default())
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
            open_url,
            suggest_download_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
