use crate::dbman::{DbConnection, DbConnectionInput};
use crate::security::{CvsSource, CvsSourceInput, ScanResult, ScanTask, ScanTaskInput};
use crate::apiman::{
    ApiManNode, ApiManNodeInput, ApiManRequest, ApiManRequestInput, ApiManWorkspace,
    ApiManWorkspaceInput,
};
use crate::juniper::JuniperConfig;
use crate::netplan::NetplanConfig;
use crate::nginx::{NginxModule, NginxSettings, NginxSite, NginxSiteUpdate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const DEFAULT_DEVICE_ID: i64 = 1;

#[derive(Clone)]
pub struct AppDb {
    path: PathBuf,
}

#[derive(Clone, Serialize)]
pub struct JuniperDeviceSettings {
    pub id: i64,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub has_password: bool,
    pub connect_timeout_secs: u64,
    pub strict_host_key_checking: bool,
    #[serde(skip_serializing)]
    pub password: Option<String>,
}

#[derive(Clone)]
pub struct JuniperDeviceUpdate {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub clear_password: bool,
    pub connect_timeout_secs: u64,
    pub strict_host_key_checking: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DbManSavedQuery {
    pub id: i64,
    pub name: String,
    pub sql_text: String,
    pub db_type: String,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
pub struct HaproxyBackendServerSettings {
    pub id: i64,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub health_check: bool,
    pub position: i64,
}

#[derive(Clone, Serialize)]
pub struct HaproxyLoadBalancerSettings {
    pub id: i64,
    pub lb_type: String,
    pub enabled: bool,
    pub name: String,
    pub bind_port: u16,
    pub mode: String,
    pub balance_method: String,
    pub health_check_path: Option<String>,
    pub health_check: bool,
    pub servers: Vec<HaproxyBackendServerSettings>,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct HaproxyLoadBalancerUpdate {
    pub lb_type: String,
    pub enabled: bool,
    pub name: String,
    pub bind_port: u16,
    pub mode: String,
    pub balance_method: String,
    pub health_check_path: Option<String>,
    pub health_check: bool,
    pub servers: Vec<HaproxyBackendServerUpdate>,
}

#[derive(Clone, Deserialize)]
pub struct HaproxyBackendServerUpdate {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub health_check: Option<bool>,
}

impl AppDb {
    pub fn from_env() -> Result<Self, String> {
        let path = std::env::var("FWM_DB_PATH")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("firewall-man.sqlite3"));
        let db = Self { path };
        db.init()?;
        Ok(db)
    }

    pub fn juniper_config(&self) -> Result<JuniperConfig, String> {
        let settings = self.juniper_settings()?;
        Ok(JuniperConfig {
            host: settings.host,
            port: settings.port,
            username: settings.username,
            password: settings.password,
            connect_timeout_secs: settings.connect_timeout_secs,
            strict_host_key_checking: settings.strict_host_key_checking,
        })
    }

    pub fn juniper_settings(&self) -> Result<JuniperDeviceSettings, String> {
        self.ensure_seeded()?;
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, name, host, port, username, password, connect_timeout_secs, strict_host_key_checking
             FROM juniper_devices WHERE id = ?1",
            params![DEFAULT_DEVICE_ID],
            |row| {
                let password: Option<String> = row.get(5)?;
                Ok(JuniperDeviceSettings {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    host: row.get(2)?,
                    port: row.get::<_, i64>(3)? as u16,
                    username: row.get(4)?,
                    has_password: password.as_ref().map(|s| !s.is_empty()).unwrap_or(false),
                    password,
                    connect_timeout_secs: row.get::<_, i64>(6)? as u64,
                    strict_host_key_checking: row.get::<_, i64>(7)? != 0,
                })
            },
        )
        .map_err(|e| format!("load Juniper device settings failed: {e}"))
    }

    pub fn save_juniper_settings(
        &self,
        update: JuniperDeviceUpdate,
    ) -> Result<JuniperDeviceSettings, String> {
        validate_device_update(&update)?;
        self.ensure_seeded()?;

        let conn = self.connect()?;
        if update.clear_password || update.password.is_some() {
            conn.execute(
                "UPDATE juniper_devices
                 SET name = ?1, host = ?2, port = ?3, username = ?4, password = ?5,
                     connect_timeout_secs = ?6, strict_host_key_checking = ?7,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?8",
                params![
                    update.name,
                    update.host,
                    i64::from(update.port),
                    update.username,
                    update.password,
                    update.connect_timeout_secs as i64,
                    if update.strict_host_key_checking {
                        1
                    } else {
                        0
                    },
                    DEFAULT_DEVICE_ID
                ],
            )
        } else {
            conn.execute(
                "UPDATE juniper_devices
                 SET name = ?1, host = ?2, port = ?3, username = ?4,
                     connect_timeout_secs = ?5, strict_host_key_checking = ?6,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?7",
                params![
                    update.name,
                    update.host,
                    i64::from(update.port),
                    update.username,
                    update.connect_timeout_secs as i64,
                    if update.strict_host_key_checking {
                        1
                    } else {
                        0
                    },
                    DEFAULT_DEVICE_ID
                ],
            )
        }
        .map_err(|e| format!("save Juniper device settings failed: {e}"))?;

        self.juniper_settings()
    }

    pub fn list_haproxy_lbs(&self) -> Result<Vec<HaproxyLoadBalancerSettings>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, lb_type, enabled, name, bind_port, mode, balance_method,
                        health_check_path, health_check, updated_at
                 FROM haproxy_load_balancers
                 ORDER BY lb_type, name",
            )
            .map_err(|e| format!("prepare HAProxy load balancer query failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, i64>(8)? != 0,
                    row.get::<_, String>(9)?,
                ))
            })
            .map_err(|e| format!("query HAProxy load balancers failed: {e}"))?;

        let mut items = Vec::new();
        for row in rows {
            let (
                id,
                lb_type,
                enabled,
                name,
                bind_port,
                mode,
                balance_method,
                health_check_path,
                health_check,
                updated_at,
            ) = row.map_err(|e| format!("read HAProxy load balancer row failed: {e}"))?;
            items.push(HaproxyLoadBalancerSettings {
                id,
                lb_type,
                enabled,
                name,
                bind_port: bind_port as u16,
                mode,
                balance_method,
                health_check_path,
                health_check,
                servers: self.haproxy_servers(id)?,
                updated_at,
            });
        }
        Ok(items)
    }

    pub fn save_haproxy_lb(
        &self,
        update: HaproxyLoadBalancerUpdate,
    ) -> Result<HaproxyLoadBalancerSettings, String> {
        validate_haproxy_update(&update)?;
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("start HAProxy settings transaction failed: {e}"))?;
        let existing_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM haproxy_load_balancers WHERE lb_type = ?1 AND name = ?2",
                params![update.lb_type, update.name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("lookup HAProxy load balancer failed: {e}"))?;

        if existing_id.is_some() {
            return Err(format!(
                "HAProxy {} load balancer frontend name already exists: {}",
                update.lb_type, update.name
            ));
        }

        tx.execute(
            "INSERT INTO haproxy_load_balancers
             (lb_type, enabled, name, bind_port, mode, balance_method, health_check_path, health_check)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                update.lb_type,
                if update.enabled { 1 } else { 0 },
                update.name,
                i64::from(update.bind_port),
                update.mode,
                update.balance_method,
                update.health_check_path,
                if update.health_check { 1 } else { 0 }
            ],
        )
        .map_err(|e| format!("insert HAProxy load balancer failed: {e}"))?;
        let id = tx.last_insert_rowid();

        tx.execute(
            "DELETE FROM haproxy_backend_servers WHERE lb_id = ?1",
            params![id],
        )
        .map_err(|e| format!("clear HAProxy backend servers failed: {e}"))?;

        for (idx, server) in update.servers.iter().enumerate() {
            tx.execute(
                "INSERT INTO haproxy_backend_servers
                 (lb_id, name, ip, port, health_check, position)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id,
                    server.name,
                    server.ip,
                    i64::from(server.port),
                    if server.health_check.unwrap_or(true) {
                        1
                    } else {
                        0
                    },
                    idx as i64
                ],
            )
            .map_err(|e| format!("insert HAProxy backend server failed: {e}"))?;
        }

        tx.commit()
            .map_err(|e| format!("commit HAProxy settings failed: {e}"))?;
        self.haproxy_lb(id)
    }

    pub fn delete_haproxy_lb(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM haproxy_backend_servers WHERE lb_id = ?1",
            params![id],
        )
        .map_err(|e| format!("delete HAProxy backend servers failed: {e}"))?;
        let affected = conn
            .execute(
                "DELETE FROM haproxy_load_balancers WHERE id = ?1",
                params![id],
            )
            .map_err(|e| format!("delete HAProxy load balancer failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn set_haproxy_lb_enabled(&self, id: i64, enabled: bool) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn
            .execute(
                "UPDATE haproxy_load_balancers
                 SET enabled = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?2",
                params![if enabled { 1 } else { 0 }, id],
            )
            .map_err(|e| format!("update HAProxy load balancer enabled state failed: {e}"))?;
        Ok(affected > 0)
    }

    fn init(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("create database directory failed: {e}"))?;
            }
        }
        let conn = self.connect()?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS juniper_devices (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'default',
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                password TEXT NULL,
                connect_timeout_secs INTEGER NOT NULL DEFAULT 10,
                strict_host_key_checking INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS haproxy_load_balancers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lb_type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                bind_port INTEGER NOT NULL,
                mode TEXT NOT NULL,
                balance_method TEXT NOT NULL,
                health_check_path TEXT NULL,
                health_check INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                UNIQUE(lb_type, name)
            );
            CREATE TABLE IF NOT EXISTS haproxy_backend_servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lb_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER NOT NULL,
                health_check INTEGER NOT NULL DEFAULT 1,
                position INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS nginx_settings (
                id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                nginx_bin TEXT NOT NULL DEFAULT 'nginx',
                config_dir TEXT NOT NULL DEFAULT '/etc/nginx',
                sites_enabled_dir TEXT NOT NULL DEFAULT '/etc/nginx/sites-enabled',
                modules_enabled_dir TEXT NOT NULL DEFAULT '/etc/nginx/modules-enabled',
                conf_d_dir TEXT NOT NULL DEFAULT '/etc/nginx/conf.d',
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS nginx_sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_name TEXT NOT NULL UNIQUE,
                server_name TEXT NOT NULL DEFAULT '_',
                enabled INTEGER NOT NULL DEFAULT 1,
                document_root TEXT NOT NULL DEFAULT '/var/www/html',
                config_content TEXT,
                site_type TEXT NOT NULL DEFAULT 'server',
                reverse_proxy_pass TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS nginx_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module_name TEXT NOT NULL UNIQUE,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS netplan_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interface_name TEXT NOT NULL,
                dhcp INTEGER NOT NULL DEFAULT 1,
                ip_address TEXT,
                netmask_prefix INTEGER,
                gateway TEXT,
                dns_servers TEXT,
                config_yaml TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS security_cvs_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                table_name TEXT NOT NULL,
                delimiter TEXT NOT NULL DEFAULT ',',
                has_header INTEGER NOT NULL DEFAULT 1,
                auto_import INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS security_scan_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                target TEXT NOT NULL,
                ports TEXT DEFAULT '22,80,443,3306,6379,8080,8443',
                scan_type TEXT NOT NULL DEFAULT 'tcp',
                status TEXT NOT NULL DEFAULT 'pending',
                result_summary TEXT,
                started_at TEXT,
                completed_at TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS security_scan_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER NOT NULL,
                protocol TEXT NOT NULL DEFAULT 'tcp',
                service TEXT,
                state TEXT NOT NULL,
                banner TEXT,
                FOREIGN KEY (task_id) REFERENCES security_scan_tasks(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS dbman_saved_queries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sql_text TEXT NOT NULL,
                db_type TEXT NOT NULL DEFAULT 'sqlite',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS dbman_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                db_type TEXT NOT NULL,
                file_path TEXT,
                host TEXT,
                port INTEGER,
                username TEXT,
                password TEXT,
                database_name TEXT,
                trust_server_cert INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS apiman_workspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS apiman_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL,
                parent_id INTEGER,
                name TEXT NOT NULL,
                node_type TEXT NOT NULL DEFAULT 'request',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (workspace_id) REFERENCES apiman_workspaces(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_id) REFERENCES apiman_nodes(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS apiman_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER NOT NULL UNIQUE,
                method TEXT NOT NULL DEFAULT 'GET',
                url TEXT NOT NULL DEFAULT '',
                headers TEXT,
                query_params TEXT,
                body_type TEXT DEFAULT 'none',
                body_content TEXT,
                last_response_status INTEGER,
                last_response_headers TEXT,
                last_response_body TEXT,
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (node_id) REFERENCES apiman_nodes(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS apiman_response_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER NOT NULL,
                status INTEGER,
                headers TEXT,
                body TEXT,
                elapsed_ms INTEGER,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (node_id) REFERENCES apiman_nodes(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS apiman_variables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (workspace_id) REFERENCES apiman_workspaces(id) ON DELETE CASCADE,
                UNIQUE(workspace_id, key)
            );",
        )
        .map_err(|e| format!("initialize database schema failed: {e}"))?;
        let _ = conn.execute(
            "ALTER TABLE haproxy_load_balancers ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE apiman_requests ADD COLUMN auth_config TEXT",
            [],
        );
        self.ensure_seeded()
    }

    fn haproxy_lb(&self, id: i64) -> Result<HaproxyLoadBalancerSettings, String> {
        let conn = self.connect()?;
        let mut item = conn
            .query_row(
                "SELECT id, lb_type, enabled, name, bind_port, mode, balance_method,
                        health_check_path, health_check, updated_at
                 FROM haproxy_load_balancers WHERE id = ?1",
                params![id],
                |row| {
                    Ok(HaproxyLoadBalancerSettings {
                        id: row.get(0)?,
                        lb_type: row.get(1)?,
                        enabled: row.get::<_, i64>(2)? != 0,
                        name: row.get(3)?,
                        bind_port: row.get::<_, i64>(4)? as u16,
                        mode: row.get(5)?,
                        balance_method: row.get(6)?,
                        health_check_path: row.get(7)?,
                        health_check: row.get::<_, i64>(8)? != 0,
                        servers: Vec::new(),
                        updated_at: row.get(9)?,
                    })
                },
            )
            .map_err(|e| format!("load HAProxy load balancer failed: {e}"))?;
        item.servers = self.haproxy_servers(id)?;
        Ok(item)
    }

    fn haproxy_servers(&self, lb_id: i64) -> Result<Vec<HaproxyBackendServerSettings>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, ip, port, health_check, position
                 FROM haproxy_backend_servers
                 WHERE lb_id = ?1
                 ORDER BY position, id",
            )
            .map_err(|e| format!("prepare HAProxy backend server query failed: {e}"))?;
        let rows = stmt
            .query_map(params![lb_id], |row| {
                Ok(HaproxyBackendServerSettings {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    ip: row.get(2)?,
                    port: row.get::<_, i64>(3)? as u16,
                    health_check: row.get::<_, i64>(4)? != 0,
                    position: row.get(5)?,
                })
            })
            .map_err(|e| format!("query HAProxy backend servers failed: {e}"))?;

        let mut servers = Vec::new();
        for row in rows {
            servers.push(row.map_err(|e| format!("read HAProxy backend server failed: {e}"))?);
        }
        Ok(servers)
    }

    pub fn nginx_settings(&self) -> Result<NginxSettings, String> {
        let conn = self.connect()?;
        let result = conn
            .query_row(
                "SELECT nginx_bin, config_dir, sites_enabled_dir, modules_enabled_dir, conf_d_dir
                 FROM nginx_settings WHERE id = 1",
                [],
                |row| {
                    Ok(NginxSettings {
                        nginx_bin: row.get(0)?,
                        config_dir: row.get(1)?,
                        sites_enabled_dir: row.get(2)?,
                        modules_enabled_dir: row.get(3)?,
                        conf_d_dir: row.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("load nginx settings failed: {e}"))?;
        Ok(result.unwrap_or_else(NginxSettings::default))
    }

    pub fn save_nginx_settings(&self, s: &NginxSettings) -> Result<(), String> {
        let conn = self.connect()?;
        let affected = conn
            .execute(
                "UPDATE nginx_settings SET nginx_bin = ?1, config_dir = ?2,
                 sites_enabled_dir = ?3, modules_enabled_dir = ?4, conf_d_dir = ?5,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 1",
                params![
                    s.nginx_bin,
                    s.config_dir,
                    s.sites_enabled_dir,
                    s.modules_enabled_dir,
                    s.conf_d_dir,
                ],
            )
            .map_err(|e| format!("save nginx settings failed: {e}"))?;
        if affected == 0 {
            conn.execute(
                "INSERT INTO nginx_settings (id, nginx_bin, config_dir, sites_enabled_dir, modules_enabled_dir, conf_d_dir)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5)",
                params![
                    s.nginx_bin,
                    s.config_dir,
                    s.sites_enabled_dir,
                    s.modules_enabled_dir,
                    s.conf_d_dir,
                ],
            )
            .map_err(|e| format!("insert nginx settings failed: {e}"))?;
        }
        Ok(())
    }

    pub fn list_nginx_sites(&self) -> Result<Vec<NginxSite>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, site_name, server_name, enabled, document_root, config_content,
                        site_type, reverse_proxy_pass, updated_at
                 FROM nginx_sites ORDER BY site_name",
            )
            .map_err(|e| format!("prepare nginx sites query failed: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(NginxSite {
                    id: row.get(0)?,
                    site_name: row.get(1)?,
                    server_name: row.get(2)?,
                    enabled: row.get::<_, i64>(3)? != 0,
                    document_root: row.get(4)?,
                    config_content: row.get(5)?,
                    site_type: row.get(6)?,
                    reverse_proxy_pass: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("query nginx sites failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("read nginx site row failed: {e}"))?);
        }
        Ok(items)
    }

    pub fn get_nginx_site(&self, name: &str) -> Result<Option<NginxSite>, String> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, site_name, server_name, enabled, document_root, config_content,
                    site_type, reverse_proxy_pass, updated_at
             FROM nginx_sites WHERE site_name = ?1",
            params![name],
            |row| {
                Ok(NginxSite {
                    id: row.get(0)?,
                    site_name: row.get(1)?,
                    server_name: row.get(2)?,
                    enabled: row.get::<_, i64>(3)? != 0,
                    document_root: row.get(4)?,
                    config_content: row.get(5)?,
                    site_type: row.get(6)?,
                    reverse_proxy_pass: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("query nginx site failed: {e}"))
    }

    pub fn save_nginx_site(&self, update: &NginxSiteUpdate) -> Result<NginxSite, String> {
        if update.site_name.trim().is_empty() || update.site_name.len() > 128 {
            return Err("invalid nginx site name".to_string());
        }
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO nginx_sites (site_name, server_name, enabled, document_root, config_content, site_type, reverse_proxy_pass)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                update.site_name,
                update.server_name.as_deref().unwrap_or("_"),
                if update.enabled.unwrap_or(true) { 1 } else { 0 },
                update.document_root.as_deref().unwrap_or("/var/www/html"),
                update.config_content,
                update.site_type.as_deref().unwrap_or("server"),
                update.reverse_proxy_pass,
            ],
        )
        .map_err(|e| format!("insert nginx site failed: {e}"))?;
        self.get_nginx_site(&update.site_name)
            .map(|opt| opt.unwrap())
    }

    pub fn update_nginx_site(&self, name: &str, update: &NginxSiteUpdate) -> Result<Option<NginxSite>, String> {
        let conn = self.connect()?;
        let affected = conn
            .execute(
                "UPDATE nginx_sites SET server_name = ?1, enabled = ?2, document_root = ?3,
                 config_content = ?4, site_type = ?5, reverse_proxy_pass = ?6,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE site_name = ?7",
                params![
                    update.server_name.as_deref().unwrap_or("_"),
                    if update.enabled.unwrap_or(true) { 1 } else { 0 },
                    update.document_root.as_deref().unwrap_or("/var/www/html"),
                    update.config_content,
                    update.site_type.as_deref().unwrap_or("server"),
                    update.reverse_proxy_pass,
                    name,
                ],
            )
            .map_err(|e| format!("update nginx site failed: {e}"))?;
        if affected == 0 {
            return Ok(None);
        }
        self.get_nginx_site(name)
    }

    pub fn delete_nginx_site(&self, name: &str) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn
            .execute("DELETE FROM nginx_sites WHERE site_name = ?1", params![name])
            .map_err(|e| format!("delete nginx site failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn list_nginx_modules(&self) -> Result<Vec<NginxModule>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, module_name, enabled, updated_at
                 FROM nginx_modules ORDER BY module_name",
            )
            .map_err(|e| format!("prepare nginx modules query failed: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(NginxModule {
                    id: row.get(0)?,
                    module_name: row.get(1)?,
                    enabled: row.get::<_, i64>(2)? != 0,
                    updated_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("query nginx modules failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("read nginx module row failed: {e}"))?);
        }
        Ok(items)
    }

    pub fn save_nginx_module(&self, module_name: &str) -> Result<NginxModule, String> {
        if module_name.trim().is_empty() || module_name.len() > 128 {
            return Err("invalid nginx module name".to_string());
        }
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR IGNORE INTO nginx_modules (module_name, enabled) VALUES (?1, 1)",
            params![module_name],
        )
        .map_err(|e| format!("insert nginx module failed: {e}"))?;
        let module = conn
            .query_row(
                "SELECT id, module_name, enabled, updated_at
                 FROM nginx_modules WHERE module_name = ?1",
                params![module_name],
                |row| {
                    Ok(NginxModule {
                        id: row.get(0)?,
                        module_name: row.get(1)?,
                        enabled: row.get::<_, i64>(2)? != 0,
                        updated_at: row.get(3)?,
                    })
                },
            )
            .map_err(|e| format!("query inserted nginx module failed: {e}"))?;
        Ok(module)
    }

    pub fn set_nginx_module_enabled(&self, name: &str, enabled: bool) -> Result<Option<NginxModule>, String> {
        let conn = self.connect()?;
        let affected = conn
            .execute(
                "UPDATE nginx_modules SET enabled = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE module_name = ?2",
                params![if enabled { 1 } else { 0 }, name],
            )
            .map_err(|e| format!("update nginx module enabled failed: {e}"))?;
        if affected == 0 {
            return Ok(None);
        }
        let module = conn
            .query_row(
                "SELECT id, module_name, enabled, updated_at
                 FROM nginx_modules WHERE module_name = ?1",
                params![name],
                |row| {
                    Ok(NginxModule {
                        id: row.get(0)?,
                        module_name: row.get(1)?,
                        enabled: row.get::<_, i64>(2)? != 0,
                        updated_at: row.get(3)?,
                    })
                },
            )
            .map_err(|e| format!("query updated nginx module failed: {e}"))?;
        Ok(Some(module))
    }

    pub fn list_netplan_configs(&self) -> Result<Vec<NetplanConfig>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, interface_name, dhcp, ip_address, netmask_prefix, gateway, dns_servers, config_yaml, created_at
                 FROM netplan_configs ORDER BY id DESC",
            )
            .map_err(|e| format!("prepare netplan configs query failed: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(NetplanConfig {
                    id: row.get(0)?,
                    interface_name: row.get(1)?,
                    dhcp: row.get::<_, i64>(2)? != 0,
                    ip_address: row.get(3)?,
                    netmask_prefix: row.get::<_, Option<i64>>(4)?.map(|v| v as u8),
                    gateway: row.get(5)?,
                    dns_servers: row.get(6)?,
                    config_yaml: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("query netplan configs failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("read netplan config row failed: {e}"))?);
        }
        Ok(items)
    }

    pub fn save_netplan_config(&self, config: &NetplanConfig) -> Result<NetplanConfig, String> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO netplan_configs (interface_name, dhcp, ip_address, netmask_prefix, gateway, dns_servers, config_yaml)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                config.interface_name,
                if config.dhcp { 1 } else { 0 },
                config.ip_address,
                config.netmask_prefix.map(|v| v as i64),
                config.gateway,
                config.dns_servers,
                config.config_yaml,
            ],
        )
        .map_err(|e| format!("insert netplan config failed: {e}"))?;
        let id = conn.last_insert_rowid();
        let saved = conn
            .query_row(
                "SELECT id, interface_name, dhcp, ip_address, netmask_prefix, gateway, dns_servers, config_yaml, created_at
                 FROM netplan_configs WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(NetplanConfig {
                        id: row.get(0)?,
                        interface_name: row.get(1)?,
                        dhcp: row.get::<_, i64>(2)? != 0,
                        ip_address: row.get(3)?,
                        netmask_prefix: row.get::<_, Option<i64>>(4)?.map(|v| v as u8),
                        gateway: row.get(5)?,
                        dns_servers: row.get(6)?,
                        config_yaml: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                },
            )
            .map_err(|e| format!("query saved netplan config failed: {e}"))?;

        // Prune old configs (keep newest 3)
        let all = self.list_netplan_configs()?;
        let to_delete = crate::netplan::prune_old_configs(&all);
        for del_id in to_delete {
            let _ = conn.execute("DELETE FROM netplan_configs WHERE id = ?1", rusqlite::params![del_id]);
        }

        Ok(saved)
    }

    pub fn delete_netplan_config(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn
            .execute("DELETE FROM netplan_configs WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("delete netplan config failed: {e}"))?;
        Ok(affected > 0)
    }

    // ---- Security ----
    pub fn list_security_cvs_sources(&self) -> Result<Vec<CvsSource>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT id, name, url, table_name, delimiter, has_header, auto_import, created_at, updated_at FROM security_cvs_sources ORDER BY id")
            .map_err(|e| format!("prepare cvs sources query failed: {e}"))?;
        let rows = stmt.query_map([], |row| Ok(CvsSource {
            id: row.get(0)?, name: row.get(1)?, url: row.get(2)?, table_name: row.get(3)?,
            delimiter: row.get(4)?, has_header: row.get::<_, i64>(5)? != 0,
            auto_import: row.get::<_, i64>(6)? != 0, created_at: row.get(7)?, updated_at: row.get(8)?,
        })).map_err(|e| format!("query cvs sources failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read cvs source row failed: {e}"))?); }
        Ok(items)
    }

    pub fn save_security_cvs_source(&self, input: CvsSourceInput) -> Result<CvsSource, String> {
        if input.name.trim().is_empty() || input.url.trim().is_empty() { return Err("name and url are required".to_string()); }
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO security_cvs_sources (name, url, table_name, delimiter, has_header, auto_import) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![input.name, input.url, input.table_name, input.delimiter.unwrap_or_else(|| ",".to_string()),
                if input.has_header.unwrap_or(true) { 1 } else { 0 },
                if input.auto_import.unwrap_or(false) { 1 } else { 0 }],
        ).map_err(|e| format!("insert cvs source failed: {e}"))?;
        let id = conn.last_insert_rowid();
        self.get_security_cvs_source(id).map(|opt| opt.unwrap())
    }

    pub fn delete_security_cvs_source(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn.execute("DELETE FROM security_cvs_sources WHERE id = ?1", params![id])
            .map_err(|e| format!("delete cvs source failed: {e}"))?;
        Ok(affected > 0)
    }

    fn get_security_cvs_source(&self, id: i64) -> Result<Option<CvsSource>, String> {
        let conn = self.connect()?;
        conn.query_row("SELECT id, name, url, table_name, delimiter, has_header, auto_import, created_at, updated_at FROM security_cvs_sources WHERE id = ?1",
            params![id], |row| Ok(CvsSource {
                id: row.get(0)?, name: row.get(1)?, url: row.get(2)?, table_name: row.get(3)?,
                delimiter: row.get(4)?, has_header: row.get::<_, i64>(5)? != 0,
                auto_import: row.get::<_, i64>(6)? != 0, created_at: row.get(7)?, updated_at: row.get(8)?,
            })).optional().map_err(|e| format!("get cvs source failed: {e}"))
    }

    pub fn list_security_scan_tasks(&self) -> Result<Vec<ScanTask>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT id, name, target, ports, scan_type, status, result_summary, started_at, completed_at, created_at FROM security_scan_tasks ORDER BY id DESC")
            .map_err(|e| format!("prepare scan tasks query failed: {e}"))?;
        let rows = stmt.query_map([], |row| Ok(ScanTask {
            id: row.get(0)?, name: row.get(1)?, target: row.get(2)?, ports: row.get(3)?,
            scan_type: row.get(4)?, status: row.get(5)?, result_summary: row.get(6)?,
            started_at: row.get(7)?, completed_at: row.get(8)?, created_at: row.get(9)?,
        })).map_err(|e| format!("query scan tasks failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read scan task row failed: {e}"))?); }
        Ok(items)
    }

    pub fn save_security_scan_task(&self, input: ScanTaskInput) -> Result<ScanTask, String> {
        if input.name.trim().is_empty() || input.target.trim().is_empty() { return Err("name and target are required".to_string()); }
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO security_scan_tasks (name, target, ports, scan_type, status) VALUES (?1, ?2, ?3, ?4, 'pending')",
            params![input.name, input.target, input.ports.unwrap_or_else(|| "22,80,443,3306,6379,8080,8443".to_string()),
                input.scan_type.unwrap_or_else(|| "tcp".to_string())],
        ).map_err(|e| format!("insert scan task failed: {e}"))?;
        let id = conn.last_insert_rowid();
        self.get_security_scan_task(id).map(|opt| opt.unwrap())
    }

    pub fn get_security_scan_task(&self, id: i64) -> Result<Option<ScanTask>, String> {
        let conn = self.connect()?;
        conn.query_row("SELECT id, name, target, ports, scan_type, status, result_summary, started_at, completed_at, created_at FROM security_scan_tasks WHERE id = ?1",
            params![id], |row| Ok(ScanTask {
                id: row.get(0)?, name: row.get(1)?, target: row.get(2)?, ports: row.get(3)?,
                scan_type: row.get(4)?, status: row.get(5)?, result_summary: row.get(6)?,
                started_at: row.get(7)?, completed_at: row.get(8)?, created_at: row.get(9)?,
            })).optional().map_err(|e| format!("get scan task failed: {e}"))
    }

    pub fn update_security_scan_task_status(&self, id: i64, status: &str, summary: Option<&str>) -> Result<bool, String> {
        let conn = self.connect()?;
        let completed = if status == "completed" || status == "failed" {
            ", completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
        } else if status == "running" {
            ", started_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
        } else { "" };
        let sql = format!("UPDATE security_scan_tasks SET status = ?1, result_summary = ?2 {} WHERE id = ?3", completed);
        let affected = conn.execute(&sql, params![status, summary, id])
            .map_err(|e| format!("update scan task failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn delete_security_scan_task(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let _ = conn.execute("DELETE FROM security_scan_results WHERE task_id = ?1", params![id]);
        let affected = conn.execute("DELETE FROM security_scan_tasks WHERE id = ?1", params![id])
            .map_err(|e| format!("delete scan task failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn save_security_scan_results(&self, task_id: i64, results: &[crate::security::ScanResultData]) -> Result<(), String> {
        let conn = self.connect()?;
        for r in results {
            conn.execute(
                "INSERT INTO security_scan_results (task_id, ip, port, protocol, service, state, banner) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![task_id, r.ip, r.port, r.protocol, r.service, r.state, r.banner],
            ).map_err(|e| format!("insert scan result failed: {e}"))?;
        }
        Ok(())
    }

    pub fn list_security_scan_results(&self, task_id: i64) -> Result<Vec<ScanResult>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT id, task_id, ip, port, protocol, service, state, banner FROM security_scan_results WHERE task_id = ?1 ORDER BY ip, port")
            .map_err(|e| format!("prepare scan results query failed: {e}"))?;
        let rows = stmt.query_map(params![task_id], |row| Ok(ScanResult {
            id: row.get(0)?, task_id: row.get(1)?, ip: row.get(2)?, port: row.get(3)?,
            protocol: row.get(4)?, service: row.get(5)?, state: row.get(6)?, banner: row.get(7)?,
        })).map_err(|e| format!("query scan results failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read scan result row failed: {e}"))?); }
        Ok(items)
    }

    // ---- DbMan Saved Queries ----
    pub fn list_dbman_saved_queries(&self) -> Result<Vec<DbManSavedQuery>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT id, name, sql_text, db_type, created_at FROM dbman_saved_queries ORDER BY id DESC")
            .map_err(|e| format!("prepare saved queries query failed: {e}"))?;
        let rows = stmt.query_map([], |row| {
            Ok(DbManSavedQuery {
                id: row.get(0)?, name: row.get(1)?, sql_text: row.get(2)?,
                db_type: row.get(3)?, created_at: row.get(4)?,
            })
        }).map_err(|e| format!("query saved queries failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read saved query row failed: {e}"))?); }
        Ok(items)
    }

    pub fn save_dbman_saved_query(&self, name: &str, sql: &str, db_type: &str) -> Result<DbManSavedQuery, String> {
        if name.trim().is_empty() { return Err("query name is required".to_string()); }
        if sql.trim().is_empty() { return Err("SQL is required".to_string()); }
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO dbman_saved_queries (name, sql_text, db_type) VALUES (?1, ?2, ?3)",
            params![name, sql, db_type],
        ).map_err(|e| format!("insert saved query failed: {e}"))?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, name, sql_text, db_type, created_at FROM dbman_saved_queries WHERE id = ?1",
            params![id],
            |row| Ok(DbManSavedQuery {
                id: row.get(0)?, name: row.get(1)?, sql_text: row.get(2)?,
                db_type: row.get(3)?, created_at: row.get(4)?,
            }),
        ).map_err(|e| format!("get saved query failed: {e}"))
    }

    pub fn delete_dbman_saved_query(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn.execute("DELETE FROM dbman_saved_queries WHERE id = ?1", params![id])
            .map_err(|e| format!("delete saved query failed: {e}"))?;
        Ok(affected > 0)
    }

    // ---- DbMan ----
    pub fn list_dbman_connections(&self) -> Result<Vec<DbConnection>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT id, name, db_type, file_path, host, port, username, password, database_name, trust_server_cert, created_at, updated_at FROM dbman_connections ORDER BY id")
            .map_err(|e| format!("prepare dbman connections query failed: {e}"))?;
        let rows = stmt.query_map([], |row| {
            let enc: Option<String> = row.get(7)?;
            Ok(DbConnection {
                id: row.get(0)?, name: row.get(1)?, db_type: row.get(2)?,
                file_path: row.get(3)?, host: row.get(4)?, port: row.get::<_, Option<i64>>(5)?.map(|v| v as u16),
                username: row.get(6)?, password: enc.as_deref().map(crate::dbman::decrypt_password).or(enc),
                database_name: row.get(8)?,
                trust_server_cert: row.get::<_, i64>(9)? != 0,
                created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        }).map_err(|e| format!("query dbman connections failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read conn row failed: {e}"))?); }
        Ok(items)
    }

    pub fn save_dbman_connection(&self, input: DbConnectionInput) -> Result<DbConnection, String> {
        if input.name.trim().is_empty() { return Err("connection name is required".to_string()); }
        if !matches!(input.db_type.as_str(), "sqlite" | "mysql" | "sqlserver") {
            return Err("invalid db type".to_string());
        }
        let enc_password = input.password.as_deref().map(crate::dbman::encrypt_password);
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO dbman_connections (name, db_type, file_path, host, port, username, password, database_name, trust_server_cert)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                input.name, input.db_type, input.file_path, input.host,
                input.port.map(|v| v as i64), input.username, enc_password,
                input.database_name, if input.trust_server_cert.unwrap_or(false) { 1 } else { 0 },
            ],
        ).map_err(|e| format!("insert dbman connection failed: {e}"))?;
        let id = conn.last_insert_rowid();
        self.get_dbman_connection(id).map(|opt| opt.unwrap())
    }

    pub fn update_dbman_connection(&self, id: i64, input: DbConnectionInput) -> Result<Option<DbConnection>, String> {
        let enc_password = input.password.as_deref().map(crate::dbman::encrypt_password);
        let conn = self.connect()?;
        let affected = conn.execute(
            "UPDATE dbman_connections SET name = ?1, db_type = ?2, file_path = ?3, host = ?4, port = ?5,
             username = ?6, password = ?7, database_name = ?8, trust_server_cert = ?9,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?10",
            params![
                input.name, input.db_type, input.file_path, input.host,
                input.port.map(|v| v as i64), input.username, enc_password,
                input.database_name, if input.trust_server_cert.unwrap_or(false) { 1 } else { 0 }, id,
            ],
        ).map_err(|e| format!("update dbman connection failed: {e}"))?;
        if affected == 0 { return Ok(None); }
        self.get_dbman_connection(id)
    }

    pub fn delete_dbman_connection(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn.execute("DELETE FROM dbman_connections WHERE id = ?1", params![id])
            .map_err(|e| format!("delete dbman connection failed: {e}"))?;
        Ok(affected > 0)
    }

    fn get_dbman_connection(&self, id: i64) -> Result<Option<DbConnection>, String> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, name, db_type, file_path, host, port, username, password, database_name, trust_server_cert, created_at, updated_at FROM dbman_connections WHERE id = ?1",
            params![id],
            |row| {
                let enc: Option<String> = row.get(7)?;
                Ok(DbConnection {
                    id: row.get(0)?, name: row.get(1)?, db_type: row.get(2)?,
                    file_path: row.get(3)?, host: row.get(4)?, port: row.get::<_, Option<i64>>(5)?.map(|v| v as u16),
                    username: row.get(6)?, password: enc.as_deref().map(crate::dbman::decrypt_password).or(enc),
                    database_name: row.get(8)?,
                    trust_server_cert: row.get::<_, i64>(9)? != 0,
                    created_at: row.get(10)?, updated_at: row.get(11)?,
                })
            },
        ).optional().map_err(|e| format!("get dbman connection failed: {e}"))
    }

    // ---- ApiMan ----
    pub fn list_apiman_workspaces(&self) -> Result<Vec<ApiManWorkspace>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT id, name, description, created_at, updated_at FROM apiman_workspaces ORDER BY id")
            .map_err(|e| format!("prepare apiman workspaces query failed: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ApiManWorkspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("query apiman workspaces failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("read workspace row failed: {e}"))?);
        }
        Ok(items)
    }

    pub fn save_apiman_workspace(&self, input: ApiManWorkspaceInput) -> Result<ApiManWorkspace, String> {
        if input.name.trim().is_empty() || input.name.len() > 128 {
            return Err("invalid workspace name".to_string());
        }
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO apiman_workspaces (name, description) VALUES (?1, ?2)",
            params![input.name, input.description],
        )
        .map_err(|e| format!("insert workspace failed: {e}"))?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, name, description, created_at, updated_at FROM apiman_workspaces WHERE id = ?1",
            params![id],
            |row| Ok(ApiManWorkspace {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
                created_at: row.get(3)?, updated_at: row.get(4)?,
            }),
        )
        .map_err(|e| format!("query new workspace failed: {e}"))
    }

    pub fn update_apiman_workspace(&self, id: i64, input: ApiManWorkspaceInput) -> Result<Option<ApiManWorkspace>, String> {
        let conn = self.connect()?;
        let affected = conn.execute(
            "UPDATE apiman_workspaces SET name = ?1, description = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?3",
            params![input.name, input.description, id],
        ).map_err(|e| format!("update workspace failed: {e}"))?;
        if affected == 0 { return Ok(None); }
        self.get_apiman_workspace(id)
    }

    pub fn delete_apiman_workspace(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let _ = conn.execute("DELETE FROM apiman_requests WHERE node_id IN (SELECT id FROM apiman_nodes WHERE workspace_id = ?1)", params![id]);
        let _ = conn.execute("DELETE FROM apiman_nodes WHERE workspace_id = ?1", params![id]);
        let affected = conn.execute("DELETE FROM apiman_workspaces WHERE id = ?1", params![id])
            .map_err(|e| format!("delete workspace failed: {e}"))?;
        Ok(affected > 0)
    }

    fn get_apiman_workspace(&self, id: i64) -> Result<Option<ApiManWorkspace>, String> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, name, description, created_at, updated_at FROM apiman_workspaces WHERE id = ?1",
            params![id],
            |row| Ok(ApiManWorkspace {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
                created_at: row.get(3)?, updated_at: row.get(4)?,
            }),
        ).optional().map_err(|e| format!("get workspace failed: {e}"))
    }

    pub fn list_apiman_nodes(&self, workspace_id: i64) -> Result<Vec<ApiManNode>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, parent_id, name, node_type, sort_order, created_at, updated_at
             FROM apiman_nodes WHERE workspace_id = ?1 ORDER BY sort_order, id"
        ).map_err(|e| format!("prepare nodes query failed: {e}"))?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(ApiManNode {
                id: row.get(0)?, workspace_id: row.get(1)?,
                parent_id: row.get(2)?, name: row.get(3)?,
                node_type: row.get(4)?, sort_order: row.get(5)?,
                created_at: row.get(6)?, updated_at: row.get(7)?,
            })
        }).map_err(|e| format!("query nodes failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read node row failed: {e}"))?); }
        Ok(items)
    }

    pub fn save_apiman_node(&self, input: ApiManNodeInput) -> Result<ApiManNode, String> {
        if input.name.trim().is_empty() || input.name.len() > 128 {
            return Err("invalid node name".to_string());
        }
        if input.node_type != "folder" && input.node_type != "request" {
            return Err("invalid node type".to_string());
        }
        let conn = self.connect()?;
        let sort_order = input.sort_order.unwrap_or(0);
        conn.execute(
            "INSERT INTO apiman_nodes (workspace_id, parent_id, name, node_type, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![input.workspace_id, input.parent_id, input.name, input.node_type, sort_order],
        ).map_err(|e| format!("insert node failed: {e}"))?;
        let id = conn.last_insert_rowid();
        if input.node_type == "request" {
            conn.execute(
                "INSERT INTO apiman_requests (node_id, method, url) VALUES (?1, 'GET', '')",
                params![id],
            ).map_err(|e| format!("insert request row failed: {e}"))?;
        }
        self.get_apiman_node(id).map(|opt| opt.unwrap())
    }

    pub fn update_apiman_node(&self, id: i64, name: &str, parent_id: Option<i64>, sort_order: Option<i64>) -> Result<Option<ApiManNode>, String> {
        let conn = self.connect()?;
        let affected = conn.execute(
            "UPDATE apiman_nodes SET name = ?1, parent_id = ?2, sort_order = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?4",
            params![name, parent_id, sort_order.unwrap_or(0), id],
        ).map_err(|e| format!("update node failed: {e}"))?;
        if affected == 0 { return Ok(None); }
        self.get_apiman_node(id)
    }

    pub fn delete_apiman_node(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        // Recursively delete children
        let children: Vec<i64> = {
            let mut stmt = conn.prepare("SELECT id FROM apiman_nodes WHERE parent_id = ?1")
                .map_err(|e| format!("prepare children query failed: {e}"))?;
            let rows = stmt.query_map(params![id], |row| row.get::<_, i64>(0))
                .map_err(|e| format!("query children failed: {e}"))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        for child_id in children {
            self.delete_apiman_node(child_id)?;
        }
        let _ = conn.execute("DELETE FROM apiman_requests WHERE node_id = ?1", params![id]);
        let affected = conn.execute("DELETE FROM apiman_nodes WHERE id = ?1", params![id])
            .map_err(|e| format!("delete node failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn copy_apiman_node(&self, id: i64, new_parent_id: Option<i64>) -> Result<Option<ApiManNode>, String> {
        let original = match self.get_apiman_node(id) {
            Ok(Some(n)) => n, Ok(None) => return Ok(None), Err(e) => return Err(e),
        };
        let new_name = format!("{} (copy)", original.name);
        let input = ApiManNodeInput {
            workspace_id: original.workspace_id,
            parent_id: new_parent_id.or(original.parent_id),
            name: new_name,
            node_type: original.node_type.clone(),
            sort_order: Some(original.sort_order + 1),
        };
        let new_node = self.save_apiman_node(input)?;
        // Copy children for folders
        if original.node_type == "folder" {
            let children = self.list_apiman_nodes(original.workspace_id)?;
            let child_nodes: Vec<&ApiManNode> = children.iter().filter(|n| n.parent_id == Some(original.id)).collect();
            // Need a simple sort
            let mut sorted = child_nodes.clone();
            sorted.sort_by(|a, b| a.sort_order.cmp(&b.sort_order));
            for child in sorted {
                let _ = self.copy_apiman_node(child.id, Some(new_node.id));
            }
        }
        Ok(Some(new_node))
    }

    pub fn move_apiman_node(&self, id: i64, new_parent_id: Option<i64>, new_sort_order: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn.execute(
            "UPDATE apiman_nodes SET parent_id = ?1, sort_order = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?3",
            params![new_parent_id, new_sort_order, id],
        ).map_err(|e| format!("move node failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn get_apiman_node(&self, id: i64) -> Result<Option<ApiManNode>, String> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, workspace_id, parent_id, name, node_type, sort_order, created_at, updated_at FROM apiman_nodes WHERE id = ?1",
            params![id],
            |row| Ok(ApiManNode {
                id: row.get(0)?, workspace_id: row.get(1)?, parent_id: row.get(2)?,
                name: row.get(3)?, node_type: row.get(4)?, sort_order: row.get(5)?,
                created_at: row.get(6)?, updated_at: row.get(7)?,
            }),
        ).optional().map_err(|e| format!("get node failed: {e}"))
    }

    pub fn get_apiman_request(&self, node_id: i64) -> Result<Option<ApiManRequest>, String> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, node_id, method, url, headers, query_params, body_type, body_content,
                    auth_config, last_response_status, last_response_headers, last_response_body, updated_at
             FROM apiman_requests WHERE node_id = ?1",
            params![node_id],
            |row| Ok(ApiManRequest {
                id: row.get(0)?, node_id: row.get(1)?, method: row.get(2)?,
                url: row.get(3)?, headers: row.get(4)?, query_params: row.get(5)?,
                body_type: row.get(6)?, body_content: row.get(7)?,
                auth_config: row.get(8)?,
                last_response_status: row.get(9)?,
                last_response_headers: row.get(10)?, last_response_body: row.get(11)?,
                updated_at: row.get(12)?,
            }),
        ).optional().map_err(|e| format!("get request failed: {e}"))
    }

    pub fn update_apiman_request(&self, node_id: i64, input: ApiManRequestInput) -> Result<Option<ApiManRequest>, String> {
        let conn = self.connect()?;
        let affected = conn.execute(
            "UPDATE apiman_requests SET method = ?1, url = ?2, headers = ?3, query_params = ?4,
             body_type = ?5, body_content = ?6, auth_config = ?7, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE node_id = ?8",
            params![
                input.method.unwrap_or_else(|| "GET".to_string()),
                input.url.unwrap_or_default(),
                input.headers, input.query_params,
                input.body_type.unwrap_or_else(|| "none".to_string()),
                input.body_content, input.auth_config, node_id,
            ],
        ).map_err(|e| format!("update request failed: {e}"))?;
        if affected == 0 { return Ok(None); }
        self.get_apiman_request(node_id)
    }

    pub fn save_apiman_response(&self, node_id: i64, status: i64, headers: Option<String>, body: Option<String>, elapsed_ms: i64) -> Result<(), String> {
        let conn = self.connect()?;
        conn.execute(
            "UPDATE apiman_requests SET last_response_status = ?1, last_response_headers = ?2,
             last_response_body = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE node_id = ?4",
            params![status, headers, body, node_id],
        ).map_err(|e| format!("save response failed: {e}"))?;
        // Save to history
        conn.execute(
            "INSERT INTO apiman_response_history (node_id, status, headers, body, elapsed_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![node_id, status, headers, body, elapsed_ms],
        ).map_err(|e| format!("save response history failed: {e}"))?;
        Ok(())
    }

    pub fn list_apiman_response_history(&self, node_id: i64) -> Result<Vec<crate::apiman::ResponseHistory>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, node_id, status, headers, body, elapsed_ms, created_at
             FROM apiman_response_history WHERE node_id = ?1 ORDER BY id DESC LIMIT 20"
        ).map_err(|e| format!("prepare history query failed: {e}"))?;
        let rows = stmt.query_map(params![node_id], |row| {
            Ok(crate::apiman::ResponseHistory {
                id: row.get(0)?, node_id: row.get(1)?, status: row.get(2)?,
                headers: row.get(3)?, body: row.get(4)?,
                elapsed_ms: row.get::<_, Option<i64>>(5)?,
                created_at: row.get(6)?,
            })
        }).map_err(|e| format!("query history failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read history row failed: {e}"))?); }
        Ok(items)
    }

    pub fn delete_apiman_response_history(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn.execute("DELETE FROM apiman_response_history WHERE id = ?1", params![id])
            .map_err(|e| format!("delete response history failed: {e}"))?;
        Ok(affected > 0)
    }

    // ---- ApiMan Variables ----
    pub fn list_apiman_variables(&self, workspace_id: i64) -> Result<Vec<crate::apiman::ApiManVariable>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, key, value, enabled, created_at, updated_at
             FROM apiman_variables WHERE workspace_id = ?1 ORDER BY key"
        ).map_err(|e| format!("prepare variables query failed: {e}"))?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(crate::apiman::ApiManVariable {
                id: row.get(0)?, workspace_id: row.get(1)?, key: row.get(2)?,
                value: row.get(3)?, enabled: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?, updated_at: row.get(6)?,
            })
        }).map_err(|e| format!("query variables failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read variable row failed: {e}"))?); }
        Ok(items)
    }

    pub fn upsert_apiman_variable(&self, workspace_id: i64, input: crate::apiman::ApiManVariableInput) -> Result<crate::apiman::ApiManVariable, String> {
        if input.key.trim().is_empty() { return Err("variable key is required".to_string()); }
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO apiman_variables (workspace_id, key, value, enabled) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(workspace_id, key) DO UPDATE SET value = ?3, enabled = ?4, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
            params![workspace_id, input.key, input.value, if input.enabled.unwrap_or(true) { 1 } else { 0 }],
        ).map_err(|e| format!("upsert variable failed: {e}"))?;
        let id = conn.last_insert_rowid();
        let actual_id = if id == 0 {
            conn.query_row(
                "SELECT id FROM apiman_variables WHERE workspace_id = ?1 AND key = ?2",
                params![workspace_id, input.key], |row| row.get::<_, i64>(0),
            ).map_err(|e| format!("get variable id failed: {e}"))?
        } else { id };
        conn.query_row(
            "SELECT id, workspace_id, key, value, enabled, created_at, updated_at FROM apiman_variables WHERE id = ?1",
            params![actual_id], |row| {
                Ok(crate::apiman::ApiManVariable {
                    id: row.get(0)?, workspace_id: row.get(1)?, key: row.get(2)?,
                    value: row.get(3)?, enabled: row.get::<_, i64>(4)? != 0,
                    created_at: row.get(5)?, updated_at: row.get(6)?,
                })
            },
        ).map_err(|e| format!("get saved variable failed: {e}"))
    }

    pub fn delete_apiman_variable(&self, workspace_id: i64, key: &str) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn.execute(
            "DELETE FROM apiman_variables WHERE workspace_id = ?1 AND key = ?2",
            params![workspace_id, key],
        ).map_err(|e| format!("delete variable failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn list_apiman_requests(&self, workspace_id: i64) -> Result<Vec<ApiManRequest>, String> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT r.id, r.node_id, r.method, r.url, r.headers, r.query_params, r.body_type,
                    r.body_content, r.auth_config, r.last_response_status, r.last_response_headers,
                    r.last_response_body, r.updated_at
             FROM apiman_requests r
             JOIN apiman_nodes n ON r.node_id = n.id
             WHERE n.workspace_id = ?1"
        ).map_err(|e| format!("prepare requests query failed: {e}"))?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(ApiManRequest {
                id: row.get(0)?, node_id: row.get(1)?, method: row.get(2)?,
                url: row.get(3)?, headers: row.get(4)?, query_params: row.get(5)?,
                body_type: row.get(6)?, body_content: row.get(7)?,
                auth_config: row.get(8)?,
                last_response_status: row.get(9)?,
                last_response_headers: row.get(10)?, last_response_body: row.get(11)?,
                updated_at: row.get(12)?,
            })
        }).map_err(|e| format!("query requests failed: {e}"))?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| format!("read request row failed: {e}"))?); }
        Ok(items)
    }

    fn ensure_seeded(&self) -> Result<(), String> {
        let conn = self.connect()?;
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM juniper_devices WHERE id = ?1",
                params![DEFAULT_DEVICE_ID],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("check Juniper device seed failed: {e}"))?;
        if exists.is_some() {
            return Ok(());
        }

        let config = JuniperConfig::from_env();
        conn.execute(
            "INSERT INTO juniper_devices
             (id, name, host, port, username, password, connect_timeout_secs, strict_host_key_checking)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                DEFAULT_DEVICE_ID,
                "default",
                config.host,
                i64::from(config.port),
                config.username,
                config.password,
                config.connect_timeout_secs as i64,
                if config.strict_host_key_checking { 1 } else { 0 }
            ],
        )
        .map_err(|e| format!("seed Juniper device settings failed: {e}"))?;
        Ok(())
    }

    fn connect(&self) -> Result<Connection, String> {
        Connection::open(&self.path).map_err(|e| format!("open database failed: {e}"))
    }
}

fn validate_haproxy_update(update: &HaproxyLoadBalancerUpdate) -> Result<(), String> {
    if !matches!(update.lb_type.as_str(), "web" | "sql") {
        return Err("invalid HAProxy load balancer type".to_string());
    }
    if update.name.trim().is_empty() || update.name.len() > 64 {
        return Err("invalid HAProxy frontend name".to_string());
    }
    if update.bind_port == 0 {
        return Err("invalid HAProxy listen port".to_string());
    }
    if !matches!(
        update.balance_method.as_str(),
        "roundrobin" | "leastconn" | "source"
    ) {
        return Err("invalid HAProxy balance method".to_string());
    }
    if update.servers.is_empty() {
        return Err("at least one HAProxy backend server is required".to_string());
    }
    Ok(())
}

fn validate_device_update(update: &JuniperDeviceUpdate) -> Result<(), String> {
    if update.name.trim().is_empty() || update.name.len() > 64 {
        return Err("invalid device name".to_string());
    }
    if update.host.trim().is_empty() || update.host.len() > 255 {
        return Err("invalid Juniper host".to_string());
    }
    if update.port == 0 {
        return Err("invalid Juniper SSH port".to_string());
    }
    if update.username.trim().is_empty() || update.username.len() > 64 {
        return Err("invalid Juniper username".to_string());
    }
    if update.connect_timeout_secs == 0 || update.connect_timeout_secs > 120 {
        return Err("invalid Juniper connection timeout".to_string());
    }
    Ok(())
}
