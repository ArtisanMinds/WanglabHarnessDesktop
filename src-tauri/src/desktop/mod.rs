pub mod activation;
pub mod autostart;
pub mod builder;
pub mod compat;
#[cfg(target_os = "linux")]
pub mod linux_tray;
pub mod notification;
pub mod paste;
pub mod payload;
pub mod pet;
pub mod pet_mouse;
pub mod plugin_boot;
pub mod window;
pub mod zoom;

pub use builder::{builder, handler, setup, tray};
pub use notification::show_native_notification;
