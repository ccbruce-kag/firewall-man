export default function ShellView() {
  return (
    <div id="shellView" style={{ display: 'none', height: 'calc(100vh - 220px)' }}>
      <div id="terminal" tabIndex={0} style={{ height: '100%', width: '100%' }}></div>
    </div>
  )
}
