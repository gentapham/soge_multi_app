//! Chạy bộ cài (silent nếu được), giải nén phần mềm portable và tạo shortcut.
use crate::models::{InstallResult, LibraryEntry};
use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};


const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const ERROR_ELEVATION_REQUIRED: i32 = 740;

pub async fn install(root: &Path, entry: &LibraryEntry, force_interactive: bool) -> Result<InstallResult> {
    let file = root.join(&entry.rel_path);
    if !file.exists() {
        bail!("Không tìm thấy bộ cài, hãy tải lại.");
    }
    let kind = entry.installer_type.to_lowercase();
    let mode = entry.install_mode.clone().unwrap_or_else(|| "silent".into());

    if mode == "portable" || kind == "zip" || kind == "portable" {
        return install_portable(&file, entry).await;
    }

    // Bộ cài nằm trong file zip: giải nén ra thư mục "setup" rồi chạy file bên trong
    let file = match entry.archive_entry.as_deref() {
        Some(inner) => {
            let dir = file.parent().context("đường dẫn không hợp lệ")?.join("setup");
            extract_zip(&file, &dir).await?;
            find_exe(&dir, Some(inner)).with_context(|| format!("Không thấy {inner} trong file zip"))?
        }
        None => file,
    };

    let silent = !force_interactive && mode != "interactive";
    let (program, args): (PathBuf, Vec<String>) = match kind.as_str() {
        "msi" | "wix" => {
            let mut a = vec!["/i".to_string(), file.to_string_lossy().to_string(), "/norestart".into()];
            if silent {
                a.push("/qn".into());
            }
            (PathBuf::from("msiexec.exe"), a)
        }
        "msix" | "appx" => {
            let cmd = format!("Add-AppxPackage -Path '{}'", ps_escape(&file.to_string_lossy()));
            (
                PathBuf::from("powershell.exe"),
                vec!["-NoProfile".into(), "-ExecutionPolicy".into(), "Bypass".into(), "-Command".into(), cmd],
            )
        }
        _ => {
            let a = if silent {
                entry
                    .silent_args
                    .clone()
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| default_silent_args(&kind))
            } else {
                vec![]
            };
            (file.clone(), a)
        }
    };

    let really_silent = silent && (matches!(kind.as_str(), "msi" | "wix" | "msix" | "appx") || !args.is_empty());
    let code = run_and_wait(&program, &args).await?;
    let needs_reboot = code == 3010 || code == 1641;
    let success = code == 0 || needs_reboot;
    Ok(InstallResult {
        exit_code: code,
        success,
        needs_reboot,
        mode: if really_silent { "silent".into() } else { "interactive".into() },
        message: if success { None } else { Some(explain_exit_code(code)) },
    })
}

fn default_silent_args(kind: &str) -> Vec<String> {
    match kind {
        "inno" => vec!["/VERYSILENT".into(), "/SUPPRESSMSGBOXES".into(), "/NORESTART".into(), "/SP-".into()],
        "nullsoft" => vec!["/S".into()],
        "burn" => vec!["/quiet".into(), "/norestart".into()],
        _ => vec![],
    }
}

fn explain_exit_code(code: i32) -> String {
    match code {
        1602 => "Đã huỷ cài đặt.".into(),
        1618 => "Đang có một trình cài đặt khác chạy, thử lại sau.".into(),
        1223 => "Bạn đã từ chối quyền quản trị (UAC).".into(),
        _ => format!("Trình cài đặt kết thúc với mã lỗi {code}."),
    }
}

/// Chạy chương trình và chờ kết thúc. Nếu cần quyền admin mà app đang chạy quyền thường,
/// tự nâng quyền qua PowerShell Start-Process -Verb RunAs.
async fn run_and_wait(program: &Path, args: &[String]) -> Result<i32> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    if let Some(dir) = program.parent().filter(|p| p.is_absolute()) {
        cmd.current_dir(dir);
    }
    match cmd.spawn() {
        Ok(mut child) => {
            let status = child.wait().await?;
            Ok(status.code().unwrap_or(-1))
        }
        Err(e) if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) => run_elevated(program, args).await,
        Err(e) => Err(e).with_context(|| format!("Không chạy được {}", program.display())),
    }
}

async fn run_elevated(program: &Path, args: &[String]) -> Result<i32> {
    let arg_list = if args.is_empty() {
        String::new()
    } else {
        let quoted: Vec<String> = args
            .iter()
            .map(|a| {
                let inner = if a.contains(' ') { format!("\"{a}\"") } else { a.clone() };
                format!("'{}'", ps_escape(&inner))
            })
            .collect();
        format!(" -ArgumentList {}", quoted.join(","))
    };
    let script = format!(
        "$p = Start-Process -FilePath '{}'{} -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
        ps_escape(&program.to_string_lossy()),
        arg_list
    );
    let mut cmd = tokio::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let status = cmd.status().await?;
    // PowerShell trả 1 khi người dùng bấm "No" ở UAC
    Ok(status.code().unwrap_or(-1))
}

fn ps_escape(s: &str) -> String {
    s.replace('\'', "''")
}

async fn install_portable(file: &Path, entry: &LibraryEntry) -> Result<InstallResult> {
    let app_dir = file.parent().context("đường dẫn không hợp lệ")?.to_path_buf();
    let is_zip = file
        .extension()
        .map(|e| e.eq_ignore_ascii_case("zip"))
        .unwrap_or(false);

    let target_exe = if is_zip {
        let extract_dir = app_dir.join("app");
        extract_zip(file, &extract_dir).await?;
        find_exe(&extract_dir, entry.launch.as_deref()).context("Không tìm thấy file chạy trong gói")?
    } else {
        file.to_path_buf()
    };

    create_desktop_shortcut(&entry.app_name, &target_exe).await?;
    Ok(InstallResult {
        exit_code: 0,
        success: true,
        needs_reboot: false,
        mode: "portable".into(),
        message: Some(target_exe.to_string_lossy().to_string()),
    })
}

async fn extract_zip(file: &Path, dest: &Path) -> Result<()> {
    let f = file.to_path_buf();
    let ed = dest.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<()> {
        if ed.exists() {
            std::fs::remove_dir_all(&ed)?;
        }
        std::fs::create_dir_all(&ed)?;
        let mut archive = zip::ZipArchive::new(std::fs::File::open(&f)?).context("File zip bị lỗi")?;
        archive.extract(&ed).context("Giải nén thất bại")?;
        Ok(())
    })
    .await?
}

fn find_exe(dir: &Path, wanted: Option<&str>) -> Option<PathBuf> {
    let mut stack = vec![dir.to_path_buf()];
    let mut first_exe: Option<PathBuf> = None;
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if let Some(w) = wanted {
                if name.eq_ignore_ascii_case(w) {
                    return Some(p);
                }
            }
            if first_exe.is_none() && name.to_lowercase().ends_with(".exe") {
                first_exe = Some(p);
            }
        }
    }
    if wanted.is_some() {
        None
    } else {
        first_exe
    }
}

async fn create_desktop_shortcut(name: &str, target: &Path) -> Result<()> {
    let workdir = target.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let script = format!(
        "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d '{}.lnk')); $s.TargetPath='{}'; $s.WorkingDirectory='{}'; $s.Save()",
        ps_escape(&crate::store::sanitize(name)),
        ps_escape(&target.to_string_lossy()),
        ps_escape(&workdir)
    );
    let mut cmd = tokio::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let status = cmd.status().await?;
    if !status.success() {
        bail!("Không tạo được shortcut ngoài Desktop");
    }
    Ok(())
}

/// Đọc danh sách phần mềm đã cài từ Registry (Uninstall keys).
#[cfg(windows)]
pub fn installed_programs() -> Vec<crate::models::InstalledProgram> {
    use winreg::enums::*;
    use winreg::RegKey;
    let roots = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];
    let mut out = Vec::new();
    for (hive, path) in roots {
        let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ) else { continue };
        for sub in key.enum_keys().flatten() {
            let Ok(k) = key.open_subkey_with_flags(&sub, KEY_READ) else { continue };
            let Ok(name) = k.get_value::<String, _>("DisplayName") else { continue };
            if k.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1 {
                continue;
            }
            out.push(crate::models::InstalledProgram {
                name,
                version: k.get_value("DisplayVersion").ok(),
                publisher: k.get_value("Publisher").ok(),
            });
        }
    }
    out
}

#[cfg(not(windows))]
pub fn installed_programs() -> Vec<crate::models::InstalledProgram> {
    vec![]
}
