fn main() {
    // Bản release yêu cầu quyền Administrator ngay khi mở app (1 lần UAC) để cài silent
    // các phần mềm cài cho toàn máy. Bản dev giữ quyền thường để `tauri dev` chạy được.
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let mut attrs = tauri_build::Attributes::new();
    if profile == "release" {
        attrs = attrs.windows_attributes(
            tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest")),
        );
    }
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
