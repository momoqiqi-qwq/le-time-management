// 局域网联动服务：Win 作为控制端，手机浏览器/小程序通过本服务查看与操作
// 安全：所有 /m、/api、/qr.svg 请求都需要配对令牌（token）
//
// 本服务对数据**只读**：/api/state 与 /api/info 供手机端「局域网直连」拉快照用，
// 唯一的写入口是 /api/command 那两条动作（勾选任务 / 快速添加），且一律经前端
// 统一数据层落盘。想隔着一根网线覆盖整台设备的数据，这里没有对应的路由 ——
// 这是刻意的：手机 → 电脑的推送一旦开出来，同网段里任何拿到配对码的人都能抹掉电脑数据。
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const MOBILE_HTML: &str = include_str!("mobile.html");

pub struct LanInstance {
    pub quit: Arc<AtomicBool>,
    pub url: String,
    pub port: u16,
    pub token: String,
}

fn lan_ip() -> String {
    std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("223.5.5.5:80")?; // 只为取出口 IP，不发包
            Ok(s.local_addr()?)
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

fn qr_svg(content: &str) -> String {
    use qrcode::render::svg;
    use qrcode::QrCode;
    let code = QrCode::with_error_correction_level(content.as_bytes(), qrcode::EcLevel::M)
        .map_err(|e| e.to_string())
        .expect("qr generate");
    code.render()
        .min_dimensions(180, 180)
        .dark_color(svg::Color("#143844"))
        .light_color(svg::Color("#ffffff"))
        .build()
}

fn json_headers() -> Vec<tiny_http::Header> {
    vec![
        tiny_http::Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap(),
        tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
    ]
}

fn html_headers() -> Vec<tiny_http::Header> {
    vec![tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap()]
}

fn svg_headers() -> Vec<tiny_http::Header> {
    vec![
        tiny_http::Header::from_bytes("Content-Type", "image/svg+xml").unwrap(),
        tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
    ]
}

pub fn spawn_server(
    app: AppHandle,
    port: u16,
    token: String,
    data_path: PathBuf,
    quit: Arc<AtomicBool>,
) -> Result<String, String> {
    let addr = format!("0.0.0.0:{port}");
    let server =
        tiny_http::Server::http(&addr).map_err(|e| format!("端口 {port} 启动失败: {e}"))?;
    let base = format!("http://{}:{port}", lan_ip());
    let url = format!("{base}/m?token={token}");

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            if quit.load(Ordering::Relaxed) {
                break;
            }
            let url = request.url().to_string();
            let path = url.split('?').next().unwrap_or("").to_string();
            let token_in = query_param(&url, "token").unwrap_or_default();
            let mut body = String::new();
            if request.method() == &tiny_http::Method::Post {
                let _ = request.as_reader().read_to_string(&mut body);
            }

            if token_in != token {
                let resp = tiny_http::Response::from_string("{\"error\":\"token 无效\"}")
                    .with_status_code(403)
                    .with_header(
                        tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap(),
                    );
                let _ = request.respond(resp);
                continue;
            }

            let (status, headers, payload) = match (request.method(), path.as_str()) {
                (_, "/quit") => (200, json_headers(), "{\"ok\":true}".to_string()),
                (&tiny_http::Method::Get, "/m") => (200, html_headers(), MOBILE_HTML.to_string()),
                (&tiny_http::Method::Get, "/qr.svg") => (
                    200,
                    svg_headers(),
                    qr_svg(&format!("{base}/m?token={token_in}")),
                ),
                (&tiny_http::Method::Get, "/api/state") => {
                    let data = std::fs::read_to_string(&data_path)
                        .unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"));
                    (200, json_headers(), data)
                }
                // 拉之前的「电脑上是什么货」：条数 + 落盘时间。只读，不引入任何写入口。
                (&tiny_http::Method::Get, "/api/info") => {
                    let saved_at = std::fs::metadata(&data_path).ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());
                    let parsed: Option<serde_json::Value> = std::fs::read_to_string(&data_path).ok()
                        .and_then(|s| serde_json::from_str(&s).ok());
                    let count = |key: &str| parsed.as_ref()
                        .and_then(|v| v.get(key))
                        .and_then(|v| v.as_array())
                        .map(|a| a.len())
                        .unwrap_or(0);
                    let body = serde_json::json!({
                        "ok": true,
                        "appVersion": env!("CARGO_PKG_VERSION"),
                        "savedAtEpoch": saved_at,
                        "dataOk": parsed.is_some(),
                        "tasks": count("tasks"),
                        "blocks": count("blocks"),
                    });
                    (200, json_headers(), body.to_string())
                }
                (&tiny_http::Method::Post, "/api/command") => {
                    // 转发给前端，由前端经统一的数据层落盘
                    if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(&body) {
                        let _ = app.emit("lan-command", cmd);
                    }
                    (200, json_headers(), "{\"ok\":true}".to_string())
                }
                _ => (404, json_headers(), "{\"error\":\"not found\"}".to_string()),
            };
            let mut resp = tiny_http::Response::from_string(payload).with_status_code(status);
            for h in headers {
                resp = resp.with_header(h);
            }
            let _ = request.respond(resp);
        }
    });

    Ok(url)
}
