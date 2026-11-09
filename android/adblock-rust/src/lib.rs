use adblock::lists::{FilterFormat, FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::Engine;
use jni::objects::{JClass, JString};
use jni::sys::jboolean;
use jni::JNIEnv;
use std::sync::{OnceLock, RwLock};

static ENGINE: OnceLock<RwLock<Option<Engine>>> = OnceLock::new();

fn engine_slot() -> &'static RwLock<Option<Engine>> {
    ENGINE.get_or_init(|| RwLock::new(None))
}

fn java_string(env: &mut JNIEnv, value: &JString) -> String {
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

    let mut filter_set = FilterSet::new(false);
    if !standard.trim().is_empty() {
        filter_set.add_filter_list(&standard, ParseOptions::default());
    }
    if !hosts.trim().is_empty() {
        let options = ParseOptions {
            format: FilterFormat::Hosts,
            ..ParseOptions::default()
        };
        filter_set.add_filter_list(&hosts, options);
    }

    let engine = Engine::new_with_filter_set(filter_set);
    match engine_slot().write() {
        Ok(mut slot) => {
            *slot = Some(engine);
            1
        }
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_workrcs_situla_security_BraveAdblock_nativeShouldBlock(
    mut env: JNIEnv,
    _class: JClass,
    url: JString,
    source_url: JString,
) -> jboolean {
    let url = java_string(&mut env, &url);
    let source = java_string(&mut env, &source_url);
    if url.is_empty() {
        return 0;
    }

    let request = match Request::new(&url, &source, "other", "GET") {
        Ok(request) => request,
        Err(_) => return 0,
    };

    match engine_slot().read() {
        Ok(slot) => match slot.as_ref() {
            Some(engine) => {
                let result = engine.check_network_request(&request);
                if result.important || (result.matched && result.exception.is_none()) {
                    1
                } else {
                    0
                }
            }
            None => 0,
        },
        Err(_) => 0,
    }
}
