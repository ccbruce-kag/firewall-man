export default function Logger() {
  return (
    <div className="log-panel" id="logPanel">
      <div className="log-toolbar">
        <span className="log-title" id="logToggle">&#9654; Logger</span>
        <span className="log-badge" id="logBadge">0</span>
        <button className="log-clear-btn" id="logClear">&#10005; clear</button>
      </div>
      <div id="logContainer">
        <div id="logContent"></div>
      </div>
    </div>
  )
}
