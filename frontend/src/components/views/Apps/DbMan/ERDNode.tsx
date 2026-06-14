import { Handle, Position } from '@xyflow/react'

export type ErdColumn = {
  name: string
  data_type: string
  nullable: boolean
  primary_key: boolean
}

export type ErdNodeData = {
  tableName: string
  columns: ErdColumn[]
}

const tableHeaderStyle: React.CSSProperties = {
  background: '#1e40af',
  color: '#fff',
  padding: '6px 10px',
  fontWeight: 600,
  fontSize: 13,
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const colRowStyle = (isPk: boolean, isLast: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: "'Cascadia Code', monospace",
  borderBottom: isLast ? 'none' : '1px solid #e5e7eb',
  background: isPk ? '#fef3c7' : '#fff',
})

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#1e40af',
  border: '1.5px solid #fff',
}

export default function ErdNode({ data, selected }: { data: ErdNodeData; selected?: boolean }) {
  return (
    <div
      style={{
        background: '#fff',
        border: selected ? '2px solid #2563eb' : '1px solid #d1d5db',
        borderRadius: 6,
        minWidth: 220,
        boxShadow: selected
          ? '0 0 0 3px rgba(37, 99, 235, .25), 0 4px 12px rgba(0,0,0,.18)'
          : '0 2px 6px rgba(0,0,0,.12)',
      }}
    >
      <Handle id="t-top-target" type="target" position={Position.Top}    style={handleStyle} />
      <Handle id="t-top-source" type="source" position={Position.Top}    style={handleStyle} />
      <Handle id="t-right-target" type="target" position={Position.Right}  style={handleStyle} />
      <Handle id="t-right-source" type="source" position={Position.Right}  style={handleStyle} />
      <Handle id="t-bottom-target" type="target" position={Position.Bottom} style={handleStyle} />
      <Handle id="t-bottom-source" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="t-left-target" type="target" position={Position.Left}   style={handleStyle} />
      <Handle id="t-left-source" type="source" position={Position.Left}   style={handleStyle} />
      <div style={tableHeaderStyle}>
        <i className="bx bx-table" style={{ fontSize: '1rem' }}></i>
        <span style={{ wordBreak: 'break-all' }}>{data.tableName}</span>
      </div>
      <div>
        {data.columns.length === 0 ? (
          <div style={{ ...colRowStyle(true, true), color: '#9ca3af', fontStyle: 'italic' }}>
            (無欄位)
          </div>
        ) : data.columns.map((col, idx) => (
          <div key={`${col.name}-${idx}`} style={colRowStyle(col.primary_key, idx === data.columns.length - 1)}>
            {col.primary_key ? (
              <i className="bx bx-key" style={{ color: '#d97706', fontSize: 12 }} title="Primary Key"></i>
            ) : (
              <span style={{ width: 12 }}></span>
            )}
            <span style={{ flexGrow: 1, color: '#1f2937' }}>{col.name}</span>
            <span style={{ color: '#6b7280', fontSize: 10 }}>{col.data_type}</span>
            {!col.nullable && !col.primary_key && (
              <span style={{ color: '#dc2626', fontSize: 9, marginLeft: 4 }} title="NOT NULL">NN</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
