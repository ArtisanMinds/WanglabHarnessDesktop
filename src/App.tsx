import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import SetupScreen, { InstallProgress, SetupStatus } from "./components/SetupScreen";
import SidebarPanel from "./components/SidebarPanel";
import { useI18n } from "./i18n/context";
import { generateTimestampedUrl } from "./hooks/useAutoSync";

const MAX_RETRIES = 8;

interface InstallerState {
  title: string;
  detail: string;
  percentage: number;
  logs: string[];
}

const initialInstaller: InstallerState = {
  title: "",
  detail: "",
  percentage: 0,
  logs: [],
};

export default function App() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SetupStatus>("installing");
  const [installer, setInstaller] = useState<InstallerState>(initialInstaller);
  const [errorMsg, setErrorMsg] = useState("");
  const [serviceUrl, setServiceUrl] = useState("http://127.0.0.1:3080");
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === null ? true : saved === "true";
  });
  const [serviceRunning, setServiceRunning] = useState(false);

  const bootToken = useRef(0);

  const handleToggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebarCollapsed", String(next));
  };

  const refreshIframe = useCallback(() => {
    setIframeLoaded(false);
    setIframeError(false);
    setTimeout(() => setIframeKey((prev) => prev + 1), 800);
  }, []);

  const checkHealthViaProxy = async (): Promise<boolean> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("health check timeout")), 8000);
      });
      const resultPromise = invoke<string>("proxy_health_check");
      const result = await Promise.race([resultPromise, timeoutPromise]);

      const lower = result.toLowerCase();
      if (
        lower.includes("healthy") ||
        lower.includes("ready") ||
        result.includes("200") ||
        result.includes("201") ||
        lower.includes("ok")
      ) {
        console.log("[App] health check passed:", result);
        return true;
      }
      console.log("[App] health check returned:", result);
      return false;
    } catch (err) {
      const message = String(err);
      if (message.includes("502") || message.includes("Bad Gateway")) {
        console.log("[App] transient 502 during health check, retrying");
      } else {
        console.log("[App] health check failed:", err);
      }
      return false;
    }
  };

  const boot = useCallback(async () => {
    const token = ++bootToken.current;
    let unlistenInstall: UnlistenFn | null = null;

    try {
      // Install-progress stream: only ever move the percentage forward, like
      // the reference installer store.
      unlistenInstall = await listen<InstallProgress>("install-progress", (e) => {
        const payload = e.payload;
        setInstaller((prev) => {
          if (payload.percentage < prev.percentage) {
            return prev;
          }
          const logs = payload.log
            ? [...prev.logs, payload.log].slice(-5)
            : prev.logs;
          return {
            title: payload.title || prev.title,
            detail: payload.detail || prev.detail,
            percentage: payload.percentage,
            logs,
          };
        });
      });

      const runtimeInfo = await invoke<{ service_url: string }>("get_runtime_info");
      setServiceUrl(runtimeInfo.service_url);

      // 1. Install dependencies (Node runtime + harness package).
      setStatus("installing");
      setInstaller({ ...initialInstaller, title: t("status.installing") });
      await invoke("install_dependencies");

      // 2. Launch + health check.
      setStatus("starting");
      await invoke("launch_harness");
      setServiceRunning(true);

      let healthy = false;
      for (let attempt = 0; attempt < MAX_RETRIES && !healthy; attempt++) {
        healthy = await checkHealthViaProxy();
        if (!healthy) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      if (!healthy) {
        throw new Error(
          t("errors.service_start_timeout", { port: new URL(serviceUrl).port || "3080" }),
        );
      }

      if (token !== bootToken.current) return;
      setStatus("ready");
      refreshIframe();
    } catch (err) {
      if (token !== bootToken.current) return;
      console.error("[App] startup failed:", err);
      setErrorMsg(String(err));
      setStatus("error");
      setServiceRunning(false);
    } finally {
      unlistenInstall?.();
    }
  }, [refreshIframe, serviceUrl, t]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const restart = async () => {
    try {
      await invoke("shutdown_harness");
    } catch (err) {
      console.error("[App] shutdown during restart failed:", err);
    }
    setServiceRunning(false);
    setIframeLoaded(false);
    void boot();
  };

  const shutdown = async () => {
    try {
      await invoke("shutdown_harness");
    } catch (err) {
      console.error("[App] shutdown failed:", err);
    }
    setServiceRunning(false);
    setStatus("error");
    setErrorMsg(t("ui.stopped"));
  };

  const openBrowser = async () => {
    try {
      await invoke("open_in_browser");
    } catch (err) {
      console.error("[App] open in browser failed:", err);
    }
  };

  if (status === "error") {
    return (
      <div className="app-shell">
        <SidebarPanel
          collapsed={sidebarCollapsed}
          onToggle={handleToggleSidebar}
          serviceRunning={serviceRunning}
          onRestart={restart}
          onShutdown={shutdown}
          onStart={boot}
          onOpenBrowser={openBrowser}
        />
        <main className="main-panel">
          <SetupScreen
            status="error"
            title=""
            detail=""
            percentage={installer.percentage}
            logs={installer.logs}
            errorMsg={serviceUrl ? `${errorMsg} (${serviceUrl})` : errorMsg}
            onRetry={boot}
          />
        </main>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="app-shell">
        <main className="main-panel full">
          <SetupScreen
            status={status}
            title={installer.title}
            detail={installer.detail}
            percentage={installer.percentage}
            logs={installer.logs}
            errorMsg=""
            onRetry={boot}
          />
        </main>
      </div>
    );
  }

  const iframeSrc = generateTimestampedUrl(serviceUrl);

  return (
    <div className="app-shell">
      <SidebarPanel
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
        serviceRunning={serviceRunning}
        onRestart={restart}
        onShutdown={shutdown}
        onStart={boot}
        onOpenBrowser={openBrowser}
      />
      <main className="main-panel">
        {!iframeLoaded && (
          <div className="iframe-loading">
            <span className="spinner" />
            <p>{t("status.loading")}</p>
          </div>
        )}
        {iframeError && (
          <div className="iframe-error">
            <p>{t("ui.iframe_error")}</p>
            <p className="muted">{t("ui.ensure_running", { url: serviceUrl })}</p>
            <button className="btn primary" onClick={refreshIframe}>
              {t("app.retry")}
            </button>
          </div>
        )}
        <iframe
          key={iframeKey}
          className="harness-frame"
          src={iframeSrc}
          onLoad={() => {
            setIframeLoaded(true);
            setIframeError(false);
          }}
          onError={() => {
            setIframeError(true);
            setIframeLoaded(false);
          }}
          title={t("app.open_editor")}
        />
      </main>
    </div>
  );
}
