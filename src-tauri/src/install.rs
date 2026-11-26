//! Cài đặt: bộ cài được chép sang thư mục tạm chỉ Admin truy cập được, xác minh
//! (SHA256 khớp danh mục đã ký HOẶC chữ ký số Authenticode hợp lệ) rồi mới chạy.
//! Phần mềm portable được giải nén & tạo shortcut (chạy với quyền người dùng sau này).
use crate::download::remove_subdir_safe;
use crate::models::{AppInfo, InstallResult, LibraryEntry};
use crate::security;
use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const ERROR_ELEVATION_REQUIRED: i32 = 740;

pub async fn install(root: &Path, entry: &LibraryEntry, app: &AppInfo, force_interactive: bool) -> Result<InstallResult> {
    let file = security::safe_join(root, &entry.rel_path)?;
    if !file.is_file() {
        bail!("Không tìm thấy bộ cài, hãy tải lại.");
    }
    let release = app.release.as_ref().context("Phần mềm này chưa có thông tin bộ cài")?;
    let kind = release.installer_type.to_lowercase();
    let mode = app.install_mode.clone().unwrap_or_else(|| "silent".into());

    // Mã SHA256 của danh mục chỉ áp dụng khi file đúng là phiên bản đó
    let expected_sha = (entry.version == release.version)
        .then(|| release.sha256.clone())
        .flatten()
        .filter(|s| !s.is_empty());

    if mode == "portable" || kind == "zip" || kind == "portable" {
        return install_portable(root, &file, entry, app, expected_sha.as_deref()).await;
    }

    // 1. Chép sang thư mục tạm an toàn
    let staging = security::new_staging_dir().await?;
    let staged = staging.join(crate::store::sanitize(&entry.file_name));
    tokio::fs::copy(&file, &staged).await.context("Không chép được bộ cài sang thư mục tạm")?;

    // 2. Xác minh bản đã chép (không phải bản trong thư mục người dùng)
    let staged_c = staged.clone();
    let actual = tokio::task::spawn_blocking(move || security::sha256_file(&staged_c)).await??;
    let hash_ok = expected_sha.as_deref().map(|e| e.eq_ignore_ascii_case(&actual)).unwrap_or(false);

    // 3. Bộ cài nằm trong zip: giải nén trong thư mục tạm
    let program = match release.archive_entry.as_deref() {
        Some(inner) => {
            if !hash_ok {
                bail!("Không xác minh được gói cài đặt. Hãy tải lại.");
            }
            let dir = staging.join("x");
            extract_zip(&staged, &dir).await?;
            find_exe(&dir, Some(inner)).with_context(|| format!("Không thấy {inner} trong file zip"))?
        }
        None => staged.clone(),
    };

    // 4. Chữ ký số: bắt buộc nếu không có mã SHA256 để đối chiếu
    let is_pkg = kind == "msix" || kind == "appx";
    let signer = if is_pkg { None } else { security::authenticode_signer(&program).await };
    if !hash_ok && signer.is_none() && !is_pkg {
        bail!("Bộ cài không có chữ ký số hợp lệ và không có mã kiểm tra — đã chặn để bảo vệ máy. Bạn có thể tự cài từ trang chủ của phần mềm.");
    }

    let silent = !force_interactive && mode != "interactive";
    let (exe, args): (PathBuf, Vec<String>) = match kind.as_str() {
        "msi" | "wix" => {
            let mut a = vec!["/i".to_string(), program.to_string_lossy().to_string(), "/norestart".into()];
            if silent {
                a.push("/qn".into());
            }
            (system32("msiexec.exe"), a)
        }
        // Windows tự kiểm tra chữ ký gói MSIX khi cài
        "msix" | "appx" => (
            powershell(),
            vec![
                "-NoProfile".into(),
                "-ExecutionPolicy".into(),
                "Bypass".into(),
                "-Command".into(),
                "try { Add-AppxPackage -Path $env:SOGE_PKG -ErrorAction Stop; exit 0 } catch { $h = $_.Exception.HResult; if ($h -eq -2147009285 -or $h -eq -2147009274) { exit 1638 }; exit 1603 }".into(),
            ],
        ),
        _ => {
            let a = if silent {
                release
                    .silent_args
                    .clone()
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| default_silent_args(&kind))
            } else {
                vec![]
            };
            (program.clone(), a)
        }
    };

    let really_silent = silent && (matches!(kind.as_str(), "msi" | "wix" | "msix" | "appx") || !args.is_empty());
    let code = run_and_wait(&exe, &args, &staging, &program).await?;
    let needs_reboot = code == 3010 || code == 1641;
    // 1638: máy đã có phiên bản mới hơn/bằng — coi như thành công
    let success = code == 0 || needs_reboot || code == 1638;
    Ok(InstallResult {
        exit_code: code,
        success,
        needs_reboot,
        mode: if really_silent { "silent".into() } else { "interactive".into() },
        message: if success { None } else { Some(explain_exit_code(code)) },
        signer,
    })
}

fn system32(rel: &str) -> PathBuf {
    let win = std::env::var_os("SystemRoot").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    win.join("System32").join(rel)
}

fn powershell() -> PathBuf {
    system32("WindowsPowerShell\\v1.0\\powershell.exe")
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
        1603 => "Cài đặt thất bại (lỗi 1603). Hãy khởi động lại máy rồi thử lại.".into(),
        1625 => "Cài đặt bị chặn bởi chính sách của Windows.".into(),
        1618 => "Đang có một trình cài đặt khác chạy, thử lại sau.".into(),
        1223 | -1223 => "Bạn đã từ chối quyền quản trị (UAC).".into(),
        _ => format!("Trình cài đặt kết thúc với mã lỗi {code}."),
    }
}

/// Chạy & chờ kết thúc, thư mục làm việc là thư mục tạm an toàn. Nếu app đang chạy quyền
/// thường (bản dev) mà bộ cài cần Admin thì tự xin UAC.
async fn run_and_wait(program: &Path, args: &[String], workdir: &Path, pkg: &Path) -> Result<i32> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args).current_dir(workdir).env("SOGE_PKG", pkg);
    #[cfg(windows)]
    if program.file_name().map(|n| n.eq_ignore_ascii_case("powershell.exe")).unwrap_or(false) {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.spawn() {
        Ok(mut child) => Ok(child.wait().await?.code().unwrap_or(-1)),
        Err(e) if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) => run_elevated(program, args, workdir).await,
        Err(e) => Err(e).with_context(|| format!("Không chạy được {}", program.display())),
    }
}

async fn run_elevated(program: &Path, args: &[String], workdir: &Path) -> Result<i32> {
    // Đường dẫn & tham số truyền qua biến môi trường (không ghép chuỗi vào lệnh PowerShell)
    let joined = args
        .iter()
        .map(|a| if a.contains(' ') { format!("\"{a}\"") } else { a.clone() })
        .collect::<Vec<_>>()
        .join(" ");
    let script = "try { \
        if ($env:SOGE_ARGS) { $p = Start-Process -FilePath $env:SOGE_EXE -ArgumentList $env:SOGE_ARGS -WorkingDirectory $env:SOGE_WD -Verb RunAs -Wait -PassThru } \
        else { $p = Start-Process -FilePath $env:SOGE_EXE -WorkingDirectory $env:SOGE_WD -Verb RunAs -Wait -PassThru }; \
        exit $p.ExitCode } catch { exit 1223 }";
    let mut cmd = tokio::process::Command::new(powershell());
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .env("SOGE_EXE", program)
        .env("SOGE_ARGS", joined)
        .env("SOGE_WD", workdir);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    Ok(cmd.status().await?.code().unwrap_or(-1))
}

async fn install_portable(root: &Path, file: &Path, entry: &LibraryEntry, app: &AppInfo, expected_sha: Option<&str>) -> Result<InstallResult> {
    // Portable chạy với quyền người dùng sau này — vẫn kiểm tra mã nếu có
    if let Some(exp) = expected_sha {
        let f = file.to_path_buf();
        let actual = tokio::task::spawn_blocking(move || security::sha256_file(&f)).await??;
        if !actual.eq_ignore_ascii_case(exp) {
            bail!("File không khớp mã kiểm tra (có thể đã bị thay đổi). Hãy xoá và tải lại.");
        }
    }
    // Phần mềm portable nằm riêng ở <thư mục>\.soge\apps\<id>, tách khỏi bộ cài,
    // nên cập nhật/xoá bộ cài không làm hỏng app đang dùng.
    let apps_dir = security::create_dir_safe(root, Path::new(".soge").join("apps").as_path())?;
    let id = crate::store::sanitize(&app.id);
    let final_dir = apps_dir.join(&id);
    let new_name = format!("{id}.new");
    let new_dir = apps_dir.join(&new_name);
    remove_subdir_safe(&apps_dir, &new_name);
    let is_zip = file.extension().map(|e| e.eq_ignore_ascii_case("zip")).unwrap_or(false);
    if is_zip {
        extract_zip(file, &new_dir).await?;
    } else {
        std::fs::create_dir_all(&new_dir)?;
        let name = file.file_name().context("tên file lỗi")?;
        tokio::fs::copy(file, new_dir.join(name)).await?;
    }
    if security::is_reparse(&final_dir) {
        let _ = std::fs::remove_dir(&final_dir);
    } else if final_dir.exists() && std::fs::remove_dir_all(&final_dir).is_err() {
        remove_subdir_safe(&apps_dir, &new_name);
        bail!("{} đang chạy — hãy tắt phần mềm này (kể cả ở khay đồng hồ) rồi thử lại.", app.name);
    }
    std::fs::rename(&new_dir, &final_dir).context("Không đổi được thư mục phần mềm")?;
    let target_exe = if is_zip {
        find_exe(&final_dir, app.launch.as_deref())
            .or_else(|| find_exe(&final_dir, None))
            .context("Không tìm thấy file chạy trong gói")?
    } else {
        final_dir.join(file.file_name().context("tên file lỗi")?)
    };
    create_desktop_shortcut(&entry.app_name, &target_exe).await?;
    Ok(InstallResult {
        exit_code: 0,
        success: true,
        needs_reboot: false,
        mode: "portable".into(),
        message: Some(target_exe.to_string_lossy().to_string()),
        signer: None,
    })
}

async fn extract_zip(file: &Path, dest: &Path) -> Result<()> {
    let f = file.to_path_buf();
    let ed = dest.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<()> {
        if security::is_reparse(&ed) {
            std::fs::remove_dir(&ed)?;
        } else if ed.exists() {
            std::fs::remove_dir_all(&ed)?;
        }
        std::fs::create_dir_all(&ed)?;
        // zip::extract dùng enclosed_name nên chặn được "zip slip" (../)
        let mut archive = zip::ZipArchive::new(std::fs::File::open(&f)?).context("File zip bị lỗi")?;
        archive.extract(&ed).context("Giải nén thất bại")?;
        Ok(())
    })
    .await?
}

/// Tìm file exe: đúng tên `wanted` nếu có, nếu không thì exe lớn nhất (bỏ qua uninstall/updater).
fn find_exe(dir: &Path, wanted: Option<&str>) -> Option<PathBuf> {
    let mut stack = vec![dir.to_path_buf()];
    let mut candidates: Vec<(u64, PathBuf)> = Vec::new();
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if security::is_reparse(&p) {
                continue;
            }
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if let Some(w) = wanted {
                if name.eq_ignore_ascii_case(w) {
                    return Some(p);
                }
                continue;
            }
            let lower = name.to_lowercase();
            if lower.ends_with(".exe")
                && !["unins", "update", "crash", "helper", "vc_redist", "setup"].iter().any(|x| lower.contains(x))
            {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                candidates.push((size, p));
            }
        }
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates.into_iter().next().map(|c| c.1)
}

async fn create_desktop_shortcut(name: &str, target: &Path) -> Result<()> {
    let workdir = target.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let script = "$d=[Environment]::GetFolderPath('Desktop'); \
        $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d ($env:SOGE_NAME + '.lnk'))); \
        $s.TargetPath=$env:SOGE_TARGET; $s.WorkingDirectory=$env:SOGE_WD; $s.Save()";
    let mut cmd = tokio::process::Command::new(powershell());
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .env("SOGE_NAME", crate::store::sanitize(name))
        .env("SOGE_TARGET", target)
        .env("SOGE_WD", workdir);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    if !cmd.status().await?.success() {
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
