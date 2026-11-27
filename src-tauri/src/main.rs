#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod library;

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    webview::NewWindowResponse,
    Manager, State, WebviewWindowBuilder,
};

use library::{Library, LibraryError};

struct Store(Mutex<Library>);

impl Store {
    fn run<T>(
        &self,
        operation: impl FnOnce(&mut Library) -> Result<T, LibraryError>,
    ) -> Result<T, String> {
        let mut library = self
            .0
            .lock()
            .map_err(|_| "Please restart x-reader to reopen your library.")?;
        operation(&mut library).map_err(|error| error.to_string())
    }
}

#[tauri::command(async)]
fn import_book(request: Request<'_>, store: State<'_, Store>) -> Result<(), String> {
    let InvokeBody::Raw(payload) = request.body() else {
        return Err("Expected a binary import payload.".into());
    };
    store.run(|library| library.import(payload))
}

#[tauri::command(async)]
fn list_books(store: State<'_, Store>) -> Result<Vec<String>, String> {
    store.run(|library| library.entries())
}

#[tauri::command(async)]
fn read_book(id: String, store: State<'_, Store>) -> Result<String, String> {
    store.run(|library| library.document(&id))
}

#[tauri::command(async)]
fn read_source(id: String, store: State<'_, Store>) -> Result<Response, String> {
    store.run(|library| library.source(&id)).map(Response::new)
}

#[tauri::command(async)]
fn update_entry(entry: String, store: State<'_, Store>) -> Result<(), String> {
    store.run(|library| library.update(&entry))
}

#[tauri::command(async)]
fn remove_book(id: String, store: State<'_, Store>) -> Result<(), String> {
    store.run(|library| library.remove(&id))
}

fn app_bundle(executable: &Path) -> Option<&Path> {
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    (macos.ends_with("MacOS") && contents.ends_with("Contents") && bundle.extension()? == "app")
        .then_some(bundle)
}

fn portable_directory(executable: &Path) -> Option<PathBuf> {
    let parent = app_bundle(executable).unwrap_or(executable).parent()?;
    parent
        .join("x-reader.portable")
        .is_file()
        .then(|| parent.join("data"))
}

#[cfg(target_os = "macos")]
fn mac_portable_directory(executable: &Path) -> std::io::Result<Option<PathBuf>> {
    // Finder may translocate an app before its first launch. The portable
    // launcher passes the extracted folder through Launch Services in that case.
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() == Some(std::ffi::OsStr::new("--portable-home")) {
        if let Some(folder) = args.next().map(PathBuf::from) {
            if folder.is_absolute() && folder.join("x-reader.portable").is_file() {
                return Ok(Some(folder.join("data")));
            }
        }
    }
    let portable = portable_directory(executable);
    if portable.is_none()
        && app_bundle(executable).is_some_and(|p| p.ends_with("x-reader Portable.app"))
    {
        let message = "Keep the portable app and x-reader.portable in the same writable folder. Open x-reader.command from that folder to start reading.";
        let _ = std::process::Command::new("/usr/bin/osascript")
            .args([
                "-e",
                &format!("display alert \"Open the portable folder\" message \"{message}\""),
            ])
            .status();
        return Err(std::io::Error::other(message));
    }
    Ok(portable)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let executable = std::env::current_exe()?;
            #[cfg(target_os = "macos")]
            let portable = mac_portable_directory(&executable)?;
            #[cfg(not(target_os = "macos"))]
            let portable = portable_directory(&executable);
            let library_dir = match &portable {
                Some(folder) => folder.clone(),
                None => app.path().app_local_data_dir()?,
            };
            app.manage(Store(Mutex::new(Library::open(&library_dir)?)));
            let config = &app.config().app.windows[0];
            let dev_origin = app.config().build.dev_url.as_ref().map(|url| url.origin());
            let mut window = WebviewWindowBuilder::from_config(app, config)?
                .on_navigation(move |url| {
                    let local_app = match url.scheme() {
                        "tauri" => url.host_str() == Some("localhost"),
                        "https" | "http" => url.host_str() == Some("tauri.localhost"),
                        _ => false,
                    };
                    local_app
                        || (cfg!(debug_assertions) && dev_origin.as_ref() == Some(&url.origin()))
                })
                .on_new_window(|_, _| NewWindowResponse::Deny);
            #[cfg(target_os = "macos")]
            if portable.is_some() {
                window = window.incognito(true);
            }
            #[cfg(not(target_os = "macos"))]
            if let Some(folder) = portable {
                window = window.data_directory(folder.join("webview"));
            }
            #[cfg(feature = "native-ui-smoke")]
            let window = window
                .initialization_script(include_str!("../tests/native-ui-smoke.js"))
                .on_document_title_changed(|window, title| {
                    if title == "x-reader smoke passed" {
                        println!("{title}");
                        window.app_handle().exit(0);
                    } else if title.starts_with("x-reader smoke failed: ") {
                        eprintln!("{title}");
                        window.app_handle().exit(1);
                    }
                });
            window.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_book,
            list_books,
            read_book,
            read_source,
            update_entry,
            remove_book
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start x-reader");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_marked_copies_use_adjacent_data() {
        let directory = tempfile::tempdir().unwrap();
        let binary = directory.path().join("x-reader.exe");
        assert!(portable_directory(&binary).is_none());
        std::fs::write(directory.path().join("x-reader.portable"), "").unwrap();
        assert_eq!(
            portable_directory(&binary),
            Some(directory.path().join("data"))
        );
        let app = directory
            .path()
            .join("x-reader Portable.app/Contents/MacOS/x-reader");
        assert_eq!(
            portable_directory(&app),
            Some(directory.path().join("data"))
        );
    }
}
