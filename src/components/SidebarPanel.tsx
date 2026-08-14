import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n/context";

export interface RuntimeInfo {
  app_version: string;
  dsh_version: string | null;
  node_version: string;
  service_url: string;
  data_dir: string;
  log_path: string;
  platform: string;
  arch: string;
}

export interface AppConfig {
  port: number;
  auto_start: boolean;
}

interface SidebarPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  serviceRunning: boolean;
  onRestart: () => void;
  onShutdown: () => void;
  onStart: () => void;
  onOpenBrowser: () => void;
}

export default function SidebarPanel({
  collapsed,
  onToggle,
  serviceRunning,
  onRestart,
  onShutdown,
  onStart,
  onOpenBrowser,
}: SidebarPanelProps) {
  const { t, language, setLanguage } = useI18n();
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [port, setPort] = useState("3080");
  const [autoStart, setAutoStart] = useState(true);
  const [logs, setLogs] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshInfo = async () => {
    try {
      const nextInfo = await invoke<RuntimeInfo>("get_runtime_info");
      setInfo(nextInfo);
    } catch (err) {
      console.error("[SidebarPanel] failed to load runtime info:", err);
    }
  };

  const refreshConfig = async () => {
    try {
      const nextConfig = await invoke<AppConfig>("get_app_config");
      setPort(String(nextConfig.port));
      setAutoStart(nextConfig.auto_start);
    } catch (err) {
      console.error("[SidebarPanel] failed to load config:", err);
    }
  };

  const refreshLogs = async () => {
    try {
      setLogs(await invoke<string>("read_service_logs", { maxBytes: 64 * 1024 }));
    } catch (err) {
      console.error("[SidebarPanel] failed to read logs:", err);
    }
  };

  useEffect(() => {
    refreshInfo();
    refreshConfig();
    refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const nextPort = Number(port);
      const nextConfig = await invoke<AppConfig>("update_app_config", {
        port: Number.isInteger(nextPort) && nextPort > 0 ? nextPort : null,
        autoStart,
      });
      setPort(String(nextConfig.port));
      setNotice(t("messages.config_saved"));
    } catch (err) {
      console.error("[SidebarPanel] failed to save config:", err);
      setNotice(t("messages.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async () => {
    try {
      await invoke("copy_service_url");
      setNotice(t("messages.copy_success"));
    } catch {
      setNotice(t("messages.copy_failed"));
    }
  };

  const clearLogs = async () => {
    try {
      await invoke("clear_service_logs");
      setLogs("");
      setNotice(t("messages.logs_cleared"));
    } catch (err) {
      console.error("[SidebarPanel] failed to clear logs:", err);
    }
  };

  const revealDataDir = async () => {
    try {
      await invoke("reveal_data_dir");
    } catch (err) {
      console.error("[SidebarPanel] failed to reveal data dir:", err);
    }
  };

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <button className="sidebar-toggle" onClick={onToggle} title={t("app.collapse_sidebar")}>
        {collapsed ? "»" : "«"}
      </button>

      {!collapsed && (
        <div className="sidebar-content">
          <div className="sidebar-section">
            <h3>{t("ui.connection_status")}</h3>
            <span className={`status-pill ${serviceRunning ? "ok" : "off"}`}>
              {serviceRunning ? t("ui.running") : t("ui.stopped")}
            </span>
          </div>

          <div className="sidebar-section">
            <h3>{t("ui.service_url")}</h3>
            <div className="url-row">
              <code className="url-text">{info?.service_url ?? "-"}</code>
              <button className="btn small" onClick={copyUrl} title={t("app.copy_url")}>
                {t("buttons.copy")}
              </button>
            </div>
            <button className="btn small block" onClick={onOpenBrowser}>
              {t("app.open_browser")}
            </button>
          </div>

          <div className="sidebar-section">
            <h3>{t("ui.actions")}</h3>
            <div className="btn-group">
              {serviceRunning ? (
                <>
                  <button className="btn small" onClick={onRestart}>
                    {t("app.restart")}
                  </button>
                  <button className="btn small danger" onClick={onShutdown}>
                    {t("app.shutdown")}
                  </button>
                </>
              ) : (
                <button className="btn small primary" onClick={onStart}>
                  {t("app.retry")}
                </button>
              )}
              <button className="btn small" onClick={refreshInfo}>
                {t("app.refresh")}
              </button>
            </div>
          </div>

          <div className="sidebar-section">
            <h3>{t("ui.app_info")}</h3>
            <dl className="info-list">
              <dt>{t("ui.current_version")}</dt>
              <dd>{info?.app_version ?? "-"}</dd>
              <dt>{t("ui.dsh_version")}</dt>
              <dd>{info?.dsh_version ?? "-"}</dd>
              <dt>{t("ui.node_version")}</dt>
              <dd>v{info?.node_version ?? "-"}</dd>
              <dt>Platform</dt>
              <dd>
                {info?.platform ?? "-"} / {info?.arch ?? "-"}
              </dd>
              <dt>{t("ui.data_dir")}</dt>
              <dd className="path-cell" title={info?.data_dir}>
                {info?.data_dir ?? "-"}
                <button className="btn small" onClick={revealDataDir}>
                  {t("app.reveal_dir")}
                </button>
              </dd>
            </dl>
          </div>

          <div className="sidebar-section">
            <h3>{t("ui.settings")}</h3>
            <label className="field">
              <span>{t("ui.port")}</span>
              <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
              <span>{t("ui.auto_start")}</span>
            </label>
            <button className="btn small block" onClick={saveConfig} disabled={saving}>
              {saving ? t("ui.saved") : t("ui.save")}
            </button>
            <div className="lang-row">
              <span>{t("ui.language")}:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "en" | "zh")}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="sidebar-section logs-section">
            <h3>
              {t("ui.logs")}
              <button className="btn small" onClick={refreshLogs} title={t("buttons.refresh_logs")}>
                ↻
              </button>
            </h3>
            <pre className="log-view">{logs || t("ui.no_logs")}</pre>
            <button className="btn small" onClick={clearLogs}>
              {t("buttons.clear_logs")}
            </button>
          </div>

          {notice && <div className="notice">{notice}</div>}
        </div>
      )}
    </aside>
  );
}
