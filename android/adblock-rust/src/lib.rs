use adblock::lists::{FilterFormat, FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::Engine;
use jni::objects::{JClass, JString};
use jni::sys::jboolean;
use jni::JNIEnv;
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};

enum Command {
    Load {
        standard: String,
        hosts: String,
        reply: Sender<bool>,
    },
    Check {
        url: String,
        source: String,
        request_type: String,
        reply: Sender<bool>,
    },
    Cosmetic {
        url: String,
        reply: Sender<String>,
    },
}

static WORKER: OnceLock<Mutex<Option<Sender<Command>>>> = OnceLock::new();

fn worker_sender() -> Option<Sender<Command>> {
    let slot = WORKER.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock().ok()?;
    if guard.is_none() {
        let (sender, receiver) = mpsc::channel::<Command>();
        std::thread::Builder::new()
            .name("situla-adblock-rust".to_string())
            .spawn(move || {
                // adblock-rust Engine is intentionally !Send and !Sync.
                // Construct and use it on this dedicated thread only.
                let mut engine: Option<Engine> = None;
                while let Ok(command) = receiver.recv() {
                    match command {
                        Command::Load { standard, hosts, reply } => {
                            let mut filters = FilterSet::new(false);
                            if !standard.trim().is_empty() {
                                filters.add_filter_list(standard, ParseOptions::default());
                            }
                            if !hosts.trim().is_empty() {
                                let options = ParseOptions {
                                    format: FilterFormat::Hosts,
                                    ..ParseOptions::default()
                                };
                                filters.add_filter_list(hosts, options);
                            }
                            engine = Some(Engine::new_with_filter_set(filters));
                            let _ = reply.send(true);
                        }
                        Command::Check { url, source, request_type, reply } => {
                            let blocked = engine.as_ref().and_then(|engine| {
                                Request::new(&url, &source, &request_type, "GET").ok().map(|request| {
                                    let result = engine.check_network_request(&request);
                                    result.important || (result.matched && result.exception.is_none())
                                })
                            }).unwrap_or(false);
                            let _ = reply.send(blocked);
                        }
                        Command::Cosmetic { url, reply } => {
                            let payload = engine.as_ref().map(|engine| {
                                let resources = engine.url_cosmetic_resources(&url);
                                let css = resources.hide_selectors
                                    .iter()
                                    .map(|selector| format!("{selector}{{display:none!important}}"))
                                    .collect::<Vec<_>>()
                                    .join("\n");
                                serde_json::json!({
                                    "css": css,
                                    "script": resources.injected_script,
                                }).to_string()
                            }).unwrap_or_else(|| "{\"css\":\"\",\"script\":\"\"}".to_string());
                            let _ = reply.send(payload);
                        }
                    }
                }
            })
            .ok()?;
        *guard = Some(sender);
    }
    guard.as_ref().cloned()
}

fn java_string<'local>(env: &mut JNIEnv<'local>, value: &JString<'local>) -> String {
    env.get_string(value)
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[no_mangle]
pub extern "system" fn Java_com_workrcs_situla_security_BraveAdblock_nativeLoadFilters(
    mut env: JNIEnv,
    _class: JClass,
    standard_rules: JString,
    hosts_rules: JString,
) -> jboolean {
    let standard = java_string(&mut env, &standard_rules);
    let hosts = java_string(&mut env, &hosts_rules);
    let (reply_sender, reply_receiver) = mpsc::channel();
    let command = Command::Load {
        standard,
        hosts,
        reply: reply_sender,
    };
    match worker_sender().and_then(|sender| sender.send(command).ok().map(|_| sender)) {
        Some(_) => if reply_receiver.recv().unwrap_or(false) { 1 } else { 0 },
        None => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_workrcs_situla_security_BraveAdblock_nativeShouldBlock(
    mut env: JNIEnv,
    _class: JClass,
    url: JString,
    source_url: JString,
    request_type: JString,
) -> jboolean {
    let url = java_string(&mut env, &url);
    let source = java_string(&mut env, &source_url);
    let request_type = java_string(&mut env, &request_type);
    if url.is_empty() {
        return 0;
    }

    let (reply_sender, reply_receiver) = mpsc::channel();
    let command = Command::Check {
        url,
        source,
        request_type,
        reply: reply_sender,
    };
    match worker_sender().and_then(|sender| sender.send(command).ok().map(|_| sender)) {
        Some(_) => if reply_receiver.recv().unwrap_or(false) { 1 } else { 0 },
        None => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_workrcs_situla_security_BraveAdblock_nativeCosmeticPayload(
    mut env: JNIEnv,
    _class: JClass,
    url: JString,
) -> jni::sys::jstring {
    let url = java_string(&mut env, &url);
    let (reply_sender, reply_receiver) = mpsc::channel();
    let command = Command::Cosmetic { url, reply: reply_sender };
    let payload = worker_sender()
        .and_then(|sender| sender.send(command).ok().map(|_| sender))
        .and_then(|_| reply_receiver.recv().ok())
        .unwrap_or_else(|| "{\"css\":\"\",\"script\":\"\"}".to_string());

    env.new_string(payload)
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
