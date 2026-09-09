//! 为内网模型连接提供 Wanglab CA，保留正常证书验证及用户额外的信任根。

use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

const ROOT_CA: &[u8] = include_bytes!("../../certificates/wanglab-root-ca.pem");

pub(crate) fn root_certificate() -> Result<reqwest::Certificate, String> {
    reqwest::Certificate::from_pem(ROOT_CA).map_err(|e| format!("TLS_CA_INVALID: {e}"))
}

/// Node 仅在启动时读取一个额外 CA 文件；合并用户配置并以内容摘要命名，避免相互覆盖。
pub(crate) fn node_ca_bundle(base: &Path, extra: Option<&Path>) -> Result<PathBuf, String> {
    let mut contents = match extra {
        Some(path) => fs::read(path).unwrap_or_else(|error| {
            log::warn!("TLS_EXTRA_CA_READ_FAILED: {}: {error}", path.display());
            Vec::new()
        }),
        None => Vec::new(),
    };
    if !contents.windows(ROOT_CA.len()).any(|part| part == ROOT_CA) {
        if !contents.is_empty() {
            contents.push(b'\n');
        }
        contents.extend_from_slice(ROOT_CA);
    }
    let directory = base.join("certificates");
    let digest = format!("{:x}", Sha256::digest(&contents));
    let path = directory.join(format!("node-ca-{digest}.pem"));
    if fs::read(&path).ok().as_deref() != Some(contents.as_slice()) {
        fs::create_dir_all(&directory).map_err(|e| format!("TLS_CA_DIRECTORY_FAILED: {e}"))?;
        let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
        fs::write(&temporary, &contents).map_err(|e| format!("TLS_CA_WRITE_FAILED: {e}"))?;
        fs::rename(&temporary, &path).map_err(|e| format!("TLS_CA_RENAME_FAILED: {e}"))?;
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_bundle_preserves_extra_ca_and_changes_when_it_rotates() {
        let root = std::env::temp_dir().join(format!("wanglab-tls-bundle-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let extra = root.join("user-ca.pem");
        fs::write(&extra, b"user CA contents").unwrap();
        let first = node_ca_bundle(&root, Some(&extra)).unwrap();
        let contents = fs::read(&first).unwrap();
        assert!(contents.starts_with(b"user CA contents\n"));
        assert!(contents.ends_with(ROOT_CA));
        assert_eq!(fs::read(&extra).unwrap(), b"user CA contents");
        assert_eq!(node_ca_bundle(&root, Some(&first)).unwrap(), first);
        fs::write(&extra, b"rotated user CA").unwrap();
        let second = node_ca_bundle(&root, Some(&extra)).unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(&first).unwrap(), contents);
        assert!(fs::read(&second).unwrap().starts_with(b"rotated user CA\n"));
        let _ = fs::remove_dir_all(root);
    }
}
