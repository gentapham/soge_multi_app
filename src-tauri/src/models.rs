use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Thông tin bản phát hành mới nhất của 1 phần mềm (do script resolve-catalog sinh ra).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub url: String,
    pub file_name: String,
    /// msi | wix | inno | nullsoft | burn | exe | zip | portable | msix | appx
    pub installer_type: String,
    #[serde(default)]
    pub silent_args: Option<Vec<String>>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    /// Nếu có: file tải về là zip, bên trong chứa bộ cài tên này
    #[serde(default)]
    pub archive_entry: Option<String>,
}

/// Yêu cầu tải 1 phần mềm, frontend gửi xuống.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub app_id: String,
    pub app_name: String,
    /// Thư mục cấp 1, ví dụ "Phan Mem Mien Phi"
    pub tab_folder: String,
    /// Thư mục cấp 2, ví dụ "Bo Go Chu"
    pub category_folder: String,
    pub release: Release,
    /// silent | interactive | portable
    #[serde(default)]
    pub install_mode: Option<String>,
    /// Tên file exe cần chạy với phần mềm portable (zip)
    #[serde(default)]
    pub launch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub app_id: String,
    pub app_name: String,
    pub version: String,
    pub file_name: String,
    /// Đường dẫn tương đối so với thư mục gốc
    pub rel_path: String,
    pub size: u64,
    pub installer_type: String,
    #[serde(default)]
    pub silent_args: Option<Vec<String>>,
    #[serde(default)]
    pub install_mode: Option<String>,
    #[serde(default)]
    pub launch: Option<String>,
    #[serde(default)]
    pub archive_entry: Option<String>,
    pub downloaded_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    #[serde(default)]
    pub entries: HashMap<String, LibraryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub download_dir: Option<String>,
    #[serde(default = "default_lang")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_concurrency")]
    pub max_concurrent: u32,
}

fn default_lang() -> String {
    "vi".into()
}
fn default_theme() -> String {
    "system".into()
}
fn default_concurrency() -> u32 {
    3
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_dir: None,
            language: default_lang(),
            theme: default_theme(),
            max_concurrent: default_concurrency(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProgram {
    pub name: String,
    pub version: Option<String>,
    pub publisher: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub app_id: String,
    pub received: u64,
    pub total: Option<u64>,
    /// bytes/giây
    pub speed: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub exit_code: i32,
    pub success: bool,
    pub needs_reboot: bool,
    pub mode: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPayload {
    /// remote | cache | bundled
    pub source: String,
    pub data: serde_json::Value,
}
