export default function AiView() {
  return (
    <div id="aiView" style={{ display: 'none' }}>
      <div className="card dash-card">
        <div className="card-header"><i className="bx bx-bot"></i><span id="aiHeaderLabel">AI 助手 (opencode)</span><span className="ms-auto"><span id="aiStatusBadge" className="badge bg-secondary">閒置</span></span></div>
        <div className="card-body p-0 d-flex flex-column" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
          <div id="aiChatScroll" className="ai-chat-scroll p-3">
            <div className="ai-msg ai-msg-system">
              <div className="ai-msg-avatar"><i className="bx bx-bot"></i></div>
              <div className="ai-msg-bubble">
                <div className="ai-msg-name">AI 助手</div>
                <div className="ai-msg-content">輸入你的需求，我會產生對應的防火牆命令。例如：<br />· 封鎖所有來自 192.168.1.0/24 的流量<br />· 允許 SSH (port 22) 從任何地方連入<br />· 列出目前所有 DROP 規則</div>
              </div>
            </div>
          </div>
          <div className="ai-input-bar p-3 d-flex gap-2 align-items-end">
            <textarea id="aiInput" className="form-control" rows={2} placeholder="輸入需求..." style={{ resize: 'none', fontSize: '.875rem' }}></textarea>
            <button id="aiSendBtn" className="btn btn-primary"><i className="bx bx-send me-1"></i><span id="aiSendLabel">送出</span></button>
          </div>
        </div>
      </div>
    </div>
  )
}
