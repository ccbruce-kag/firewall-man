export default function AiView() {
  return (
    <div id="aiView" style={{ display: 'none' }}>
      <div className="card dash-card">
        <div className="card-header"><i className="bx bx-bot"></i><span id="aiHeaderLabel" data-i18n="aiHeader">AI Assistant (opencode)</span><span className="ms-auto"><span id="aiStatusBadge" className="badge bg-secondary" data-i18n="aiStatusIdle">Idle</span></span></div>
        <div className="card-body p-0 d-flex flex-column" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
          <div id="aiChatScroll" className="ai-chat-scroll p-3">
            <div className="ai-msg ai-msg-system">
              <div className="ai-msg-avatar"><i className="bx bx-bot"></i></div>
              <div className="ai-msg-bubble">
                <div className="ai-msg-name" data-i18n="aiIntroName">AI Assistant</div>
                <div className="ai-msg-content" data-i18n-html="aiIntroText">Enter your request and I will generate matching firewall commands.</div>
              </div>
            </div>
          </div>
          <div className="ai-input-bar p-3 d-flex gap-2 align-items-end">
            <textarea id="aiInput" className="form-control" rows={2} placeholder="Enter your request..." data-i18n-placeholder="aiInputPlaceholder" style={{ resize: 'none', fontSize: '.875rem' }}></textarea>
            <button id="aiSendBtn" className="btn btn-primary"><i className="bx bx-send me-1"></i><span id="aiSendLabel" data-i18n="aiSend">Send</span></button>
          </div>
        </div>
      </div>
    </div>
  )
}
