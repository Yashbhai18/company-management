import React from 'react';
import styles from './ios-spinner.module.css';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export function IosSpinner({ className, size = "md", ...props }: SpinnerProps) {
  return (
    <div
      className={`${styles.spinner} ${styles[size]} ${className || ''}`}
      {...props}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className={styles.spinnerBlade} />
      ))}
    </div>
  );
}
