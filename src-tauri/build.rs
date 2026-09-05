fn main() {
    println!("cargo:rerun-if-env-changed=SOURCE_DATE_EPOCH");
    let timestamp = std::env::var("SOURCE_DATE_EPOCH").unwrap_or_else(|_| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("build timestamp")
            .as_secs()
            .to_string()
    });
    println!("cargo:rustc-env=WANGLAB_BUILD_TIMESTAMP={timestamp}");
    tauri_build::build()
}
