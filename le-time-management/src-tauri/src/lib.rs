mod native_schedule;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt as _;

mod lan;

/// 应用数据目录（Windows: %APPDATA%，Linux: ~/.local/share，Android: 应用内部存储）
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir)
}

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("plugins");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建插件目录: {e}"))?;
    Ok(dir)
}

const SCHOOL_IMPORT_BOOTSTRAP: &str = r#"
(function () {
  if (window.__leSchoolImportReady) return;
  window.__leSchoolImportReady = true;
  const callbacks = new Map(); let callbackCounter = 0; let bridgeQueue = Promise.resolve();
  const encode = (text) => {
    const bytes = new TextEncoder().encode(text); let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
  const callback = (id, ok, value) => { const item = callbacks.get(id); if (!item) return; callbacks.delete(id); ok ? item.resolve(value) : item.reject(value); };
  window._shiguangNativeCallback = callback;
  const setStatus = (text) => { const node = document.querySelector('#le-school-import-toolbar')?.shadowRoot?.querySelector('[data-status]'); if (node) node.textContent = text; };
  const bridge = async (action, payload, callbackId) => {
    try {
      if (action === 'showToast') { setStatus(payload.message || ''); return true; }
      if (action === 'showAlert') return window.confirm([payload.titleText, payload.contentText].filter(Boolean).join('\n\n'));
      if (action === 'showPrompt') return window.prompt([payload.titleText, payload.tipText].filter(Boolean).join('\n'), payload.defaultText || '');
      if (action === 'showSingleSelection') {
        const items = JSON.parse(payload.itemsJsonString || '[]'); const answer = window.prompt(payload.titleText + '\n' + items.map((x, i) => `${i + 1}. ${x}`).join('\n'), String((payload.defaultSelectedIndex || 0) + 1));
        const index = Number(answer) - 1; return Number.isInteger(index) && index >= 0 && index < items.length ? index : null;
      }
      const raw = JSON.stringify({ action, callbackId: callbackId || null, payload: JSON.stringify(payload || {}) });
      bridgeQueue = bridgeQueue.then(() => new Promise(resolve => {
        location.href = 'letime-import://bridge/' + encode(raw);
        setTimeout(resolve, 100);
      }));
      await bridgeQueue;
      return true;
    } catch (error) { throw String(error && error.message || error); }
  };
  const promises = {};
  for (const action of ['showAlert','showPrompt','showSingleSelection','saveImportedCourses','saveCourseConfig','savePresetTimeSlots']) {
    promises[action] = (...args) => new Promise((resolve, reject) => {
      const id = 'cb_' + (++callbackCounter) + '_' + Date.now(); callbacks.set(id, { resolve, reject });
      const payload = action === 'showAlert' ? {titleText:args[0]||'',contentText:args[1]||'',confirmText:args[2]||null}
        : action === 'showPrompt' ? {titleText:args[0]||'',tipText:args[1]||'',defaultText:args[2]||'',validatorJsFunction:args[3]||''}
        : action === 'showSingleSelection' ? {titleText:args[0]||'',itemsJsonString:typeof args[1]==='string'?args[1]:JSON.stringify(args[1]||[]),defaultSelectedIndex:args[2]??-1}
        : action === 'saveImportedCourses' ? {coursesJsonString:args[0]||'[]'}
        : action === 'saveCourseConfig' ? {configJsonString:args[0]||'{}'} : {timeSlotsJsonString:args[0]||'[]'};
      Promise.resolve(bridge(action, payload, id)).then(value => callback(id, true, value), error => callback(id, false, error));
    });
  }
  window.shiguangBridgePromise = window.AndroidBridgePromise = promises;
  window.shiguangBridge = window.AndroidBridge = {
    showToast: message => bridge('showToast', {message}),
    notifyTaskCompletion: () => bridge('notifyTaskCompletion', {})
  };
  const mount = () => {
    if (document.querySelector('#le-school-import-toolbar')) return;
    const host = document.createElement('div'); host.id = 'le-school-import-toolbar'; host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
    const shadow = host.attachShadow({mode:'open'}); shadow.innerHTML = `<style>*{box-sizing:border-box}div{font:13px system-ui;background:#162b35;color:#fff;border-radius:14px;padding:10px;box-shadow:0 8px 28px #0006;display:flex;align-items:center;gap:8px}button{border:0;border-radius:9px;padding:9px 13px;cursor:pointer;background:#fff;color:#17333e;font-weight:650}button.primary{background:#61c1d0;color:#092830}span{max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style><div><span data-status>登录后进入课表页面</span><button data-back>返回</button><button class="primary" data-import>导入当前课表</button></div>`;
    shadow.querySelector('[data-back]').onclick = () => history.back();
    shadow.querySelector('[data-import]').onclick = () => { setStatus('正在执行学校适配脚本…'); location.href = 'letime-import://execute'; };
    document.documentElement.appendChild(host);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount, {once:true}) : mount();
})();
"#;

fn school_import_bridge(app: &AppHandle, encoded: &str) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|e| format!("教务回传解码失败: {e}"))?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("教务回传数据超过 2 MB".into());
    }
    let message = String::from_utf8(bytes).map_err(|e| format!("教务回传不是 UTF-8: {e}"))?;
    let value: Value =
        serde_json::from_str(&message).map_err(|e| format!("教务回传 JSON 无效: {e}"))?;
    let allowed = [
        "saveImportedCourses",
        "saveCourseConfig",
        "savePresetTimeSlots",
        "notifyTaskCompletion",
    ];
    let action = value.get("action").and_then(Value::as_str).unwrap_or("");
    if !allowed.contains(&action) {
        return Err("教务回传操作不受支持".into());
    }
    app.emit_to("main", "school-import-message", message)
        .map_err(|e| format!("发送教务回传失败: {e}"))
}

#[tauri::command]
async fn school_import_open(
    app: AppHandle,
    url: String,
    adapter_script: String,
    title: String,
) -> Result<(), String> {
    if adapter_script.len() > 2 * 1024 * 1024 {
        return Err("学校适配脚本超过 2 MB".into());
    }
    let parsed: Url = url.parse().map_err(|e| format!("教务网址无效: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https" | "about") {
        return Err("教务网址仅支持 http/https".into());
    }
    if let Some(existing) = app.get_webview_window("school-import") {
        let _ = existing.close();
    }
    let app_for_navigation = app.clone();
    let script_for_navigation = adapter_script.clone();
    WebviewWindowBuilder::new(&app, "school-import", WebviewUrl::External(parsed))
        .title(format!(
            "时光课程表 · {}",
            title.chars().take(60).collect::<String>()
        ))
        .inner_size(1100.0, 780.0)
        .center()
        .initialization_script(SCHOOL_IMPORT_BOOTSTRAP)
        .on_navigation(move |target| {
            if target.scheme() != "letime-import" {
                return true;
            }
            match target.host_str().unwrap_or("") {
                "execute" => {
                    if let Some(window) = app_for_navigation.get_webview_window("school-import") {
                        let _ = window.eval(script_for_navigation.clone());
                    }
                }
                "bridge" => {
                    let encoded = target.path().trim_start_matches('/');
                    let _ = school_import_bridge(&app_for_navigation, encoded);
                }
                _ => {}
            }
            false
        })
        .build()
        .map_err(|e| format!("打开教务登录窗口失败: {e}"))?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AiSecretConfig {
    #[serde(rename = "baseUrl")]
    base_url: String,
    api_key: String,
    model: String,
}

#[derive(serde::Serialize)]
struct AiVaultStatus {
    configured: bool,
    #[serde(rename = "baseUrl")]
    base_url: String,
    model: String,
    #[serde(rename = "keyMasked")]
    key_masked: String,
}

#[derive(serde::Deserialize, serde::Serialize, Clone)]
struct AiMessage {
    role: String,
    content: String,
}

fn ai_vault_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(".ai-vault.key"))
}

fn ai_vault_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("ai-vault.bin"))
}

fn restrict_secret_file(path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(path, perms);
        }
    }
}

fn ai_vault_key(app: &AppHandle) -> Result<Vec<u8>, String> {
    use ring::rand::{SecureRandom, SystemRandom};
    let path = ai_vault_key_path(app)?;
    if path.exists() {
        let key = fs::read(&path).map_err(|e| format!("读取 AI 加密密钥失败: {e}"))?;
        if key.len() != 32 {
            return Err("AI 加密密钥长度异常".into());
        }
        return Ok(key);
    }
    let mut key = vec![0u8; 32];
    SystemRandom::new()
        .fill(&mut key)
        .map_err(|_| "生成 AI 加密密钥失败".to_string())?;
    fs::write(&path, &key).map_err(|e| format!("写入 AI 加密密钥失败: {e}"))?;
    restrict_secret_file(&path);
    Ok(key)
}

fn ai_encrypt(app: &AppHandle, plain: &[u8]) -> Result<Vec<u8>, String> {
    aead_encrypt(&ai_vault_key(app)?, plain)
}

fn ai_decrypt(app: &AppHandle, raw: &[u8]) -> Result<Vec<u8>, String> {
    aead_decrypt(&ai_vault_key(app)?, raw)
}

/// AES-256-GCM。密文格式：版本号(1) + nonce(12) + 密文+tag。
/// AI 凭据与插件密钥库共用同一个本机密钥文件（.ai-vault.key）。
fn aead_encrypt(key: &[u8], plain: &[u8]) -> Result<Vec<u8>, String> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    use ring::rand::{SecureRandom, SystemRandom};
    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| "初始化加密器失败".to_string())?;
    let less_safe = LessSafeKey::new(unbound);
    let mut nonce_bytes = [0u8; 12];
    SystemRandom::new()
        .fill(&mut nonce_bytes)
        .map_err(|_| "生成加密随机数失败".to_string())?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut in_out = plain.to_vec();
    less_safe
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| "凭据加密失败".to_string())?;
    let mut out = Vec::with_capacity(1 + nonce_bytes.len() + in_out.len());
    out.push(1);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&in_out);
    Ok(out)
}

fn aead_decrypt(key: &[u8], raw: &[u8]) -> Result<Vec<u8>, String> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    if raw.len() < 1 + 12 + 16 || raw[0] != 1 {
        return Err("凭据文件格式不受支持".into());
    }
    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| "初始化解密器失败".to_string())?;
    let less_safe = LessSafeKey::new(unbound);
    let mut nonce_bytes = [0u8; 12];
    nonce_bytes.copy_from_slice(&raw[1..13]);
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut in_out = raw[13..].to_vec();
    let plain = less_safe
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| "凭据解密失败，可能已损坏或密钥已变化".to_string())?;
    Ok(plain.to_vec())
}

fn load_ai_secret(app: &AppHandle) -> Result<AiSecretConfig, String> {
    let path = ai_vault_data_path(app)?;
    if !path.exists() {
        return Err("尚未配置 AI Base URL / API Key".into());
    }
    let raw = fs::read(&path).map_err(|e| format!("读取 AI 凭据失败: {e}"))?;
    let plain = ai_decrypt(app, &raw)?;
    serde_json::from_slice(&plain).map_err(|e| format!("AI 凭据解析失败: {e}"))
}

fn mask_api_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".into();
    }
    let head: String = chars.iter().take(3).copied().collect();
    let tail: String = chars.iter().skip(chars.len() - 4).copied().collect();
    format!("{head}••••••{tail}")
}

fn validate_ai_base_url(base_url: &str) -> Result<(), String> {
    let base = base_url.trim();
    if base.is_empty() {
        return Err("Base URL 不能为空".into());
    }
    if !base.starts_with("https://") && !base.starts_with("http://") {
        return Err("Base URL 仅支持 http/https".into());
    }
    Ok(())
}

fn ai_chat_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    }
}

#[tauri::command]
fn ai_vault_save(
    app: AppHandle,
    base_url: String,
    api_key: String,
    model: String,
) -> Result<AiVaultStatus, String> {
    validate_ai_base_url(&base_url)?;
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("模型名称不能为空".into());
    }
    let existing = load_ai_secret(&app).ok();
    let key = if api_key.trim().is_empty() {
        existing
            .as_ref()
            .map(|x| x.api_key.clone())
            .ok_or("首次保存时必须填写 API Key")?
    } else {
        api_key.trim().to_string()
    };
    let secret = AiSecretConfig {
        base_url: base_url.trim().trim_end_matches('/').to_string(),
        api_key: key,
        model,
    };
    let plain = serde_json::to_vec(&secret).map_err(|e| format!("AI 凭据序列化失败: {e}"))?;
    let encrypted = ai_encrypt(&app, &plain)?;
    let path = ai_vault_data_path(&app)?;
    let tmp = path.with_extension("bin.tmp");
    fs::write(&tmp, encrypted).map_err(|e| format!("写入 AI 凭据失败: {e}"))?;
    restrict_secret_file(&tmp);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("替换旧 AI 凭据失败: {e}"))?;
    }
    fs::rename(&tmp, &path).map_err(|e| format!("保存 AI 凭据失败: {e}"))?;
    restrict_secret_file(&path);
    Ok(AiVaultStatus {
        configured: true,
        base_url: secret.base_url,
        model: secret.model,
        key_masked: mask_api_key(&secret.api_key),
    })
}

#[tauri::command]
fn ai_vault_status(app: AppHandle) -> Result<AiVaultStatus, String> {
    match load_ai_secret(&app) {
        Ok(secret) => Ok(AiVaultStatus {
            configured: true,
            base_url: secret.base_url,
            model: secret.model,
            key_masked: mask_api_key(&secret.api_key),
        }),
        Err(_) => Ok(AiVaultStatus {
            configured: false,
            base_url: String::new(),
            model: String::new(),
            key_masked: String::new(),
        }),
    }
}

#[tauri::command]
fn ai_vault_clear(app: AppHandle) -> Result<(), String> {
    let data_path = ai_vault_data_path(&app)?;
    if data_path.exists() {
        fs::remove_file(data_path).map_err(|e| format!("清除 AI 凭据失败: {e}"))?;
    }
    Ok(())
}

/* ── 插件密钥库：与 AI 凭据同机制的加密 KV，供插件保存密码、会话票据等敏感数据 ── */

type PluginVault = HashMap<String, HashMap<String, String>>;

fn plugin_vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("plugin-vault.bin"))
}

fn load_plugin_vault(app: &AppHandle) -> Result<PluginVault, String> {
    let path = plugin_vault_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read(&path).map_err(|e| format!("读取插件密钥库失败: {e}"))?;
    if raw.is_empty() {
        return Ok(HashMap::new());
    }
    let plain = ai_decrypt(app, &raw)?;
    serde_json::from_slice(&plain).map_err(|e| format!("插件密钥库解析失败: {e}"))
}

fn save_plugin_vault(app: &AppHandle, vault: &PluginVault) -> Result<(), String> {
    let plain = serde_json::to_vec(vault).map_err(|e| format!("插件密钥库序列化失败: {e}"))?;
    let encrypted = ai_encrypt(app, &plain)?;
    let path = plugin_vault_path(app)?;
    let tmp = path.with_extension("bin.tmp");
    fs::write(&tmp, encrypted).map_err(|e| format!("写入插件密钥库失败: {e}"))?;
    restrict_secret_file(&tmp);
    fs::rename(&tmp, &path).map_err(|e| format!("替换插件密钥库失败: {e}"))?;
    restrict_secret_file(&path);
    Ok(())
}

#[tauri::command]
fn plugin_vault_set(
    app: AppHandle,
    plugin_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    if !valid_plugin_id(&plugin_id) {
        return Err(format!("插件 ID 不合法: {plugin_id}"));
    }
    if key.trim().is_empty() {
        return Err("密钥库名不能为空".into());
    }
    let mut vault = load_plugin_vault(&app)?;
    vault.entry(plugin_id).or_default().insert(key, value);
    save_plugin_vault(&app, &vault)
}

#[tauri::command]
fn plugin_vault_get(
    app: AppHandle,
    plugin_id: String,
    key: String,
) -> Result<Option<String>, String> {
    if !valid_plugin_id(&plugin_id) {
        return Err(format!("插件 ID 不合法: {plugin_id}"));
    }
    Ok(load_plugin_vault(&app)?
        .get(&plugin_id)
        .and_then(|m| m.get(&key))
        .cloned())
}

#[tauri::command]
fn plugin_vault_del(app: AppHandle, plugin_id: String, key: String) -> Result<(), String> {
    if !valid_plugin_id(&plugin_id) {
        return Err(format!("插件 ID 不合法: {plugin_id}"));
    }
    let mut vault = load_plugin_vault(&app)?;
    if let Some(entry) = vault.get_mut(&plugin_id) {
        entry.remove(&key);
        if entry.is_empty() {
            vault.remove(&plugin_id);
        }
    }
    if vault.is_empty() {
        let path = plugin_vault_path(&app)?;
        if path.exists() {
            fs::remove_file(path).map_err(|e| format!("清除插件密钥库失败: {e}"))?;
        }
        return Ok(());
    }
    save_plugin_vault(&app, &vault)
}

#[tauri::command]
async fn ai_chat(
    app: AppHandle,
    messages: Vec<AiMessage>,
    temperature: Option<f64>,
) -> Result<String, String> {
    let secret = load_ai_secret(&app)?;
    validate_ai_base_url(&secret.base_url)?;
    if messages.is_empty() || messages.len() > 24 {
        return Err("AI 消息数量必须在 1～24 条之间".into());
    }
    let total_chars: usize = messages.iter().map(|m| m.content.chars().count()).sum();
    if total_chars > 60_000 {
        return Err("AI 上下文过长，请减少内容后重试".into());
    }
    if messages
        .iter()
        .any(|m| !matches!(m.role.as_str(), "system" | "user" | "assistant"))
    {
        return Err("AI 消息角色不合法".into());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(55))
        .build()
        .map_err(|e| format!("AI HTTP 客户端初始化失败: {e}"))?;
    let endpoint = ai_chat_endpoint(&secret.base_url);
    let body = json!({
        "model": secret.model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.2).clamp(0.0, 2.0),
    });
    let resp = client
        .post(endpoint)
        .bearer_auth(&secret.api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取 AI 响应失败: {e}"))?;
    if !status.is_success() {
        let brief: String = text.chars().take(900).collect();
        return Err(format!("AI 接口返回 {}：{}", status.as_u16(), brief));
    }
    let value: Value =
        serde_json::from_str(&text).map_err(|e| format!("AI 响应不是有效 JSON: {e}"))?;
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .or_else(|| value.pointer("/output_text").and_then(|v| v.as_str()))
        .ok_or_else(|| "AI 响应缺少 choices[0].message.content".to_string())?;
    Ok(content.to_string())
}

/// 首次启动的示例数据，让应用一打开就有内容可玩
fn seed_data() -> Value {
    let today = js_datetoday();
    json!({
        "version": 1,
        "tasks": [
            { "id": "t1", "title": "回复导师：开题修改稿", "note": "", "quad": 1, "done": true,
              "estMin": 15, "tags": ["论文"], "project": "毕业设计", "due": today, "createdAt": now_ms() },
            { "id": "t2", "title": "修复登录页线上 bug", "note": "疑似 token 过期逻辑", "quad": 1, "done": false,
              "estMin": 60, "tags": ["线上"], "project": "毕业设计平台", "due": today, "createdAt": now_ms() },
            { "id": "t3", "title": "答辩 PPT · 第 3 章图表重绘", "note": "", "quad": 1, "done": false,
              "estMin": 120, "tags": ["答辩"], "project": "毕业设计", "due": today, "createdAt": now_ms() },
            { "id": "t4", "title": "精读《深度工作》第 4 章", "note": "", "quad": 2, "done": false,
              "estMin": 45, "tags": ["读书"], "project": "读书计划", "due": null, "createdAt": now_ms() },
            { "id": "t5", "title": "每周健身 3 次 · 第 2 次", "note": "背 + 二头", "quad": 2, "done": false,
              "estMin": 40, "tags": ["运动"], "project": "", "due": null, "createdAt": now_ms() },
            { "id": "t6", "title": "回飞书群消息 12 条", "note": "", "quad": 3, "done": false,
              "estMin": 10, "tags": [], "project": "", "due": today, "createdAt": now_ms() },
            { "id": "t7", "title": "取快递 + 缴水电费", "note": "", "quad": 3, "done": false,
              "estMin": 20, "tags": ["生活"], "project": "", "due": today, "createdAt": now_ms() },
            { "id": "t8", "title": "整理相册 · 6 月旅行", "note": "", "quad": 4, "done": false,
              "estMin": 30, "tags": [], "project": "", "due": null, "createdAt": now_ms() }
        ],
        "blocks": [
            { "id": "b1", "date": today, "start": "09:00", "durMin": 120, "title": "论文写作 · 第 3 章",
              "taskId": null, "cat": "work" },
            { "id": "b2", "date": today, "start": "11:00", "durMin": 45, "title": "整理参考文献",
              "taskId": null, "cat": "work" },
            { "id": "b3", "date": today, "start": "11:45", "durMin": 75, "title": "午餐 + 散步",
              "taskId": null, "cat": "life" }
        ],
        "settings": { "lastView": "quadrant", "lastDate": today },
        "plugins": {}
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 本地日期 YYYY-MM-DD（不依赖 chrono，用天总数换算）
fn js_datetoday() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = (secs + 8 * 3600) / 86400; // 按东八区
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Value, String> {
    let path = data_dir(&app)?.join("data.json");
    if !path.exists() {
        let seed = seed_data();
        fs::write(&path, serde_json::to_vec_pretty(&seed).unwrap())
            .map_err(|e| format!("写入初始数据失败: {e}"))?;
        return Ok(seed);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取数据失败: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("数据文件损坏: {e}"))
}

#[tauri::command]
fn save_data(app: AppHandle, data: Value) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let path = dir.join("data.json");
    let tmp = dir.join("data.json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&data).unwrap())
        .map_err(|e| format!("写入临时文件失败: {e}"))?;
    // 原子替换，避免写一半崩溃丢数据
    fs::rename(&tmp, &path).map_err(|e| format!("替换数据文件失败: {e}"))?;
    Ok(())
}

#[derive(serde::Serialize)]
struct PluginInfo {
    id: String,
    dir: String,
}

/// 枚举用户插件目录：{data_dir}/plugins/<id>/manifest.json
#[tauri::command]
fn list_plugins(app: AppHandle) -> Result<Vec<PluginInfo>, String> {
    let dir = plugins_dir(&app)?;
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取插件目录失败: {e}"))?;
    for entry in entries.flatten() {
        let pdir = entry.path();
        if pdir.is_dir() {
            if pdir.join("manifest.json").exists() {
                if let Some(name) = pdir.file_name().and_then(|n| n.to_str()) {
                    out.push(PluginInfo {
                        id: name.to_string(),
                        dir: pdir.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    Ok(out)
}

/// 读取插件文件内容（仅允许插件目录内的文件，防目录穿越）
#[tauri::command]
fn read_plugin_file(app: AppHandle, rel_path: String) -> Result<String, String> {
    let root = plugins_dir(&app)?;
    let target = root.join(&rel_path);
    let canon_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canon_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => return Err(format!("插件文件不存在: {rel_path}")),
    };
    if !canon_target.starts_with(&canon_root) {
        return Err("禁止访问插件目录之外的文件".into());
    }
    fs::read_to_string(&canon_target).map_err(|e| format!("读取失败: {e}"))
}

/// 删除用户插件目录（仅允许 data_dir/plugins/<id> 一级目录，内置插件不可删除）
#[tauri::command]
fn delete_plugin(app: AppHandle, id: String) -> Result<(), String> {
    if id.contains('/') || id.contains('\\') || id == "." || id == ".." || id.trim().is_empty() {
        return Err("插件 ID 不合法".into());
    }
    let root = plugins_dir(&app)?;
    let target = root.join(&id);
    let canon_root = root
        .canonicalize()
        .map_err(|e| format!("插件目录异常: {e}"))?;
    let canon_target = target
        .canonicalize()
        .map_err(|_| format!("用户插件不存在: {id}"))?;
    if !canon_target.starts_with(&canon_root) || canon_target == canon_root {
        return Err("禁止删除插件目录之外的文件".into());
    }
    if !canon_target.is_dir() {
        return Err("目标不是插件目录".into());
    }
    if !canon_target.join("manifest.json").exists() {
        return Err("目标目录缺少 manifest.json，拒绝删除".into());
    }
    fs::remove_dir_all(&canon_target).map_err(|e| format!("删除插件失败: {e}"))
}

fn valid_plugin_id(id: &str) -> bool {
    !id.trim().is_empty()
        && id != "."
        && id != ".."
        && !id.contains('/')
        && !id.contains('\\')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// 从 zip 导入一个或多个用户插件。支持 `<id>/manifest.json` 和 zip 根目录直接放 manifest.json 两种格式。
#[tauri::command]
fn import_plugin_zip(app: AppHandle, bytes: Vec<u8>) -> Result<Vec<String>, String> {
    use std::io::{Cursor, Read};
    let root = plugins_dir(&app)?;
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("ZIP 无法打开: {e}"))?;

    // 先定位 manifest，确定 zip 中的源前缀和最终插件 id。
    let mut plugins: Vec<(String, String)> = Vec::new(); // (source prefix, plugin id)
    for i in 0..archive.len() {
        let mut f = archive
            .by_index(i)
            .map_err(|e| format!("读取 ZIP 失败: {e}"))?;
        let Some(path) = f.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        if path.file_name().and_then(|x| x.to_str()) != Some("manifest.json") {
            continue;
        }
        let mut raw = String::new();
        f.read_to_string(&mut raw)
            .map_err(|e| format!("读取 manifest.json 失败: {e}"))?;
        let man: Value =
            serde_json::from_str(&raw).map_err(|e| format!("manifest.json 格式错误: {e}"))?;
        let id = man
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if !valid_plugin_id(&id) {
            return Err(format!("插件 ID 不合法: {id}"));
        }
        let prefix = path
            .parent()
            .map(|x| x.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        plugins.push((prefix, id));
    }
    if plugins.is_empty() {
        return Err("ZIP 中未找到 manifest.json".into());
    }
    plugins.sort();
    plugins.dedup();

    let mut imported = Vec::new();
    for (prefix, id) in &plugins {
        let dest = root.join(id);
        if dest.exists() {
            fs::remove_dir_all(&dest).map_err(|e| format!("覆盖旧插件失败: {e}"))?;
        }
        fs::create_dir_all(&dest).map_err(|e| format!("创建插件目录失败: {e}"))?;

        for i in 0..archive.len() {
            let mut f = archive
                .by_index(i)
                .map_err(|e| format!("读取 ZIP 失败: {e}"))?;
            let Some(path) = f.enclosed_name().map(|p| p.to_path_buf()) else {
                continue;
            };
            let norm = path.to_string_lossy().replace('\\', "/");
            let rel = if prefix.is_empty() {
                // 根目录插件：保留 assets/data 等子目录。
                norm.clone()
            } else {
                let pre = format!("{prefix}/");
                if !norm.starts_with(&pre) {
                    continue;
                }
                norm[pre.len()..].to_string()
            };
            if rel.is_empty() {
                continue;
            }
            let out = dest.join(&rel);
            if f.is_dir() {
                fs::create_dir_all(&out).map_err(|e| format!("创建目录失败: {e}"))?;
            } else {
                if let Some(parent) = out.parent() {
                    fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
                }
                let mut data = Vec::new();
                f.read_to_end(&mut data)
                    .map_err(|e| format!("解压插件失败: {e}"))?;
                fs::write(&out, data).map_err(|e| format!("写入插件文件失败: {e}"))?;
            }
        }
        if !dest.join("manifest.json").exists() {
            return Err(format!("插件 {id} 导入后缺少 manifest.json"));
        }
        imported.push(id.clone());
    }
    Ok(imported)
}

/// 将所选用户插件打包为 zip，返回 base64，前端负责保存下载。
#[tauri::command]
fn export_plugins_zip(app: AppHandle, ids: Vec<String>) -> Result<String, String> {
    use base64::Engine as _;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    if ids.is_empty() {
        return Err("请先选择要导出的用户插件".into());
    }
    let root = plugins_dir(&app)?;
    let mut cur = Cursor::new(Vec::<u8>::new());
    {
        let mut writer = zip::ZipWriter::new(&mut cur);
        let opt = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for id in ids {
            if !valid_plugin_id(&id) {
                return Err(format!("插件 ID 不合法: {id}"));
            }
            let dir = root.join(&id);
            if !dir.join("manifest.json").exists() {
                return Err(format!("用户插件不存在: {id}"));
            }
            let mut stack = vec![dir.clone()];
            while let Some(path) = stack.pop() {
                for entry in fs::read_dir(&path).map_err(|e| format!("读取插件失败: {e}"))? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let p = entry.path();
                    if p.is_dir() {
                        stack.push(p);
                        continue;
                    }
                    let rel = p
                        .strip_prefix(&dir)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/");
                    writer
                        .start_file(format!("{id}/{rel}"), opt)
                        .map_err(|e| format!("创建 ZIP 失败: {e}"))?;
                    let data = fs::read(&p).map_err(|e| format!("读取插件文件失败: {e}"))?;
                    writer
                        .write_all(&data)
                        .map_err(|e| format!("写入 ZIP 失败: {e}"))?;
                }
            }
        }
        writer.finish().map_err(|e| format!("完成 ZIP 失败: {e}"))?;
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(cur.into_inner()))
}

#[derive(serde::Serialize)]
struct AppInfo {
    version: String,
    os: String,
    arch: String,
    data_dir: String,
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: data_dir(&app)?.to_string_lossy().to_string(),
    })
}

#[derive(serde::Serialize)]
struct HttpResp {
    status: u16,
    body: String,
    #[serde(rename = "finalUrl")]
    final_url: String,
    #[serde(rename = "contentType")]
    content_type: String,
}

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn shared_http_client() -> Result<&'static reqwest::Client, String> {
    if let Some(c) = HTTP_CLIENT.get() {
        return Ok(c);
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!(
            "Mozilla/5.0 LeTimeManagement/",
            env!("CARGO_PKG_VERSION")
        ))
        .connect_timeout(std::time::Duration::from_secs(6))
        .timeout(std::time::Duration::from_secs(15))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .pool_max_idle_per_host(8)
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let _ = HTTP_CLIENT.set(client);
    HTTP_CLIENT
        .get()
        .ok_or_else(|| "HTTP 客户端初始化失败".into())
}

/// 插件网络桥：服务端抓取，绕开 WebView 的 CORS 限制
#[tauri::command]
async fn http_get(url: String) -> Result<HttpResp, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https 地址".into());
    }
    let client = shared_http_client()?;
    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/html;q=0.9, */*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    Ok(HttpResp {
        status,
        body,
        final_url,
        content_type,
    })
}

/// 用系统默认浏览器打开外部链接（插件点击消息详情用）
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https 链接".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("打开失败: {e}"))
}

/* ── 局域网联动：手机/小程序作为遥控端 ── */

struct LanHandle(Mutex<Option<lan::LanInstance>>);

#[tauri::command]
fn lan_start(
    app: AppHandle,
    handle: State<LanHandle>,
    port: u16,
    token: String,
) -> Result<String, String> {
    let quit = Arc::new(AtomicBool::new(false));
    let data_path = data_dir(&app)?.join("data.json");
    let url = lan::spawn_server(app, port, token.clone(), data_path, quit.clone())?;
    *handle.0.lock().map_err(|_| "锁占用")? = Some(lan::LanInstance {
        quit,
        url: url.clone(),
        port,
        token,
    });
    Ok(url)
}

#[tauri::command]
fn lan_stop(handle: State<LanHandle>) -> Result<(), String> {
    if let Some(inst) = handle.0.lock().map_err(|_| "锁占用")?.take() {
        inst.quit.store(true, std::sync::atomic::Ordering::Relaxed);
        // 发一个哑请求解除 recv 阻塞，让服务线程退出
        if let Ok(mut s) = std::net::TcpStream::connect(("127.0.0.1", inst.port)) {
            use std::io::Write as _;
            let _ = s.write_all(
                format!(
                    "GET /quit?token={} HTTP/1.1\r\nHost: localhost\r\n\r\n",
                    inst.token
                )
                .as_bytes(),
            );
        }
    }
    Ok(())
}

#[tauri::command]
fn lan_status(handle: State<LanHandle>) -> Result<Value, String> {
    Ok(match handle.0.lock().map_err(|_| "锁占用")?.as_ref() {
        Some(inst) => json!({ "running": true, "url": inst.url }),
        None => json!({ "running": false }),
    })
}

/// DES-ECB(PKCS5) 加密并输出 hex —— 超星登录等场景用（RustCrypto 实现，保证正确性）
#[tauri::command]
fn des_ecb_encrypt_hex(plain: String, key: String) -> Result<String, String> {
    use des::Des;
    use ecb::cipher::{BlockEncryptMut, KeyInit};
    use ecb::Encryptor;
    if key.as_bytes().len() != 8 {
        return Err("DES 密钥必须为 8 字节".into());
    }
    type DesEcb = Encryptor<Des>;
    let mut cipher =
        DesEcb::new_from_slice(key.as_bytes()).map_err(|e| format!("密钥初始化失败: {e}"))?;
    let mut buf = plain.as_bytes().to_vec();
    let pad = 8 - (buf.len() % 8);
    buf.extend(std::iter::repeat(pad as u8).take(pad));
    for chunk in buf.chunks_mut(8) {
        cipher.encrypt_block_mut(chunk.into());
    }
    Ok(hex::encode(buf))
}

/* ── 会话化 HTTP：带 Cookie Jar，供需要登录态的插件（如学习通）使用 ── */

/// 一个会话 = reqwest Client + 它的 Cookie Jar 句柄。
/// 留着 jar 引用是为了整体导出/恢复 Cookie（应用重启后恢复登录态，免验证码）。
pub struct HttpSession {
    client: reqwest::Client,
    no_redirect_client: reqwest::Client,
    jar: Arc<reqwest::cookie::Jar>,
}

impl Clone for HttpSession {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            no_redirect_client: self.no_redirect_client.clone(),
            jar: self.jar.clone(),
        }
    }
}

pub struct HttpSessions(pub Mutex<HashMap<String, HttpSession>>);

fn new_http_session() -> Result<HttpSession, String> {
    let jar = Arc::new(reqwest::cookie::Jar::default());
    let make_client = |follow_redirects: bool| {
        let mut builder = reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .user_agent(concat!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 LeTimeManagement/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(std::time::Duration::from_secs(6))
            .timeout(std::time::Duration::from_secs(18))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .pool_max_idle_per_host(8);
        if !follow_redirects {
            builder = builder.redirect(reqwest::redirect::Policy::none());
        }
        builder
            .build()
            .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))
    };
    let client = make_client(true)?;
    let no_redirect_client = make_client(false)?;
    Ok(HttpSession {
        client,
        no_redirect_client,
        jar,
    })
}

fn new_session_id() -> String {
    format!(
        "s{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    )
}

#[derive(serde::Serialize)]
struct HttpFetchResp {
    status: u16,
    body: String,
    #[serde(rename = "finalUrl")]
    final_url: String,
    #[serde(rename = "contentType")]
    content_type: String,
    location: String,
    cookies: Vec<String>,
}

#[tauri::command]
fn http_session_new(state: State<HttpSessions>) -> Result<String, String> {
    let id = new_session_id();
    state
        .0
        .lock()
        .map_err(|_| "会话表被占用")?
        .insert(id.clone(), new_http_session()?);
    Ok(id)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct CookieDump {
    url: String,
    /// 该 URL 下当前生效的全部 Cookie，形如 "k1=v1; k2=v2"
    cookie: String,
}

/// 导出会话在给定 URL 下的全部 Cookie（登录成功后由插件保存，重启后恢复免验证码）
#[tauri::command]
fn http_session_export(
    state: State<HttpSessions>,
    sid: String,
    urls: Vec<String>,
) -> Result<Vec<CookieDump>, String> {
    use reqwest::cookie::CookieStore as _;
    let session = state
        .0
        .lock()
        .map_err(|_| "会话表被占用")?
        .get(&sid)
        .ok_or("会话不存在或已过期")?
        .clone();
    let mut out = Vec::new();
    for url in urls {
        let parsed = reqwest::Url::parse(&url).map_err(|e| format!("URL 无法解析: {e}"))?;
        if let Some(value) = session.jar.cookies(&parsed) {
            let cookie = value.to_str().unwrap_or("").to_string();
            if !cookie.is_empty() {
                out.push(CookieDump { url, cookie });
            }
        }
    }
    Ok(out)
}

/// 用导出的 Cookie 重建一个会话（host-only 属性与导出时一致，可直接续期）
#[tauri::command]
fn http_session_restore(
    state: State<HttpSessions>,
    cookies: Vec<CookieDump>,
) -> Result<String, String> {
    let session = new_http_session()?;
    for dump in &cookies {
        let url = reqwest::Url::parse(&dump.url).map_err(|e| format!("URL 无法解析: {e}"))?;
        for part in dump.cookie.split(';') {
            let part = part.trim();
            if part.contains('=') {
                session.jar.add_cookie_str(part, &url);
            }
        }
    }
    let id = new_session_id();
    state
        .0
        .lock()
        .map_err(|_| "会话表被占用")?
        .insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
async fn http_fetch(
    state: State<'_, HttpSessions>,
    sid: String,
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    binary: Option<bool>,
    follow_redirects: Option<bool>,
) -> Result<HttpFetchResp, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https 地址".into());
    }
    let session = state
        .0
        .lock()
        .map_err(|_| "会话表被占用")?
        .get(&sid)
        .cloned()
        .ok_or("会话不存在或已过期，请重新创建")?;
    let client = if follow_redirects == Some(false) {
        session.no_redirect_client
    } else {
        session.client
    };

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    if let Some(hs) = &headers {
        for (k, v) in hs {
            req = req.header(k, v);
        }
    }
    if let Some(b) = &body {
        req = req.body(b.clone());
    }
    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let location = resp
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let cookies = resp
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .collect();
    // binary=true 时返回 base64（验证码等图片场景）
    let resp_body = if binary.unwrap_or(false) {
        use base64::Engine as _;
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读取响应失败: {e}"))?;
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    } else {
        resp.text()
            .await
            .map_err(|e| format!("读取响应失败: {e}"))?
    };
    Ok(HttpFetchResp {
        status,
        body: resp_body,
        final_url,
        content_type,
        location,
        cookies,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // 桌面端单实例：二次启动时聚焦已有窗口，避免多实例互相覆盖 data.json
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }
    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(native_schedule::init());
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .manage(HttpSessions(Mutex::new(HashMap::new())))
        .manage(LanHandle(Mutex::new(None)))
        .manage(native_schedule::NativeSchedule::default())
        .invoke_handler(tauri::generate_handler![
            native_schedule::native_schedule,
            load_data,
            save_data,
            list_plugins,
            read_plugin_file,
            delete_plugin,
            import_plugin_zip,
            export_plugins_zip,
            app_info,
            http_get,
            open_external,
            des_ecb_encrypt_hex,
            http_session_new,
            http_fetch,
            http_session_export,
            http_session_restore,
            school_import_open,
            plugin_vault_set,
            plugin_vault_get,
            plugin_vault_del,
            ai_vault_save,
            ai_vault_status,
            ai_vault_clear,
            ai_chat,
            lan_start,
            lan_stop,
            lan_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn des_matches_pydes_vectors() {
        // 向量由 python pyDes（超星登录同款 DES-ECB/PKCS5）计算
        assert_eq!(
            des_ecb_encrypt_hex("123456".into(), "u2oh6Vu^".into()).unwrap(),
            "218b246a6f42ee81"
        );
        assert_eq!(
            des_ecb_encrypt_hex("abc".into(), "u2oh6Vu^".into()).unwrap(),
            "4cfc33620fedd8d7"
        );
    }

    #[test]
    fn aead_round_trip_and_tamper_detection() {
        // 插件密钥库同款加解密：随机密钥 round-trip + 篡改必须失败
        let key: Vec<u8> = (0..32u8).collect();
        let plain = b"password123&cookies-json";
        let sealed = aead_encrypt(&key, plain).unwrap();
        assert_ne!(sealed, plain.to_vec());
        assert_eq!(aead_decrypt(&key, &sealed).unwrap(), plain.to_vec());
        // 换密钥解不开
        let wrong: Vec<u8> = (32..64u8).collect();
        assert!(aead_decrypt(&wrong, &sealed).is_err());
        // 篡改一个字节必须失败
        let mut tampered = sealed.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 0x01;
        assert!(aead_decrypt(&key, &tampered).is_err());
    }
}
