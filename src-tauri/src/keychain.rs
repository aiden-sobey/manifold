//! Secret storage for API keys.
//!
//! Desktop uses the OS credential store via `keyring` (macOS Keychain, Windows Credential
//! Manager, Secret Service). Mobile has no `keyring` backend, so keys live in `secrets.json`
//! in the app's private data directory, which the OS sandboxes per app.

const DEFAULT_ACCOUNT: &str = "openrouter";

fn account_name(account: Option<String>) -> String {
    account.unwrap_or_else(|| DEFAULT_ACCOUNT.to_string())
}

#[cfg(desktop)]
mod backend {
    use super::account_name;
    use keyring::Entry;

    const SERVICE: &str = "chat_harness";

    fn entry(account: Option<String>) -> Result<Entry, String> {
        Entry::new(SERVICE, &account_name(account)).map_err(|e| e.to_string())
    }

    pub fn get(_app: &tauri::AppHandle, account: Option<String>) -> Result<Option<String>, String> {
        match entry(account)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn set(_app: &tauri::AppHandle, key: &str, account: Option<String>) -> Result<(), String> {
        let entry = entry(account)?;
        if key.is_empty() {
            return match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(e.to_string()),
            };
        }
        entry.set_password(key).map_err(|e| e.to_string())
    }
}

#[cfg(mobile)]
mod backend {
    use super::account_name;
    use tauri_plugin_store::StoreExt;

    const FILE: &str = "secrets.json";

    pub fn get(app: &tauri::AppHandle, account: Option<String>) -> Result<Option<String>, String> {
        let store = app.store(FILE).map_err(|e| e.to_string())?;
        Ok(store
            .get(account_name(account))
            .and_then(|v| v.as_str().map(str::to_owned)))
    }

    pub fn set(app: &tauri::AppHandle, key: &str, account: Option<String>) -> Result<(), String> {
        let store = app.store(FILE).map_err(|e| e.to_string())?;
        let name = account_name(account);
        if key.is_empty() {
            store.delete(name);
        } else {
            store.set(name, serde_json::Value::String(key.to_owned()));
        }
        store.save().map_err(|e| e.to_string())
    }
}

/// Reads a secret. `account` defaults to the OpenRouter API key; other values
/// (e.g. "openrouter-management") address additional secrets.
#[tauri::command]
pub fn get_api_key(
    app: tauri::AppHandle,
    account: Option<String>,
) -> Result<Option<String>, String> {
    backend::get(&app, account)
}

/// Stores a secret. An empty or whitespace-only key deletes the entry.
#[tauri::command]
pub fn set_api_key(
    app: tauri::AppHandle,
    key: String,
    account: Option<String>,
) -> Result<(), String> {
    backend::set(&app, key.trim(), account)
}
