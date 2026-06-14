# Checklist Implementation 01 — ApiMan、DbMan、資安

## 總覽

新增三個第一階層主功能選單，各自包含子項目。本文件進行功能分析、資料結構設計與分批實作規劃。

---

## 一、ApiMan — API 連線測試工具（類 Postman）

### 1.1 功能分析

| 需求 | 說明 |
|------|------|
| Workspace | 建立獨立工作區，最多 N 個，每個 workspace 有自己的根節點 |
| 多層目錄 | workspace 內可建立無限層級的分類目錄（樹狀結構） |
| API 請求 | 每個葉節點為一個 API 請求，支援 GET/POST/PUT/DELETE/PATCH |
| 參數編輯 | URL、Headers (Key-Value)、Body (JSON/Form/Text)、Query Params |
| 發送測試 | 向目標發送 HTTP 請求，顯示 Response Status / Headers / Body |
| 儲存結果 | 可選擇性儲存最近一次回覆內容 |

### 1.2 資料結構設計（SQLite）

```sql
-- workspace 表
CREATE TABLE apiman_workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 樹狀節點表 (parent_id 實現多層目錄, null 表示 workspace 根層級)
CREATE TABLE apiman_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    parent_id INTEGER,                    -- NULL = 根層級
    name TEXT NOT NULL,                   -- 目錄名或請求名稱
    node_type TEXT NOT NULL DEFAULT 'request', -- 'folder' | 'request'
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (workspace_id) REFERENCES apiman_workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES apiman_nodes(id) ON DELETE CASCADE
);

-- API 請求細節 (僅 node_type='request' 有對應記錄)
CREATE TABLE apiman_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL UNIQUE,
    method TEXT NOT NULL DEFAULT 'GET',    -- GET/POST/PUT/DELETE/PATCH
    url TEXT NOT NULL DEFAULT '',
    headers TEXT,                         -- JSON: [{"key":"Content-Type","value":"application/json","enabled":true}]
    query_params TEXT,                    -- JSON: [{"key":"page","value":"1","enabled":true}]
    body_type TEXT DEFAULT 'none',        -- none | json | form | text
    body_content TEXT,
    last_response_status INTEGER,
    last_response_headers TEXT,
    last_response_body TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (node_id) REFERENCES apiman_nodes(id) ON DELETE CASCADE
);
```

### 1.3 API 端點設計

| 端點 | 方法 | 功能 |
|------|------|------|
| `/api/apiman/workspaces` | GET/POST | 列表/新增 workspace |
| `/api/apiman/workspaces/:id` | PUT/DELETE | 更新/刪除 workspace |
| `/api/apiman/workspaces/:id/nodes` | GET | 取得某 workspace 的完整樹 |
| `/api/apiman/nodes` | POST | 新增節點 (folder/request) |
| `/api/apiman/nodes/:id` | PUT/DELETE | 更新/刪除節點 |
| `/api/apiman/nodes/:id/move` | POST | 拖曳移動節點 (變更 parent_id / sort_order) |
| `/api/apiman/requests/:node_id` | GET/PUT | 取得/更新 request 細節 |
| `/api/apiman/requests/:node_id/send` | POST | 發送 HTTP 請求並回傳結果 |
| `/api/apiman/requests/:node_id/history` | GET | 取得最近回應紀錄 (可選) |

### 1.4 分批實作規劃

| 批次 | 內容 |
|------|------|
| **P1** | DB schema + workspace CRUD + 樹狀節點 CRUD + 前端 workspace 管理 + 樹狀目錄 UI |
| **P2** | Request 編輯器 (method/url/headers/body) + 發送功能 + Response 顯示 |
| **P3** | 多層目錄拖曳排序 + Query Params 編輯器 + 歷史回應儲存 |

---

## 二、DbMan — 資料庫管理工具（類 DBeaver）

### 2.1 功能分析

| 需求 | 說明 |
|------|------|
| 連線管理 | 儲存多個資料庫連線設定 (SQLite/MySQL/SQL Server) |
| 連線清單 | 已儲存的連線顯示在選單子項目中，一鍵切換 |
| SQLite | 檔案路徑連線，直接操作 `.sqlite3` / `.db` 檔案 |
| MySQL | host:port, username, password, database |
| SQL Server | host:port, username, password, database, trust_server_certificate |
| 瀏覽器 | 連線後顯示資料表列表、欄位資訊、資料預覽 |
| SQL 編輯器 | 輸入 SQL 並執行，顯示結果表格 |

### 2.2 資料結構設計（SQLite）

```sql
CREATE TABLE dbman_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    db_type TEXT NOT NULL,                -- 'sqlite' | 'mysql' | 'sqlserver'
    -- SQLite
    file_path TEXT,
    -- MySQL / SQL Server
    host TEXT,
    port INTEGER,
    username TEXT,
    password TEXT,                         -- 加密儲存或留空每次輸入
    database_name TEXT,
    trust_server_cert INTEGER DEFAULT 0,  -- SQL Server
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

### 2.3 API 端點設計

| 端點 | 方法 | 功能 |
|------|------|------|
| `/api/dbman/connections` | GET/POST | 列表/新增連線 |
| `/api/dbman/connections/:id` | PUT/DELETE | 更新/刪除連線 |
| `/api/dbman/connections/:id/connect` | POST | 測試連線並回傳資料表列表 |
| `/api/dbman/connections/:id/tables` | GET | 取得資料表清單 |
| `/api/dbman/connections/:id/tables/:table/schema` | GET | 取得欄位結構 |
| `/api/dbman/connections/:id/tables/:table/data` | GET | 資料預覽 (LIMIT 100) |
| `/api/dbman/connections/:id/query` | POST | 執行任意 SQL 並回傳結果 |

### 2.4 分批實作規劃

| 批次 | 內容 |
|------|------|
| **P1** | DB schema + 連線 CRUD + 連線測試 + SQLite 實作 (最簡單) |
| **P2** | MySQL 驅動整合 + 前端連線管理 UI + 資料表瀏覽 |
| **P3** | SQL Server 驅動整合 + SQL 編輯器 + 查詢結果表格顯示 |
| **P4** | 密碼加密儲存 + 選單動態建立連線快捷 |

---

## 三、資安 — CVS 資料庫與網路掃描整合

### 3.1 功能分析

| 需求 | 說明 |
|------|------|
| CVS 資料庫下載 | 從指定 URL 下載 CSV 檔案並存入 SQLite 資料表 |
| rust_network_scanner | 整合 Rust 網路掃描工具，掃描指定網段的開放埠 |
| 掃描結果儲存 | 掃描結果存入 SQLite 供後續查詢 |

### 3.2 資料結構設計（SQLite）

```sql
-- CVS 匯入來源
CREATE TABLE security_cvs_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    table_name TEXT NOT NULL,             -- 匯入到哪個資料表
    delimiter TEXT NOT NULL DEFAULT ',',
    has_header INTEGER NOT NULL DEFAULT 1,
    auto_import INTEGER NOT NULL DEFAULT 0,  -- 是否自動定期匯入
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 動態建立的 CSV 資料表 (每次匯入自動建立/取代)
-- 名稱格式: cvs_import_{id}

-- 網路掃描任務
CREATE TABLE security_scan_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target TEXT NOT NULL,                 -- "192.168.1.0/24" 或 "10.0.0.1-100"
    ports TEXT DEFAULT '22,80,443,3306,6379,8080,8443',  -- 掃描埠號列表
    scan_type TEXT NOT NULL DEFAULT 'tcp', -- tcp | udp | syn
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
    result_summary TEXT,                  -- JSON 摘要
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 掃描結果
CREATE TABLE security_scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'tcp',
    service TEXT,
    state TEXT NOT NULL,                  -- open | closed | filtered
    banner TEXT,
    FOREIGN KEY (task_id) REFERENCES security_scan_tasks(id) ON DELETE CASCADE
);

-- 整合 CVS 資料庫 (原始威脅情資資料)
CREATE TABLE security_cvs_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    ip TEXT,
    port INTEGER,
    threat_type TEXT,
    description TEXT,
    severity TEXT,
    source_name TEXT,
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (source_id) REFERENCES security_cvs_sources(id) ON DELETE CASCADE
);
```

### 3.3 API 端點設計

| 端點 | 方法 | 功能 |
|------|------|------|
| `/api/security/cvs/sources` | GET/POST | 列表/新增 CVS 來源 |
| `/api/security/cvs/sources/:id` | PUT/DELETE | 更新/刪除來源 |
| `/api/security/cvs/sources/:id/import` | POST | 下載並匯入 CSV |
| `/api/security/cvs/records` | GET | 查詢已匯入的紀錄 |
| `/api/security/scan/tasks` | GET/POST | 列表/新增掃描任務 |
| `/api/security/scan/tasks/:id` | GET | 取得任務詳情與結果 |
| `/api/security/scan/tasks/:id/start` | POST | 開始掃描 |
| `/api/security/scan/tasks/:id/results` | GET | 取得掃描結果 |
| `/api/security/scan/tasks/:id/export` | GET | 匯出掃描結果為 CSV |

### 3.4 rust_network_scanner 整合策略

**方案 A：內嵌掃描器（推薦）**
- 使用 `tokio::net::TcpStream::connect_timeout` 進行 TCP 連線掃描
- 無需外部依賴，跨平台
- 支援並發掃描 (tokio tasks)
- 可自訂逾時與併發數

**方案 B：外部工具**
- 呼叫 `nmap` 或其他外部掃描工具
- 解析輸出結果
- 需系統預先安裝對應工具

**建議先以方案 A 實作 P1，後續可擴充方案 B。**

### 3.5 分批實作規劃

| 批次 | 內容 |
|------|------|
| **P1** | DB schema + CVS 來源 CRUD + CSV 下載/匯入 + 前端 UI |
| **P2** | TCP 埠掃描引擎 (`TcpStream::connect_timeout`) + 掃描任務管理 |
| **P3** | 並發掃描優化 + 結果視覺化 + CSV 匯出 |
| **P4** | 定期自動匯入 CVS + 威脅情資關聯分析 |

---

## 選單結構變更

新增三個第一階層群組，插在「系統工具」與「AI」之間：

```
系統工具 (原有)
  ├── 系統工具
  └── Shell

ApiMan (新)
  ├── 工作區 1 (動態產生)
  ├── 工作區 2 (動態產生)
  └── + 新增工作區

DbMan (新)
  ├── SQLite 連線 (動態產生)
  ├── MySQL 連線 (動態產生)
  └── + 新增連線

資安 (新)
  ├── CVS 資料庫
  ├── 網路掃描
  └── 掃描紀錄

AI (原有)
  └── AI 助手

協助 (原有)
  └── 命令文件
```

---

## 批次執行順序

| 優先序 | 批次 | 說明 |
|--------|------|------|
| **1** | 選單建置 | 已實作 | ✅ |
| **2** | ApiMan P1 | Workspace + 樹狀節點 CRUD + 完整 Request 編輯發送 | ✅ |
| **3** | ApiMan P2 | Request 編輯器 + 發送功能（P1 同時完成） | ✅ |
| **4** | DbMan P1 | 連線 CRUD + SQLite 實作 + 資料表瀏覽 | ✅ |
| **5** | DbMan P2 | MySQL/SQL Server CLI 驅動 + SQL 編輯器 | ✅ |
| **6** | 資安 P1 | CVS 來源 CRUD + 下載匯入 | ✅ |
| **7** | 資安 P2 | TCP 埠掃描引擎（初始版本） | ✅ |
| **8** | DbMan P3 | MySQL/SQL Server 資料表列表 + 欄位結構（擴充完成） | ✅ |
| **9** | 資安 P3 | 並發埠掃描（tokio tasks + Semaphore=256） | ✅ |
| **10** | ApiMan P3 | 樹狀節點拖曳排序 + 就地重新命名 | ✅ |
| **11** | DbMan P4 | 密碼加密儲存 + 選單動態建立連線快捷 | ✅ |
| **12** | 資安 P4 | 自動定時匯入 CVS + 威脅情資關聯分析（自動匯入） | ✅ |
