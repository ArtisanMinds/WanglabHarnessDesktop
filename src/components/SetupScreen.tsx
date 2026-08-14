import { useI18n } from "../i18n/context";

export type SetupStatus = "installing" | "starting" | "ready" | "error";

export interface InstallProgress {
  title: string;
  detail: string;
  log: string;
  type: string;
  percentage: number;
  progress: number;
}

interface SetupScreenProps {
  status: SetupStatus;
  title: string;
  detail: string;
  percentage: number;
  logs: string[];
  errorMsg: string;
  onRetry: () => void;
}

const LOG_LIMIT = 5;

/**
 * Installer/download page, modeled on the early n8n-based
 * `hairyf/damn-reports` `Installer` + `StepStatus` components: an icon, a
 * headline, a description, a value-labelled progress bar, and a
 * terminal-style panel showing the most recent progress lines.
 */
export default function SetupScreen({
  status,
  title,
  detail,
  percentage,
  logs,
  errorMsg,
  onRetry,
}: SetupScreenProps) {
  const { t } = useI18n();
  const loading = status === "starting";
  const error = status === "error";
  const heading = error ? t("status.error", { error: errorMsg || t("errors.unknown") }) : title;
  const description = error ? "" : detail || t("status.installing");
  const visibleLogs = logs.length ? logs : [t("ui.waiting_logs")];

  return (
    <div className="setup-screen">
      <div className="setup-card installer-card">
        <div className="setup-logo">
          <div className="icon-circle">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
        </div>

        <h2 className="installer-title">{heading}</h2>
        <p className="installer-detail">{description}</p>

        <div className="installer-progress">
          <div className="progress-track" role="progressbar" aria-valuenow={Math.round(percentage)}>
            <div className="progress-fill" style={{ width: `${Math.min(percentage, 100)}%` }} />
          </div>
          <span className="progress-value">{Math.round(percentage)}%</span>
        </div>

        <div className="installer-log" aria-label={t("ui.install_log")}>
          {visibleLogs.slice(-LOG_LIMIT).map((line, index) => (
            <p key={`${line}-${index}`} className="log-line">
              <span className="log-caret">›</span>
              <span className="log-text">{line}</span>
            </p>
          ))}
        </div>

        {loading && (
          <div className="installer-processing">
            <span className="spinner small" />
            <span className="processing-text">PROCESSING...</span>
          </div>
        )}

        {error && (
          <button className="btn primary" onClick={onRetry}>
            {t("app.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
