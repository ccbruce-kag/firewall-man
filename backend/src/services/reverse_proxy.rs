#[path = "reverse-proxy/src/lib.rs"]
#[allow(dead_code)]
mod hyper_reverse_proxy;

use std::convert::Infallible;
use std::net::SocketAddr;

use hyper::server::conn::AddrStream;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, Request, Response, Server, StatusCode};
use tracing::{error, info};

const DEFAULT_ADDRESS: &str = "127.0.0.1:18080";

pub fn start_background_from_env() {
    if std::env::var("KYKLOS_REVERSE_PROXY_DISABLE")
        .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
    {
        info!("reverse proxy service disabled by KYKLOS_REVERSE_PROXY_DISABLE");
        return;
    }

    let address = std::env::var("KYKLOS_REVERSE_PROXY_ADDRESS")
        .unwrap_or_else(|_| DEFAULT_ADDRESS.to_string());
    let target = std::env::var("KYKLOS_REVERSE_PROXY_TARGET").ok();

    tokio::spawn(async move {
        let addr: SocketAddr = match address.parse() {
            Ok(addr) => addr,
            Err(err) => {
                error!("invalid reverse proxy listen address {}: {}", address, err);
                return;
            }
        };

        info!(
            "starting reverse proxy service on {}{}",
            addr,
            target
                .as_ref()
                .map(|target| format!(" -> {}", target))
                .unwrap_or_else(|| " without upstream target".to_string())
        );

        let client = Client::new();
        let make_svc = make_service_fn(move |conn: &AddrStream| {
            let remote_addr = conn.remote_addr().ip();
            let client = client.clone();
            let target = target.clone();
            async move {
                Ok::<_, Infallible>(service_fn(move |req| {
                    handle(remote_addr, client.clone(), target.clone(), req)
                }))
            }
        });

        if let Err(err) = Server::bind(&addr).serve(make_svc).await {
            error!("reverse proxy service stopped: {}", err);
        }
    });
}

async fn handle(
    client_ip: std::net::IpAddr,
    client: Client<hyper::client::HttpConnector>,
    target: Option<String>,
    req: Request<Body>,
) -> Result<Response<Body>, Infallible> {
    let Some(target) = target else {
        return Ok(Response::new(Body::from(
            "kyklos reverse proxy is running; set KYKLOS_REVERSE_PROXY_TARGET to proxy requests\n",
        )));
    };

    match hyper_reverse_proxy::call(client_ip, &target, req, &client).await {
        Ok(response) => Ok(response),
        Err(err) => {
            error!("reverse proxy request failed: {:?}", err);
            Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::from("reverse proxy upstream error\n"))
                .unwrap())
        }
    }
}
