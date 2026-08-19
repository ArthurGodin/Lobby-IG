import { Server, Terminal, X, Zap } from "lucide-react";
import "./serverDashboard.css";

export type ServerLog = {
  id: string;
  timestamp: number;
  message: string;
  source: string;
};

type ServerDashboardPanelProps = {
  logs: ServerLog[];
  onClose: () => void;
};

export function ServerDashboardPanel({ logs, onClose }: ServerDashboardPanelProps) {
  return (
    <aside className="server-dashboard-panel">
      <header className="sd-header">
        <div className="sd-header-title">
          <h2>War Room</h2>
          <span className="sd-badge">Logs & Webhooks</span>
        </div>
        <button
          type="button"
          className="sd-icon-btn"
          onClick={onClose}
          aria-label="Fechar dashboard"
        >
          <X size={18} />
        </button>
      </header>

      <section className="sd-metrics">
        <div className="sd-metric-card">
          <Terminal size={14} className="sd-metric-icon" />
          <div className="sd-metric-value">{logs.length}</div>
          <div className="sd-metric-label">Total Eventos</div>
        </div>
        <div className="sd-metric-card">
          <Zap size={14} className="sd-metric-icon" style={{ color: "#34d399" }} />
          <div className="sd-metric-value">Online</div>
          <div className="sd-metric-label">Status do Servidor</div>
        </div>
      </section>

      <section className="sd-logs-section">
        <h3>Live Server Feed</h3>
        <div className="sd-logs-container">
          {logs.length === 0 ? (
            <div className="sd-empty-state">
              <Server size={24} opacity={0.5} />
              <p>Nenhum evento registrado na sessão.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="sd-log-item">
                <span className="sd-log-time">
                  {new Date(log.timestamp).toLocaleTimeString("pt-BR", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="sd-log-source">[{log.source}]</span>
                <span className="sd-log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
