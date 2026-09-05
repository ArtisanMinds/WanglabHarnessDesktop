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
#[allow(unused_imports)]
pub use source::{active_dsh_binary, active_source, active_version, CoreSource, HarnessCore};
pub(crate) use version::prune_inactive;
pub use version::{download_version, list, remove_version, set_active};

/// 内网安装与 Desktop 的固定发行版本和提交记录必须一致。
pub(crate) fn paired_core_ready(app_handle: &tauri::AppHandle) -> bool {
    crate::config::get_dsh_version(app_handle).as_deref()
        == Some(crate::config::WANGLAB_DSH_VERSION)
        && crate::config::get_dsh_pkg_tag(app_handle).as_deref()
            == Some(crate::config::WANGLAB_DSH_TAG)
        && crate::config::get_dsh_pkg_commit(app_handle).as_deref()
            == Some(crate::config::WANGLAB_DSH_COMMIT)
        && crate::config::get_dsh_binary_path(app_handle).is_file()
}
