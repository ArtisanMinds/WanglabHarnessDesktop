//! Node.js runtime management and the dsh service process manager.

use crate::api::harness::constants::*;
use crate::i18n;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows process creation flag: do not open a console window.
#[cfg(windows)]
const WINDOWS_CREATE_NO_WINDOW_FLAG: u32 = 0x0800_0000;

/// Global process manager for the running dsh service.
pub static PROCESS_MANAGER: Lazy<Mutex<ProcessManager>> =
    Lazy::new(|| Mutex::new(ProcessManager::new()));

/// Tracks the spawned `dsh web` child process.
pub struct ProcessManager {
    child: Option<Child>,
    pid: Option<u32>,
}

impl ProcessManager {
    pub fn new() -> Self {
        ProcessManager { child: None, pid: None }
    }

    pub fn set_child(&mut self, child: Child) {
        self.pid = Some(child.id());
        self.child = Some(child);
    }

    /// Terminate the child and (where possible) its whole process tree.
    pub fn kill_child(&mut self) {
        if let Some(pid) = self.pid {
            kill_process_tree(pid);
        }
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.pid = None;
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }
}

#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(unix)]
fn kill_process_tree(pid: u32) {
    // The child was spawned as its own process-group leader, so a negative pid
    // signals the whole group.
    let _ = unsafe { libc::kill(-(pid as i32), libc::SIGTERM) };
}

// --- Node.js runtime helpers -------------------------------------------------

/// Map the current platform/arch to Node's official distribution naming.
fn node_platform_arch() -> Result<(String, String), String> {
    let platform = env::consts::OS;
    let arch = env::consts::ARCH;
    let ext = if platform == "windows" { "zip" } else { "tar.gz" };
    let name = match (platform, arch) {
        ("macos", "aarch64") => "darwin-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("linux", "aarch64") => "linux-arm64",
        ("linux", "x86_64") => "linux-x64",
        ("windows", "x86_64" | "aarch64") => "win-x64",
        _ => return Err(i18n::t("runtime.unsupported_platform")),
    };
    Ok((format!("node-{}-{name}.{ext}", NODEJS_VERSION), ext.to_string()))
}

/// Candidate download URLs (official first, npmmirror as fallback).
pub fn get_node_download_urls() -> Result<Vec<String>, String> {
    let (file_name, _) = node_platform_arch()?;
    let mut urls = vec![format!("{}{}/{}", NODEJS_BASE_URL, NODEJS_VERSION, file_name)];
    urls.push(format!("{}{}/{}", NODEJS_NPMMIRROR_URL, NODEJS_VERSION, file_name));
    Ok(urls)
}

/// Locate the node binary inside an extracted runtime directory.
pub fn get_node_binary_path(runtime_dir: PathBuf) -> PathBuf {
    let candidates = if env::consts::OS == "windows" {
        vec![runtime_dir.join("node.exe"), runtime_dir.join("bin/node.exe")]
    } else {
        vec![runtime_dir.join("bin/node"), runtime_dir.join("node")]
    };
    for candidate in candidates {
        if candidate.exists() {
            return candidate;
        }
    }
    runtime_dir.join(if env::consts::OS == "windows" { "node.exe" } else { "bin/node" })
}

fn parse_node_version(output: &str) -> Option<(u64, u64, u64)> {
    let version = output.trim().trim_start_matches('v');
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    Some((major, minor, patch))
}

/// Compatibility rule from the packaged harness: v22.15.0+ or v23.8.0+ (v24+ also fine).
fn is_supported_node_version(version: &str) -> bool {
    let Some((major, minor, _patch)) = parse_node_version(version) else {
        return false;
    };
    match major {
        22 => minor >= 15,
        23 => minor >= 8,
        major if major >= 24 => true,
        _ => false,
    }
}

/// Run `node --version` and report whether it is compatible.
pub fn is_runtime_compatible(runtime_dir: &Path) -> bool {
    let node = get_node_binary_path(runtime_dir.to_path_buf());
    if !node.exists() {
        return false;
    }
    let output = match Command::new(&node).arg("--version").output() {
        Ok(out) => out,
        Err(_) => return false,
    };
    if !output.status.success() {
        return false;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    is_supported_node_version(stdout.trim())
}

/// The Node.js version bundled by the desktop app.
pub fn get_bundled_node_version() -> String {
    NODEJS_VERSION.trim_start_matches('v').to_string()
}

// --- dsh service launch ------------------------------------------------------

/// Spawn `dsh --profile web` with the bundled node binary.
///
/// `envs` may include `DSH_HOME` and other harness variables. `PATH` is
/// extended with the node binary directory so tools spawned by the harness can
/// find node.
pub fn start_dsh(
    node_path: &Path,
    entry_path: &Path,
    cwd: &Path,
    mut envs: HashMap<String, String>,
    host: &str,
    port: u16,
    log_path: &Path,
) -> Result<(), String> {
    if !node_path.exists() {
        return Err(i18n::t("runtime.not_found"));
    }
    if !entry_path.exists() {
        return Err(i18n::t("harness.core_not_found"));
    }

    if let Some(node_dir) = node_path.parent() {
        if let Some(existing_path) = env::var_os("PATH") {
            let mut paths = vec![node_dir.to_path_buf()];
            paths.extend(env::split_paths(&existing_path));
            if let Ok(new_path) = env::join_paths(paths) {
                envs.insert("PATH".to_string(), new_path.to_string_lossy().into_owned());
            }
        }
    }

    fs::create_dir_all(log_path.parent().unwrap_or(Path::new(".")))
        .map_err(|e| format!("create log dir failed: {e}"))?;
    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| format!("open log file failed: {e}"))?;

    let mut command = Command::new(node_path);
    command
        .arg(entry_path)
        .args(["--profile", "web", "--host", host, "--port", &port.to_string()])
        .envs(&envs)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file.try_clone().map_err(|e| format!("clone log failed: {e}"))?))
        .stderr(Stdio::from(log_file));

    #[cfg(windows)]
    command.creation_flags(WINDOWS_CREATE_NO_WINDOW_FLAG);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let child = command.spawn().map_err(|e| {
        format!("{}: {e}", i18n::t("harness.start_failed"))
    })?;

    let mut manager = PROCESS_MANAGER
        .lock()
        .map_err(|_| i18n::t("process.manager_poisoned"))?;
    manager.kill_child();
    manager.set_child(child);

    println!("[dsh] service launched (pid={:?})", manager.pid);
    Ok(())
}
