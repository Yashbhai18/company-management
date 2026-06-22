"use client";
import React from 'react';
import styles from './monthpicker.module.css';

interface MonthPickerProps {
  value: string; // Expecting YYYY-MM (e.g. "2026-06")
  onChange: (val: string) => void;
  placeholder?: string;
  disableFuture?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export default function MonthPicker({ value, onChange, placeholder = "Select Month", disableFuture = false }: MonthPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // View state: the year currently being looked at in the picker
  const [viewYear, setViewYear] = React.useState(() => {
    if (value) {
      const yearPart = parseInt(value.split('-')[0], 10);
      if (!isNaN(yearPart)) return yearPart;
    }
    return new Date().getFullYear();
  });

  const [isYearView, setIsYearView] = React.useState(false);
  // Year list starting year page
  const [pickerYearPage, setPickerYearPage] = React.useState(() => {
    return new Date().getFullYear();
  });

  // Sync viewYear when external value updates
  React.useEffect(() => {
    if (value) {
      const yearPart = parseInt(value.split('-')[0], 10);
      if (!isNaN(yearPart)) {
        setViewYear(yearPart);
      }
    }
  }, [value]);

  // Click outside listener to close the picker
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrevYear = () => {
    if (isYearView) {
      setPickerYearPage(p => p - 12);
    } else {
      setViewYear(y => y - 1);
    }
  };

  const handleNextYear = () => {
    const todayYear = new Date().getFullYear();
    if (disableFuture) {
      if (isYearView) {
        if (pickerYearPage + 12 - 5 > todayYear) return;
      } else {
        if (viewYear >= todayYear) return;
      }
    }
    if (isYearView) {
      setPickerYearPage(p => p + 12);
    } else {
      setViewYear(y => y + 1);
    }
  };

  const handleSelectMonth = (idx: number) => {
    if (disableFuture) {
      const today = new Date();
      if (viewYear > today.getFullYear() || (viewYear === today.getFullYear() && idx > today.getMonth())) {
        return;
      }
    }
    const monthVal = String(idx + 1).padStart(2, '0');
    onChange(`${viewYear}-${monthVal}`);
    setIsOpen(false);
  };

  const handleSelectYear = (y: number) => {
    if (disableFuture && y > new Date().getFullYear()) return;
    setViewYear(y);
    setIsYearView(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleThisMonth = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    onChange(`${y}-${m}`);
    setIsOpen(false);
  };

  // Human readable label (e.g. "June, 2026")
  const displayLabel = React.useMemo(() => {
    if (!value) return "";
    const parts = value.split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const mIdx = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && mIdx >= 0 && mIdx < 12) {
        return `${MONTH_NAMES[mIdx]}, ${y}`;
      }
    }
    return "";
  }, [value]);

  // Check if a specific month is currently selected
  const isMonthSelected = (idx: number) => {
    if (!value) return false;
    const monthVal = String(idx + 1).padStart(2, '0');
    return value === `${viewYear}-${monthVal}`;
  };

  // Check if a specific month is current month today
  const isMonthToday = (idx: number) => {
    const today = new Date();
    return today.getFullYear() === viewYear && today.getMonth() === idx;
  };

  // Check if a specific year is selected
  const isYearSelected = (y: number) => {
    if (!value) return false;
    const yearPart = parseInt(value.split('-')[0], 10);
    return yearPart === y;
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setIsYearView(false);
          if (value) {
            const yearPart = parseInt(value.split('-')[0], 10);
            if (!isNaN(yearPart)) setViewYear(yearPart);
          }
        }}
        className={`${styles.inputBox} ${isOpen ? styles.activeInput : ""}`}
      >
        {displayLabel ? (
          <span>{displayLabel}</span>
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}
        <svg className={styles.calIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className={styles.popover}>
          {/* Header */}
          <div className={styles.header}>
            <button type="button" onClick={handlePrevYear} className={styles.navBtn}>
              <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span
              className={styles.yearTitle}
              onClick={() => {
                if (!isYearView) {
                  setPickerYearPage(viewYear);
                }
                setIsYearView(!isYearView);
              }}
            >
              {isYearView ? "Select Year" : viewYear}
            </span>
            <button type="button" onClick={handleNextYear} className={styles.navBtn}>
              <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Body */}
          {isYearView ? (
            <div className={styles.grid}>
              {Array.from({ length: 12 }, (_, i) => {
                const yearVal = pickerYearPage - 5 + i;
                const isFutureYear = disableFuture && yearVal > new Date().getFullYear();
                return (
                  <button
                    key={yearVal}
                    type="button"
                    onClick={() => !isFutureYear && handleSelectYear(yearVal)}
                    className={`${styles.gridItem} ${isYearSelected(yearVal) ? styles.selectedItem : ""} ${isFutureYear ? styles.disabledItem : ""}`}
                    disabled={isFutureYear}
                  >
                    {yearVal}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.grid}>
              {MONTH_SHORT_NAMES.map((m, idx) => {
                const today = new Date();
                const isFutureMonth = disableFuture && (viewYear > today.getFullYear() || (viewYear === today.getFullYear() && idx > today.getMonth()));
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => !isFutureMonth && handleSelectMonth(idx)}
                    className={`
                      ${styles.gridItem} 
                      ${isMonthSelected(idx) ? styles.selectedItem : ""}
                      ${isMonthToday(idx) ? styles.todayItem : ""}
                      ${isFutureMonth ? styles.disabledItem : ""}
                    `}
                    disabled={isFutureMonth}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer Actions */}
          <div className={styles.footer}>
            <button
              type="button"
              onClick={handleClear}
              className={`${styles.footerBtn} ${styles.clearBtn}`}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleThisMonth}
              className={`${styles.footerBtn} ${styles.todayBtn}`}
            >
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
