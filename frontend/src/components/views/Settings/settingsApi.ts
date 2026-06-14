import { getApiBase } from '../../../utils/api'

export type Role = {
  id: number
  code: string
  name: string
  description: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export type Unit = {
  id: number
  code: string
  name: string
  parent_id: number | null
  description: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export type User = {
  id: number
  username: string
  display_name: string
  email: string | null
  phone: string | null
  unit_id: number | null
  role_codes: string[]
  enabled: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export type DictionaryEntry = {
  id: number
  category: string
  code: string
  label: string
  description: string
  sort_order: number
  extra_json: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export type SystemSetting = {
  id: number
  key: string
  value: string
  category: string
  data_type: string
  description: string
  is_secret: boolean
  created_at: string
  updated_at: string
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data as T
}

const PREFIX = '/api/settings'

export const settingsApi = {
  listRoles: () => send<{ roles: Role[] }>(`${PREFIX}/roles`, 'GET'),
  getRole: (id: number) => send<{ role: Role }>(`${PREFIX}/roles/${id}`, 'GET'),
  createRole: (body: { code: string; name: string; description?: string; enabled?: boolean }) =>
    send<{ role: Role }>(`${PREFIX}/roles`, 'POST', body),
  updateRole: (id: number, body: { code: string; name: string; description?: string; enabled?: boolean }) =>
    send<{ role: Role }>(`${PREFIX}/roles/${id}`, 'PUT', body),
  deleteRole: (id: number) => send<{ deleted: boolean }>(`${PREFIX}/roles/${id}`, 'DELETE'),

  listUnits: () => send<{ units: Unit[] }>(`${PREFIX}/units`, 'GET'),
  getUnit: (id: number) => send<{ unit: Unit }>(`${PREFIX}/units/${id}`, 'GET'),
  createUnit: (body: { code: string; name: string; parent_id?: number | null; description?: string; enabled?: boolean }) =>
    send<{ unit: Unit }>(`${PREFIX}/units`, 'POST', body),
  updateUnit: (id: number, body: { code: string; name: string; parent_id?: number | null; description?: string; enabled?: boolean }) =>
    send<{ unit: Unit }>(`${PREFIX}/units/${id}`, 'PUT', body),
  deleteUnit: (id: number) => send<{ deleted: boolean }>(`${PREFIX}/units/${id}`, 'DELETE'),

  listUsers: () => send<{ users: User[] }>(`${PREFIX}/users`, 'GET'),
  getUser: (id: number) => send<{ user: User }>(`${PREFIX}/users/${id}`, 'GET'),
  createUser: (body: {
    username: string
    display_name?: string
    email?: string
    phone?: string
    password?: string
    unit_id?: number | null
    role_codes?: string[]
    enabled?: boolean
  }) => send<{ user: User }>(`${PREFIX}/users`, 'POST', body),
  updateUser: (id: number, body: {
    username: string
    display_name?: string
    email?: string
    phone?: string
    password?: string
    unit_id?: number | null
    role_codes?: string[]
    enabled?: boolean
  }) => send<{ user: User }>(`${PREFIX}/users/${id}`, 'PUT', body),
  resetPassword: (id: number, password: string) =>
    send<{ reset: boolean }>(`${PREFIX}/users/${id}/reset-password`, 'POST', { password }),
  deleteUser: (id: number) => send<{ deleted: boolean }>(`${PREFIX}/users/${id}`, 'DELETE'),

  listDictionary: () => send<{ entries: DictionaryEntry[] }>(`${PREFIX}/dictionary`, 'GET'),
  getDictionary: (id: number) => send<{ entry: DictionaryEntry }>(`${PREFIX}/dictionary/${id}`, 'GET'),
  createDictionary: (body: {
    category: string
    code: string
    label: string
    description?: string
    sort_order?: number
    extra_json?: string
    enabled?: boolean
  }) => send<{ entry: DictionaryEntry }>(`${PREFIX}/dictionary`, 'POST', body),
  updateDictionary: (id: number, body: {
    category: string
    code: string
    label: string
    description?: string
    sort_order?: number
    extra_json?: string
    enabled?: boolean
  }) => send<{ entry: DictionaryEntry }>(`${PREFIX}/dictionary/${id}`, 'PUT', body),
  deleteDictionary: (id: number) => send<{ deleted: boolean }>(`${PREFIX}/dictionary/${id}`, 'DELETE'),

  listSettings: () => send<{ settings: SystemSetting[] }>(`${PREFIX}/system`, 'GET'),
  getSetting: (id: number) => send<{ setting: SystemSetting }>(`${PREFIX}/system/${id}`, 'GET'),
  createSetting: (body: {
    key: string
    value: string
    category?: string
    data_type?: string
    description?: string
    is_secret?: boolean
  }) => send<{ setting: SystemSetting }>(`${PREFIX}/system`, 'POST', body),
  updateSetting: (id: number, body: {
    key: string
    value: string
    category?: string
    data_type?: string
    description?: string
    is_secret?: boolean
  }) => send<{ setting: SystemSetting }>(`${PREFIX}/system/${id}`, 'PUT', body),
  deleteSetting: (id: number) => send<{ deleted: boolean }>(`${PREFIX}/system/${id}`, 'DELETE'),
}
