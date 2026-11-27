//! The shelf index stays small. Original bytes and normalized chapters live in
//! separate rows so reading-position updates never rewrite a whole book.
use std::{fs, path::Path, time::Duration};

use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::value::RawValue;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LibraryError {
    #[error("Could not access the library folder: {0}")]
    Io(#[from] std::io::Error),
    #[error("Library database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("Invalid book metadata: {0}")]
    Json(#[from] serde_json::Error),
    #[error("The book and shelf entry must have the same nonempty identifier.")]
    Identifier,
    #[error("This file is already in your library.")]
    Duplicate,
    #[error("This book is no longer in your library.")]
    Missing,
    #[error("The import data is incomplete.")]
    InvalidPayload,
    #[error("This library was created by a newer version of x-reader.")]
    NewerVersion,
}

type Result<T> = std::result::Result<T, LibraryError>;

#[derive(Deserialize)]
struct Identity<'a> {
    id: &'a str,
}

#[derive(Deserialize)]
struct Import<'a> {
    #[serde(borrow)]
    book: &'a RawValue,
    #[serde(borrow)]
    entry: &'a RawValue,
}

pub struct Library(Connection);

impl Library {
    pub fn open(folder: &Path) -> Result<Self> {
        fs::create_dir_all(folder)?;
        let mut db = Connection::open(folder.join("library.sqlite3"))?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        let tx = db.transaction()?;
        let version: u32 = tx.pragma_query_value(None, "user_version", |row| row.get(0))?;
        match version {
            0 => tx.execute_batch(
                "CREATE TABLE shelf (
                     id TEXT PRIMARY KEY NOT NULL,
                     entry TEXT NOT NULL
                 );
                 CREATE TABLE books (
                     id TEXT PRIMARY KEY REFERENCES shelf(id) ON DELETE CASCADE,
                     document TEXT NOT NULL,
                     source BLOB NOT NULL
                 );
                 PRAGMA user_version = 1;",
            )?,
            1 => {}
            _ => return Err(LibraryError::NewerVersion),
        }
        tx.commit()?;
        Ok(Self(db))
    }

    /// Wire format: 4-byte little-endian metadata length, UTF-8 JSON metadata,
    /// then the original file bytes. This avoids base64 or a JSON integer array.
    pub fn import(&mut self, payload: &[u8]) -> Result<()> {
        let (length_bytes, body) = payload
            .split_at_checked(4)
            .ok_or(LibraryError::InvalidPayload)?;
        let length = u32::from_le_bytes(length_bytes.try_into().expect("four-byte prefix"));
        let (json, source) = body
            .split_at_checked(length as usize)
            .ok_or(LibraryError::InvalidPayload)?;
        let import: Import = serde_json::from_slice(json)?;
        let book: Identity = serde_json::from_str(import.book.get())?;
        let entry: Identity = serde_json::from_str(import.entry.get())?;
        if book.id.is_empty() || book.id != entry.id {
            return Err(LibraryError::Identifier);
        }
        let tx = self.0.transaction()?;
        let inserted = tx.execute(
            "INSERT INTO shelf(id, entry) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
            params![book.id, import.entry.get()],
        )?;
        if inserted == 0 {
            return Err(LibraryError::Duplicate);
        }
        tx.execute(
            "INSERT INTO books(id, document, source) VALUES (?1, ?2, ?3)",
            params![book.id, import.book.get(), source],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn entries(&self) -> Result<Vec<String>> {
        let mut statement = self.0.prepare("SELECT entry FROM shelf ORDER BY rowid")?;
        let entries = statement.query_map([], |row| row.get(0))?;
        Ok(entries.collect::<rusqlite::Result<_>>()?)
    }

    pub fn document(&self, id: &str) -> Result<String> {
        Ok(self
            .0
            .query_row("SELECT document FROM books WHERE id = ?1", [id], |row| {
                row.get(0)
            })?)
    }

    pub fn source(&self, id: &str) -> Result<Vec<u8>> {
        Ok(self
            .0
            .query_row("SELECT source FROM books WHERE id = ?1", [id], |row| {
                row.get(0)
            })?)
    }

    pub fn update(&self, entry: &str) -> Result<()> {
        let identity: Identity = serde_json::from_str(entry)?;
        let affected = self.0.execute(
            "UPDATE shelf SET entry = ?1 WHERE id = ?2",
            params![entry, identity.id],
        )?;
        if affected == 0 {
            return Err(LibraryError::Missing);
        }
        Ok(())
    }

    pub fn remove(&self, id: &str) -> Result<()> {
        self.0.execute("DELETE FROM shelf WHERE id = ?1", [id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(book: &str, entry: &str, source: &[u8]) -> Vec<u8> {
        let metadata = format!(r#"{{"book":{book},"entry":{entry}}}"#);
        let mut payload = (metadata.len() as u32).to_le_bytes().to_vec();
        payload.extend_from_slice(metadata.as_bytes());
        payload.extend_from_slice(source);
        payload
    }

    #[test]
    fn import_resume_reopen_and_remove() {
        let folder = tempfile::tempdir().unwrap();
        let book = r#"{"id":"sample","chapters":[{"title":"First page"}]}"#;
        let entry = r#"{"id":"sample","state":{"mode":"flow"}}"#;
        let updated = r#"{"id":"sample","state":{"mode":"pdf","page":7,"bookmarks":[2]}}"#;
        let source = b"%PDF-1.5\x00\xff";
        let bytes = envelope(book, entry, source);
        {
            let mut library = Library::open(folder.path()).unwrap();
            library.import(&bytes).unwrap();
            assert!(matches!(
                library.import(&bytes),
                Err(LibraryError::Duplicate)
            ));
            library.update(updated).unwrap();
        }
        let library = Library::open(folder.path()).unwrap();
        assert_eq!(library.entries().unwrap(), [updated]);
        assert_eq!(library.document("sample").unwrap(), book);
        assert_eq!(library.source("sample").unwrap(), source);
        library.remove("sample").unwrap();
        assert!(library.entries().unwrap().is_empty());
        assert!(library.source("sample").is_err());
        assert!(matches!(
            library.update(updated),
            Err(LibraryError::Missing)
        ));
    }

    #[test]
    fn invalid_imports_leave_no_partial_entries() {
        let folder = tempfile::tempdir().unwrap();
        let mut library = Library::open(folder.path()).unwrap();
        for bytes in [
            vec![],
            vec![255; 8],
            envelope("{}", "{}", b"abc"),
            envelope(r#"{"id":"a"}"#, r#"{"id":"b"}"#, b"x"),
        ] {
            assert!(library.import(&bytes).is_err());
        }
        assert!(library.entries().unwrap().is_empty());
    }
}
