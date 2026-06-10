"use client";
import React from 'react';
import styles from './dialog.module.css';

interface DialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}

interface DialogContextProps {
  alert: (message: string, title?: string) => Promise<boolean>;
  confirm: (message: string, title?: string) => Promise<boolean>;
}

const DialogContext = React.createContext<DialogContextProps | undefined>(undefined);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<DialogConfig>({
    isOpen: false,
    title: '',
    message: '',
    isConfirm: false,
    resolve: () => {},
  });

  const alert = (message: string, title: string = 'Notification'): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig({
        isOpen: true,
        title,
        message,
        isConfirm: false,
        resolve,
      });
    });
  };

  const confirm = (message: string, title: string = 'Confirm Action'): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig({
        isOpen: true,
        title,
        message,
        isConfirm: true,
        resolve,
      });
    });
  };

  const handleAction = (val: boolean) => {
    config.resolve(val);
    setConfig((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {config.isOpen && (
        <div className={styles.overlay} onClick={() => !config.isConfirm && handleAction(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header}>
              <div className={styles.iconWrapper}>
                {config.isConfirm ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                )}
              </div>
              <h3 className={styles.title}>{config.title}</h3>
            </div>
            <p className={styles.message}>{config.message}</p>
            <div className={styles.footer}>
              {config.isConfirm && (
                <button className={`${styles.btn} ${styles.cancelBtn}`} onClick={() => handleAction(false)}>
                  Cancel
                </button>
              )}
              <button className={`${styles.btn} ${styles.confirmBtn}`} onClick={() => handleAction(true)}>
                {config.isConfirm ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export const useDialog = () => {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
};
