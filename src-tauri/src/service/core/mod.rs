//! Harness 核心管理。
//!
//! 核心来源：
//! - `local`：用户通过 CLI（npm/pnpm 全局安装）自行安装的 dsh，安装目录与
//!   配置（`$DSH_HOME`）都不归桌面端管理；
//! - `app`：桌面端预打包管理的 deepseek-harness-pkg 多版本副本。激活版本固定
//!   位于 `dependencies/dsh`（既有代码全部依赖该路径），通过「核心」面板下载的
//!   历史版本存放在 `dependencies/dsh-<tag>` 槽位，切换时两个目录互换。debug 与
//!   release 的整个 AppData 根目录不同，因此两套构建不会互换或覆盖对方核心。
//!
//! Wanglab 内网发行版固定使用与 Desktop 配套的预打包核心。面板只显示当前
//! 版本，配套核心安装完成后清理应用管理的历史槽位。
//!
//! 本地核心更新通过其包管理器 CLI 完成（npm `update -g` / pnpm `add -g`），
//! 不触碰用户安装本身之外的文件。
//!
//! 模块划分（参考 `service/cli/`、`service/download/`）：
//! - [`local`]：本地核心发现（PATH/全局安装目录探测、包目录解析、更新本地核心）
//! - [`source`]：核心来源与活动入口（`CoreSource` / `HarnessCore` / 活动核心）
//! - [`version`]：预打包核心多版本管理（列出 / 切换 / 下载 / 卸载）

mod local;
mod runtime;
mod source;
mod version;

pub use local::{local_core_package_dir, update_local_core};
// 以下重导出为对外公开 API（部分项当前链路未直接引用，属有意保留，见模块头）。
pub(crate) use runtime::prepare_active_runtime;
pub(crate) use runtime::create_directory_link;
#[allow(unused_imports)]
pub use source::{active_dsh_binary, active_source, active_version, CoreSource, HarnessCore};
pub(crate) use version::prune_inactive;
pub use version::{download_version, has_installed_version, list, remove_version, set_active};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PairedCoreState {
    Ready,
    RepairTag,
    InstallRequired,
}

/// 只有实际版本、入口和完整提交都吻合时，旧标签才可直接修复。
fn classify_paired_core(
    manifest_version: Option<&str>,
    record_commit: Option<&str>,
    record_tag: Option<&str>,
    entry_exists: bool,
) -> PairedCoreState {
    if manifest_version != Some(crate::config::WANGLAB_DSH_VERSION)
        || record_commit != Some(crate::config::WANGLAB_DSH_COMMIT)
        || !entry_exists
    {
        PairedCoreState::InstallRequired
    } else if record_tag != Some(crate::config::WANGLAB_DSH_TAG) {
        PairedCoreState::RepairTag
    } else {
        PairedCoreState::Ready
    }
}

/// 安装与启动共用同一配套判定，避免安装跳过后启动却拒绝放行。
pub(crate) fn paired_core_state(app_handle: &tauri::AppHandle) -> PairedCoreState {
    let setting = crate::config::get_store_dat_setting(app_handle);
    classify_paired_core(
        crate::config::get_dsh_version(app_handle).as_deref(),
        setting.dsh_pkg_commit.as_deref(),
        setting.dsh_pkg_tag.as_deref(),
        crate::config::get_dsh_binary_path(app_handle).is_file(),
    )
}

pub(crate) fn paired_core_ready(app_handle: &tauri::AppHandle) -> bool {
    paired_core_state(app_handle) == PairedCoreState::Ready
}

/// 旧核心不得安装新版内置插件或进入启动流程。
pub(crate) fn require_paired_core(app_handle: &tauri::AppHandle) -> Result<(), String> {
    if paired_core_ready(app_handle) {
        Ok(())
    } else {
        let setting = crate::config::get_store_dat_setting(app_handle);
        log::error!(
            "Paired Core mismatch: manifest={:?}, tag={:?}, commit={:?}, entry_exists={}",
            crate::config::get_dsh_version(app_handle),
            setting.dsh_pkg_tag,
            setting.dsh_pkg_commit,
            crate::config::get_dsh_binary_path(app_handle).is_file()
        );
        Err(format!(
            "CORE_INSTALL_REQUIRED: install the paired Core {} before starting Harness",
            crate::config::WANGLAB_DSH_VERSION
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_paired_core, PairedCoreState};
    use crate::config::{WANGLAB_DSH_COMMIT, WANGLAB_DSH_TAG, WANGLAB_DSH_VERSION};

    #[test]
    fn exact_pair_is_ready() {
        assert_eq!(
            classify_paired_core(
                Some(WANGLAB_DSH_VERSION),
                Some(WANGLAB_DSH_COMMIT),
                Some(WANGLAB_DSH_TAG),
                true,
            ),
            PairedCoreState::Ready
        );
    }

    #[test]
    fn installed_paired_commit_repairs_old_or_missing_tag() {
        for tag in [Some("dsh-0.1.2-rc.1-wanglab032"), None, Some("")] {
            assert_eq!(
                classify_paired_core(
                    Some(WANGLAB_DSH_VERSION),
                    Some(WANGLAB_DSH_COMMIT),
                    tag,
                    true,
                ),
                PairedCoreState::RepairTag,
                "tag={tag:?}"
            );
        }
    }

    #[test]
    fn matching_tag_cannot_hide_unknown_or_different_commit() {
        for commit in [
            None,
            Some(""),
            Some("90e7887e78256f577b945dc3a22a1926d59cf131"),
            Some("wanglab040"),
        ] {
            assert_eq!(
                classify_paired_core(
                    Some(WANGLAB_DSH_VERSION),
                    commit,
                    Some(WANGLAB_DSH_TAG),
                    true
                ),
                PairedCoreState::InstallRequired,
                "commit={commit:?}"
            );
        }
    }

    #[test]
    fn matching_records_cannot_hide_wrong_or_missing_manifest() {
        for version in [None, Some("0.1.2-rc.1"), Some("invalid")] {
            assert_eq!(
                classify_paired_core(
                    version,
                    Some(WANGLAB_DSH_COMMIT),
                    Some(WANGLAB_DSH_TAG),
                    true
                ),
                PairedCoreState::InstallRequired,
                "manifest={version:?}"
            );
        }
    }

    #[test]
    fn missing_entry_always_requires_installation() {
        for tag in [
            Some(WANGLAB_DSH_TAG),
            Some("dsh-0.1.2-rc.1-wanglab032"),
            None,
        ] {
            assert_eq!(
                classify_paired_core(
                    Some(WANGLAB_DSH_VERSION),
                    Some(WANGLAB_DSH_COMMIT),
                    tag,
                    false
                ),
                PairedCoreState::InstallRequired
            );
        }
    }
}
