import React from 'react';
import { createPortal } from 'react-dom';
import styles from './customselect.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  variant?: 'default' | 'small';
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select option...",
  className,
  style,
  disabled = false,
  variant = 'default'
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = React.useState(false);

  // Ensure React Portal targets client-side DOM after hydration
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  }, []);

  // Keep dropdown tracking triggers when open
  React.useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      // Use capturing to listen to scroll events anywhere in parent containers
      window.addEventListener('scroll', updateCoords, true);
    }
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen, updateCoords]);

  const currentOption = options.find(o => o.value === value);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const variantClass = variant === 'small' ? styles.small : '';

  // Render full selection tree through top-level Portal
  const dropdownPortal = mounted && isOpen ? (
    <>
      <div 
        className={styles.dropdownOverlay} 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
        }} 
      />
      <div 
        className={`${styles.dropdownMenu} ${variantClass}`} 
        style={{ 
          position: 'fixed',
          top: coords.top + (variant === 'small' ? 4 : 8),
          left: coords.left,
          width: coords.width,
          zIndex: 999999
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map(option => (
          <div
            key={option.value}
            className={`${styles.dropdownItem} ${option.value === value ? styles.active : ''}`}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </div>
        ))}
      </div>
    </>
  ) : null;

  return (
    <div className={`${styles.selectWrapper} ${variantClass} ${className || ''}`} style={style}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.selectBtn} ${disabled ? styles.disabled : ''}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) {
            updateCoords();
            setIsOpen(!isOpen);
          }
        }}
        disabled={disabled}
      >
        <span className={styles.selectedText}>
          {currentOption ? currentOption.label : placeholder}
        </span>
        <svg
          className={styles.chevron}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {mounted && isOpen && createPortal(dropdownPortal, document.body)}
    </div>
  );
}
