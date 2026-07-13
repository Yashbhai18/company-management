'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './MentionDropdown.module.css';

export interface MentionUser {
  slackUserId: string;
  displayName: string;
  realName?: string;
  avatar?: string;
  isBot?: boolean;
  isSpecial?: boolean;
}

interface MentionDropdownProps {
  query: string;
  members: MentionUser[];
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

const SPECIAL_TAGS: MentionUser[] = [
  { slackUserId: 'here', displayName: 'here', realName: 'Notify every active member in this channel', isSpecial: true },
  { slackUserId: 'channel', displayName: 'channel', realName: 'Notify every member in this channel', isSpecial: true },
  { slackUserId: 'everyone', displayName: 'everyone', realName: 'Notify everyone in this workspace', isSpecial: true },
];

export function MentionDropdown({ query, members, onSelect, onClose, anchorRef }: MentionDropdownProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate fixed position from anchor element
  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;

    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [anchorRef]);

  const filteredMembers = React.useMemo(() => {
    const q = query.toLowerCase();
    const matchedSpecials = SPECIAL_TAGS.filter(tag =>
      tag.displayName.toLowerCase().startsWith(q)
    );
    const matchedUsers = members.filter(m => {
      const dName = (m.displayName || '').toLowerCase();
      const rName = (m.realName || '').toLowerCase();
      return dName.includes(q) || rName.includes(q);
    });
    return [...matchedSpecials, ...matchedUsers];
  }, [query, members]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredMembers.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredMembers.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % filteredMembers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filteredMembers[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredMembers, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (containerRef.current) {
      const selectedEl = containerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (filteredMembers.length === 0) return null;

  const style: React.CSSProperties = position
    ? { bottom: position.bottom, left: position.left, width: Math.max(position.width, 340) }
    : { bottom: 120, left: 16 };

  const content = (
    <div className={styles.dropdown} ref={containerRef} style={style}>
      {filteredMembers.map((member, idx) => (
        <div
          key={member.slackUserId}
          className={`${styles.row} ${idx === selectedIndex ? styles.selected : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(member); }}
          onMouseEnter={() => setSelectedIndex(idx)}
        >
          {member.isSpecial ? (
            <div className={styles.specialIcon}>@</div>
          ) : member.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.avatar} alt="" className={styles.avatar} />
          ) : (
            <div className={styles.avatarFallback}>{(member.displayName || 'U')[0].toUpperCase()}</div>
          )}
          <div className={styles.info}>
            <span className={styles.displayName}>{member.displayName}</span>
            {member.isBot && <span className={styles.botBadge}>APP</span>}
            {member.realName && member.realName !== member.displayName && (
              <span className={styles.realName}>{member.realName}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(content, document.body) : content;
}
