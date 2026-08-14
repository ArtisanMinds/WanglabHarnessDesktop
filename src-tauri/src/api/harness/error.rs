//! Error type for the harness module.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum DshError {
    #[error("{0}")]
    Path(String),

    #[error("{0}")]
    Config(String),

    #[error("{0}")]
    Installation(String),

    #[error("{0}")]
    Process(String),

    #[error("hash mismatch: expected {expected}, got {actual}")]
    HashMismatch { expected: String, actual: String },

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub type DshResult<T> = Result<T, DshError>;
