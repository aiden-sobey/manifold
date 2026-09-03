use keyring::Entry;

const SERVICE: &str = "chat_harness";
const DEFAULT_ACCOUNT: &str = "openrouter";

fn entry(account: Option<String>) -> Result<Entry, String> {
    let account = account.unwrap_or_else(|| DEFAULT_ACCOUNT.to_string());
    Entry::new(SERVICE, &account).map_err(|e| e.to_string())
}

/// Reads a secret. `account` defaults to the OpenRouter API key; other values
/// (e.g. "openrouter-management") address additional secrets.
#[tauri::command]
pub fn get_api_key(account: Option<String>) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_api_key(key: String, account: Option<String>) -> Result<(), String> {
    let entry = entry(account)?;
    if key.trim().is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(key.trim()).map_err(|e| e.to_string())
}
