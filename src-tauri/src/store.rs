//! Lưu cài đặt app và thư viện (danh sách bộ cài đã tải).
use crate::models::{Library, Settings};
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn config_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_config_dir().context("không tìm thấy thư mục cấu hình")?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().context("không tìm thấy thư mục dữ liệu")?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn load_settings(app: &AppHandle) -> Settings {
    config_dir(app)
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join("settings.json")).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(app: &AppHandle, s: &Settings) -> Result<()> {
    let path = config_dir(app)?.join("settings.json");
    write_atomic(&path, &serde_json::to_vec_pretty(s)?)
}

pub fn download_root(app: &AppHandle) -> Result<PathBuf> {
    let s = load_settings(app);
    let dir = s
        .download_dir
        .filter(|d| !d.trim().is_empty())
        .context("Chưa chọn thư mục lưu phần mềm")?;
    let p = PathBuf::from(dir);
    std::fs::create_dir_all(&p).with_context(|| format!("Không tạo được thư mục {}", p.display()))?;
    Ok(p)
}

fn library_path(root: &Path) -> PathBuf {
    root.join(".soge").join("library.json")
}

pub fn load_library(root: &Path) -> Library {
    let mut lib: Library = std::fs::read_to_string(library_path(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    // Bỏ các mục mà file đã bị người dùng xoá tay
    lib.entries.retain(|_, e| root.join(&e.rel_path).exists());
    lib
}

pub fn save_library(root: &Path, lib: &Library) -> Result<()> {
    let path = library_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
        hide_dir(parent);
    }
    write_atomic(&path, &serde_json::to_vec_pretty(lib)?)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(windows)]
fn hide_dir(p: &Path) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("attrib")
        .arg("+h")
        .arg(p)
        .creation_flags(0x0800_0000)
        .status();
}
#[cfg(not(windows))]
fn hide_dir(_p: &Path) {}

/// Làm sạch tên thư mục/tệp cho Windows.
pub fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    if trimmed.is_empty() || trimmed == ".." {
        "_".into()
    } else {
        trimmed.to_string()
    }
}
