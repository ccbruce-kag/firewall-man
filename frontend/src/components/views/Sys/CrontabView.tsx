import { useEffect, useState } from 'react'
import { getApiBase } from '../../../utils/api'

type CronJob = {
  id: number
  name: string
  description: string
  enabled: boolean
  schedule: string
  executor: 'shell' | 'rlua'
  script: string
  timeout_secs: number
  working_dir: string
  env_json: string
  last_run_at?: string | null
  next_run_at?: string | null
  last_status?: string | null
  last_exit_code?: number | null
  last_output?: string | null
}

type CronRun = {
  id: number
  job_id: number
  started_at: string
  finished_at?: string | null
  status: string
  exit_code?: number | null
  output?: string | null
  error?: string | null
  duration_ms?: number | null
}

const emptyCronJob: Omit<CronJob, 'id'> = {
  name: '',
  description: '',
  enabled: true,
  schedule: '0 * * * * * *',
  executor: 'shell',
  script: '',
  timeout_secs: 300,
  working_dir: '',
  env_json: '{}',
  last_run_at: null,
  next_run_at: null,
  last_status: null,
  last_exit_code: null,
  last_output: null,
}

async function cronApi(path: string, options: RequestInit = {}) {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data
}

export default function CrontabView() {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [cronRuns, setCronRuns] = useState<CronRun[]>([])
  const [cronSelectedId, setCronSelectedId] = useState<number | null>(null)
  const [cronEditingId, setCronEditingId] = useState<number | null>(null)
  const [cronForm, setCronForm] = useState<Omit<CronJob, 'id'>>(emptyCronJob)
  const [cronBusy, setCronBusy] = useState(false)
  const [cronMsg, setCronMsg] = useState('')

  const loadCronJobs = async () => {
    setCronBusy(true)
    setCronMsg('')
    try {
      const data = await cronApi('/system/crontab/jobs')
      setCronJobs(data.jobs || [])
    } catch (err) {
      setCronMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setCronBusy(false)
    }
  }

  const loadCronRuns = async (id: number) => {
    setCronSelectedId(id)
    try {
      const data = await cronApi(`/system/crontab/jobs/${id}/runs`)
      setCronRuns(data.runs || [])
    } catch (err) {
      setCronMsg(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    loadCronJobs()
  }, [])

  const startNewCronJob = () => {
    setCronEditingId(null)
    setCronForm({ ...emptyCronJob })
    setCronRuns([])
    setCronSelectedId(null)
  }

  const editCronJob = (job: CronJob) => {
    const { id, ...form } = job
    setCronEditingId(id)
    setCronForm(form)
    loadCronRuns(id)
  }

  const saveCronJob = async () => {
    setCronBusy(true)
    setCronMsg('')
    try {
      JSON.parse(cronForm.env_json || '{}')
      const payload = {
        ...cronForm,
        timeout_secs: Number(cronForm.timeout_secs) || 300,
      }
      if (cronEditingId == null) {
        await cronApi('/system/crontab/jobs', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await cronApi(`/system/crontab/jobs/${cronEditingId}`, { method: 'PUT', body: JSON.stringify(payload) })
      }
      await loadCronJobs()
      setCronMsg('Saved')
    } catch (err) {
      setCronMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setCronBusy(false)
    }
  }

  const toggleCronJob = async (job: CronJob) => {
    setCronBusy(true)
    setCronMsg('')
    try {
      await cronApi(`/system/crontab/jobs/${job.id}/${job.enabled ? 'disable' : 'enable'}`, { method: 'POST' })
      await loadCronJobs()
    } catch (err) {
      setCronMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setCronBusy(false)
    }
  }

  const runCronJob = async (job: CronJob) => {
    setCronBusy(true)
    setCronMsg('')
    try {
      const data = await cronApi(`/system/crontab/jobs/${job.id}/run`, { method: 'POST' })
      setCronMsg(`Run ${data.run?.status || 'finished'}`)
      await loadCronJobs()
      await loadCronRuns(job.id)
    } catch (err) {
      setCronMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setCronBusy(false)
    }
  }

  const deleteCronJob = async (job: CronJob) => {
    if (!window.confirm(`Delete cron job "${job.name}"?`)) return
    setCronBusy(true)
    setCronMsg('')
    try {
      await cronApi(`/system/crontab/jobs/${job.id}`, { method: 'DELETE' })
      if (cronEditingId === job.id) startNewCronJob()
      await loadCronJobs()
    } catch (err) {
      setCronMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setCronBusy(false)
    }
  }

  return (
    <div id="crontabView" style={{ display: 'none' }}>
      <div className="row g-3">
        <div className="col-xl-7">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-3">
                <button className="btn btn-sm btn-primary" onClick={startNewCronJob} disabled={cronBusy}><i className="bx bx-plus me-1"></i>新增</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={loadCronJobs} disabled={cronBusy}><i className="bx bx-refresh me-1"></i>重新整理</button>
                <span className={cronMsg === 'Saved' || cronMsg.startsWith('Run ') ? 'text-success small' : 'text-danger small'}>{cronMsg}</span>
              </div>
              <div className="table-responsive" style={{ maxHeight: 520, overflow: 'auto' }}>
                <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '.75rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>狀態</th>
                      <th>名稱</th>
                      <th>排程</th>
                      <th>類型</th>
                      <th>下次執行</th>
                      <th>最後狀態</th>
                      <th style={{ width: 220 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronJobs.length === 0 ? (
                      <tr><td colSpan={7} className="text-muted">尚無 crontab job</td></tr>
                    ) : cronJobs.map(job => (
                      <tr key={job.id} className={cronEditingId === job.id ? 'table-active' : ''}>
                        <td><span className={`badge ${job.enabled ? 'bg-label-success' : 'bg-label-secondary'}`}>{job.enabled ? '啟用' : '停用'}</span></td>
                        <td>
                          <div className="fw-semibold">{job.name}</div>
                          {job.description && <div className="text-muted">{job.description}</div>}
                        </td>
                        <td className="font-monospace">{job.schedule}</td>
                        <td><span className="badge bg-label-info">{job.executor}</span></td>
                        <td className="text-nowrap">{job.next_run_at || '-'}</td>
                        <td>
                          <span className={`badge ${job.last_status === 'success' ? 'bg-label-success' : job.last_status === 'failed' || job.last_status === 'timeout' ? 'bg-label-danger' : 'bg-label-secondary'}`}>{job.last_status || '-'}</span>
                        </td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-primary" onClick={() => editCronJob(job)} title="Edit"><i className="bx bx-edit"></i></button>
                            <button className="btn btn-outline-secondary" onClick={() => toggleCronJob(job)} title={job.enabled ? 'Disable' : 'Enable'}><i className={job.enabled ? 'bx bx-pause' : 'bx bx-play'}></i></button>
                            <button className="btn btn-outline-success" onClick={() => runCronJob(job)} title="Run now"><i className="bx bx-send"></i></button>
                            <button className="btn btn-outline-info" onClick={() => loadCronRuns(job.id)} title="History"><i className="bx bx-history"></i></button>
                            <button className="btn btn-outline-danger" onClick={() => deleteCronJob(job)} title="Delete"><i className="bx bx-trash"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {cronSelectedId != null && (
            <div className="card mt-3">
              <div className="card-body">
                <div className="fw-semibold mb-2">執行歷史</div>
                <div className="table-responsive" style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: '.75rem' }}>
                    <thead><tr><th>時間</th><th>狀態</th><th>Exit</th><th>耗時</th><th>輸出</th></tr></thead>
                    <tbody>
                      {cronRuns.length === 0 ? (
                        <tr><td colSpan={5} className="text-muted">尚無執行紀錄</td></tr>
                      ) : cronRuns.map(run => (
                        <tr key={run.id}>
                          <td className="text-nowrap">{run.started_at}</td>
                          <td><span className={`badge ${run.status === 'success' ? 'bg-label-success' : 'bg-label-danger'}`}>{run.status}</span></td>
                          <td>{run.exit_code ?? '-'}</td>
                          <td>{run.duration_ms ?? '-'} ms</td>
                          <td><pre className="mb-0" style={{ whiteSpace: 'pre-wrap', maxWidth: 520 }}>{run.output || run.error || ''}</pre></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="col-xl-5">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="fw-semibold">{cronEditingId == null ? '新增 Crontab' : `修改 Crontab #${cronEditingId}`}</div>
                <div className="form-check form-switch mb-0">
                  <input className="form-check-input" type="checkbox" checked={cronForm.enabled} onChange={e => setCronForm({ ...cronForm, enabled: e.target.checked })} />
                </div>
              </div>
              <div className="row g-2">
                <div className="col-md-7">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>名稱</label>
                  <input className="form-control" value={cronForm.name} onChange={e => setCronForm({ ...cronForm, name: e.target.value })} />
                </div>
                <div className="col-md-5">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>執行方式</label>
                  <select className="form-select" value={cronForm.executor} onChange={e => setCronForm({ ...cronForm, executor: e.target.value as 'shell' | 'rlua' })}>
                    <option value="shell">shell</option>
                    <option value="rlua">rlua</option>
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>描述</label>
                  <input className="form-control" value={cronForm.description} onChange={e => setCronForm({ ...cronForm, description: e.target.value })} />
                </div>
                <div className="col-md-8">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Cron Expression</label>
                  <input className="form-control font-monospace" value={cronForm.schedule} onChange={e => setCronForm({ ...cronForm, schedule: e.target.value })} />
                </div>
                <div className="col-md-4">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Timeout 秒</label>
                  <input type="number" min={1} max={86400} className="form-control" value={cronForm.timeout_secs} onChange={e => setCronForm({ ...cronForm, timeout_secs: Number(e.target.value) })} />
                </div>
                <div className="col-12">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Working Directory</label>
                  <input className="form-control font-monospace" value={cronForm.working_dir} onChange={e => setCronForm({ ...cronForm, working_dir: e.target.value })} />
                </div>
                <div className="col-12">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Script</label>
                  <textarea className="form-control font-monospace" rows={9} value={cronForm.script} onChange={e => setCronForm({ ...cronForm, script: e.target.value })} />
                </div>
                <div className="col-12">
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Env JSON</label>
                  <textarea className="form-control font-monospace" rows={3} value={cronForm.env_json} onChange={e => setCronForm({ ...cronForm, env_json: e.target.value })} />
                </div>
              </div>
              <div className="d-flex gap-2 mt-3">
                <button className="btn btn-primary" onClick={saveCronJob} disabled={cronBusy}><i className="bx bx-save me-1"></i>儲存</button>
                <button className="btn btn-outline-secondary" onClick={startNewCronJob} disabled={cronBusy}>清空</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
