const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

let logCount = 0;

const consoleStyles: Record<string, string> = {
  DEBUG: 'color:#6c7086',
  INFO:  'color:#89b4fa;font-weight:600',
  WARN:  'color:#f9e2af;font-weight:600',
  ERROR: 'color:#f38ba8;font-weight:600',
};

function _append(level: number, msg: string, cmd?: string) {
  logCount++;
  const time = new Date().toLocaleTimeString();
  const cls = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k as LogLevel] === level) || 'DEBUG';
  const entry = document.createElement('div');
  entry.className = 'log-entry log-' + cls.toLowerCase();
  let html = `<span class="log-time">[${time}]</span><span class="log-msg">${msg}</span>`;
  if (cmd) html += `<span class="log-cmd">&#8594; ${cmd}</span>`;
  entry.innerHTML = html;
  const content = document.getElementById('logContent');
  if (content) content.appendChild(entry);
  const badge = document.getElementById('logBadge');
  if (badge) badge.textContent = String(logCount);
  const container = document.getElementById('logContainer');
  if (container && container.classList.contains('open')) {
    container.scrollTop = container.scrollHeight;
  }
  const tag = `%c[${cls}][${time}]`;
  const style = consoleStyles[cls] || '';
  const args: unknown[] = [tag, style, msg];
  if (cmd) args.push('→ ' + cmd);
  const methods = console as unknown as Record<string, (...values: unknown[]) => void>;
  const fn = methods[cls.toLowerCase()];
  if (typeof fn === 'function') {
    fn.apply(console, args);
  } else {
    console.log(...args);
  }
}

export const logger = {
  debug(msg: string, cmd?: string) { _append(LOG_LEVELS.DEBUG, msg, cmd); },
  info(msg: string, cmd?: string) { _append(LOG_LEVELS.INFO, msg, cmd); },
  warn(msg: string, cmd?: string) { _append(LOG_LEVELS.WARN, msg, cmd); },
  error(msg: string, cmd?: string) { _append(LOG_LEVELS.ERROR, msg, cmd); },
  clear() {
    const content = document.getElementById('logContent');
    if (content) content.innerHTML = '';
    logCount = 0;
    const badge = document.getElementById('logBadge');
    if (badge) badge.textContent = '0';
  },
};
