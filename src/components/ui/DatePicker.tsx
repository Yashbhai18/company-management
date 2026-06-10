"use client";
import React from 'react';
import styles from './datepicker.module.css';

interface DatePickerProps {
  value: string; // Expecting YYYY-MM-DD
  onChange: (val: string) => void;
  min?: string; // Expecting YYYY-MM-DD
  placeholder?: string;
  required?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function DatePicker({ value, onChange, min, placeholder = "Select Date", required }: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Internal view state: Month/Year we are currently looking at in the grid
  const [viewYear, setViewYear] = React.useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = React.useState(new Date().getMonth());

  // Sync view date with the external value when it is initialized/changed
  React.useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Click outside listener to close popup
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Helper: get number of days in month and starting weekday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(v => v - 1);
      setViewMonth(11);
    } else {
      setViewMonth(v => v - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(v => v + 1);
      setViewMonth(0);
    } else {
      setViewMonth(v => v + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    // Format nicely as YYYY-MM-DD using local date string pad Start
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    onChange(dateStr);
    setIsOpen(false);
  };

  const isDayDisabled = (day: number) => {
    if (!min) return false;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const currentStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    return currentStr < min;
  };

  const isDaySelected = (day: number) => {
    if (!value) return false;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const currentStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    return currentStr === value;
  };

  const isDayToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day &&
           today.getMonth() === viewMonth &&
           today.getFullYear() === viewYear;
  };

  // Render human readable display date
  const displayValue = React.useMemo(() => {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, [value]);

  // Build Grid Items
  const gridItems: React.ReactNode[] = [];
  
  // Prepend blank spaces for preceding month offset
  for (let i = 0; i < startWeekday; i++) {
    gridItems.push(<div key={`empty-${i}`} className={styles.emptyDay} />);
  }
  
  // Populate day numbers
  for (let day = 1; day <= daysInMonth; day++) {
    const disabled = isDayDisabled(day);
    const selected = isDaySelected(day);
    const today = isDayToday(day);

    gridItems.push(
      <button
        key={`day-${day}`}
        type="button"
        disabled={disabled}
        onClick={() => handleSelectDay(day)}
        className={`
          ${styles.dayCell} 
          ${selected ? styles.selectedDay : ""}
          ${disabled ? styles.disabledDay : ""}
          ${today ? styles.today : ""}
        `}
      >
        {day}
      </button>
    );
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {/* Trigger Input Box */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${styles.inputBox} ${isOpen ? styles.activeInput : ""}`}
      >
        {displayValue ? (
          <span>{displayValue}</span>
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
          <div className={styles.header}>
            <button type="button" onClick={handlePrevMonth} className={styles.navBtn}>
              <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className={styles.monthTitle}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button type="button" onClick={handleNextMonth} className={styles.navBtn}>
              <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className={styles.weekdays}>
            {WEEKDAYS.map(w => (
              <div key={w} className={styles.weekdayLabel}>{w}</div>
            ))}
          </div>

          <div className={styles.daysGrid}>
            {gridItems}
          </div>
        </div>
      )}
    </div>
  );
}
