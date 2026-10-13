// The game server of Shared Button, compiled to WebAssembly. The host gives it one JSON message at a
// time through `call`, and it asks the host for things through `host.ask`.
// See "Game servers" in specs/PROTOCOL.md.

use serde_json::{json, Value};
use std::cell::RefCell;

#[link(wasm_import_module = "host")]
extern "C" {
    fn ask(pointer: *const u8, length: usize);
}

#[derive(Default)]
struct State {
    count: u64,
    connections: Vec<i64>,
    ringing: bool,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

fn ask_host(request: Value) {
    let text = request.to_string();
    unsafe { ask(text.as_ptr(), text.len()) }
}

/// Room for the host to write its next message into. `call` takes it over and frees it.
#[no_mangle]
pub extern "C" fn alloc(length: usize) -> *mut u8 {
    let mut room = Vec::<u8>::with_capacity(length);
    let pointer = room.as_mut_ptr();
    std::mem::forget(room);
    pointer
}

#[no_mangle]
pub extern "C" fn call(pointer: *mut u8, length: usize) {
    let bytes = unsafe { Vec::from_raw_parts(pointer, length, length) };
    let Ok(message) = serde_json::from_slice::<Value>(&bytes) else { return };
    let connection = message["player"]["conn"].as_i64();
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        match message["t"].as_str() {
            Some("start") => state.count = message["data"]["count"].as_u64().unwrap_or(0),
            Some("join") => {
                let conn = connection.unwrap_or(-1);
                state.connections.push(conn);
                ask_host(json!({ "t": "send", "conn": conn, "data": { "count": state.count } }));
            }
            Some("leave") => state.connections.retain(|conn| Some(*conn) != connection),
            Some("message") if message["data"] == "press" => {
                state.count += 1;
                ask_host(json!({ "t": "save", "key": "count", "value": state.count }));
                // Tell everyone in a moment, so that a crowd pressing at once is answered once.
                if !state.ringing {
                    state.ringing = true;
                    ask_host(json!({ "t": "timer", "ms": 100 }));
                }
            }
            Some("timer") => {
                state.ringing = false;
                for conn in &state.connections {
                    ask_host(json!({ "t": "send", "conn": conn, "data": { "count": state.count } }));
                }
            }
            _ => {}
        }
    });
}
