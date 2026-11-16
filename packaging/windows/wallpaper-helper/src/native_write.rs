use std::sync::Mutex;

/// Recovery and relocation must finish their native writes before the other captures geometry.
pub struct NativeWrites(Mutex<()>);

impl NativeWrites {
    pub const fn new() -> Self {
        Self(Mutex::new(()))
    }

    pub fn run<T>(&self, operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let _guard = self.0.lock().map_err(|_| "native write lock poisoned".to_string())?;
        operation()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};

    #[test]
    fn recovery_and_relocation_cannot_capture_or_write_concurrently() {
        for first in ["recovery", "relocation"] {
            let gate = Arc::new(NativeWrites::new());
            let worker_gate = gate.clone();
            let (entered_tx, entered_rx) = mpsc::channel();
            let (release_tx, release_rx) = mpsc::channel();
            let worker = std::thread::spawn(move || worker_gate.run(|| {
                entered_tx.send(first).unwrap();
                release_rx.recv().unwrap();
                Ok(())
            }));
            assert_eq!(entered_rx.recv().unwrap(), first);
            assert!(gate.0.try_lock().is_err());
            release_tx.send(()).unwrap();
            worker.join().unwrap().unwrap();
            assert!(gate.run(|| Ok(())).is_ok());
        }
    }

    #[test]
    fn a_failed_operation_releases_the_gate() {
        let gate = NativeWrites::new();
        assert!(gate.run::<()>(|| Err("host unavailable".into())).is_err());
        assert!(gate.run(|| Ok(())).is_ok());
    }
}
