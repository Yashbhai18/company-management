"use client";
import React from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import api from '../../../lib/api';
import styles from './tasks.module.css';
import { useDialog } from '../../../components/ui/DialogProvider';
import CustomSelect from '../../../components/ui/CustomSelect';
import { useSocket } from '../../../hooks/useSocket';

interface UserRef {
  _id: string;
  name: string;
  username?: string;
  avatar?: string;
  role: string;
}

interface TeamRef {
  _id: string;
  name: string;
  members: UserRef[];
}

interface TaskComment {
  _id?: string;
  userId: UserRef;
  text: string;
  createdAt: string;
}

interface TaskItem {
  _id: string;
  title: string;
  description?: string;
  status: string;
  assignedBy: UserRef;
  assignedTo: UserRef;
  teamId?: { _id: string; name: string };
  completedAt?: string;
  startDate?: string;
  dueDate?: string;
  reminderAt?: string;
  checklist?: Array<{ text: string; completed: boolean }>;
  attachments?: Array<{ url: string; name: string }>;
  revisionNotes?: string;
  comments?: TaskComment[];
  createdAt: string;
}

interface GroupedTask {
  _id: string;
  title: string;
  description?: string;
  teamId?: { _id: string; name: string };
  createdAt: string;
  assignedBy: UserRef;
  assignments: Array<{
    taskId: string;
    assignedTo: UserRef;
    status: 'pending' | 'completed';
    completedAt?: string;
  }>;
}

export default function TasksPage() {
  const { confirm } = useDialog();
  const socket = useSocket();
  const searchParams = useSearchParams();
  const currentView = searchParams.get('view') || 'kanban';

  const [me, setMe] = React.useState<any>(null);
  const [tasks, setTasks] = React.useState<TaskItem[]>([]);
  const [members, setMembers] = React.useState<UserRef[]>([]);
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);

  // Timeline states
  const [timelineDate, setTimelineDate] = React.useState(() => new Date());

  // Kanban states
  const [stages, setStages] = React.useState<string[]>(['backlog', 'in progress', 'revision', 'completed']);
  const [showAddStage, setShowAddStage] = React.useState(false);
  const [newStageName, setNewStageName] = React.useState('');
  const [draggedOverStage, setDraggedOverStage] = React.useState<string | null>(null);
  const [activeMenuStage, setActiveMenuStage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
    const handleOutsideMenuClick = () => {
      setActiveMenuStage(null);
    };
    window.addEventListener('click', handleOutsideMenuClick);
    return () => window.removeEventListener('click', handleOutsideMenuClick);
  }, []);

  // Modals Trigger toggles
  const [showAssignTask, setShowAssignTask] = React.useState(false);

  // Composite Inline-Team Creation / Assignment State
  const [teamMode, setTeamMode] = React.useState<'existing' | 'new'>('existing');
  const [newTeamName, setNewTeamName] = React.useState('');
  const [selectedTeamMembers, setSelectedTeamMembers] = React.useState<string[]>([]);
  const [submittingTeam, setSubmittingTeam] = React.useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = React.useState('');

  // Assign Task State
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskDesc, setTaskDesc] = React.useState('');
  const [assignType, setAssignType] = React.useState<'all' | 'team' | 'individual'>('individual');
  const [selectedTargetId, setSelectedTargetId] = React.useState('');
  const [submittingTask, setSubmittingTask] = React.useState(false);

  // New Assignment Fields
  const [startDate, setStartDate] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [reminderAt, setReminderAt] = React.useState('');
  const [checklist, setChecklist] = React.useState<Array<{ text: string; completed: boolean }>>([]);
  const [newChecklistItem, setNewChecklistItem] = React.useState('');
  const [attachments, setAttachments] = React.useState<Array<{ url: string; name: string }>>([]);
  const [attachmentUrl, setAttachmentUrl] = React.useState('');
  const [attachmentText, setAttachmentText] = React.useState('');
  const [viewingTask, setViewingTask] = React.useState<TaskItem | null>(null);

  // Revision Request State
  const [showRevisionDialog, setShowRevisionDialog] = React.useState(false);
  const [pendingRevisionTaskId, setPendingRevisionTaskId] = React.useState('');
  const [pendingRevisionNotes, setPendingRevisionNotes] = React.useState('');

  // Animation-Closing states
  const [isClosingAssign, setIsClosingAssign] = React.useState(false);
  const [isClosingAddStage, setIsClosingAddStage] = React.useState(false);
  const [isClosingViewing, setIsClosingViewing] = React.useState(false);
  const [isClosingRevision, setIsClosingRevision] = React.useState(false);

  // Comments & Task Editing States
  const [commentText, setCommentText] = React.useState('');
  const [submittingComment, setSubmittingComment] = React.useState(false);

  const [isEditingTask, setIsEditingTask] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');
  const [editAssignedTo, setEditAssignedTo] = React.useState('');
  const [editStart, setEditStart] = React.useState('');
  const [editDue, setEditDue] = React.useState('');
  const [editReminder, setEditReminder] = React.useState('');
  const [submittingEdit, setSubmittingEdit] = React.useState(false);
  const [editChecklist, setEditChecklist] = React.useState<Array<{ text: string; completed: boolean }>>([]);
  const [editNewChecklistItem, setEditNewChecklistItem] = React.useState('');
  const [editAttachments, setEditAttachments] = React.useState<Array<{ url: string; name: string }>>([]);
  const [editAttachmentUrl, setEditAttachmentUrl] = React.useState('');
  const [editAttachmentText, setEditAttachmentText] = React.useState('');

  const closeAssignTask = () => {
    setIsClosingAssign(true);
    setTimeout(() => {
      setShowAssignTask(false);
      setIsClosingAssign(false);
    }, 250);
  };

  const closeAddStage = () => {
    setIsClosingAddStage(true);
    setTimeout(() => {
      setShowAddStage(false);
      setIsClosingAddStage(false);
    }, 250);
  };

  const closeViewingTask = () => {
    setIsClosingViewing(true);
    setTimeout(() => {
      setViewingTask(null);
      setIsClosingViewing(false);
      setIsEditingTask(false);
    }, 250);
  };

  const startEditingTask = () => {
    if (!viewingTask) return;
    setEditTitle(viewingTask.title);
    setEditDesc(viewingTask.description || '');
    setEditAssignedTo(viewingTask.assignedTo._id);
    
    // Convert dates to local datetime-local format 'YYYY-MM-DDTHH:MM'
    const toLocalDateTimeString = (dateStr?: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      return localISOTime;
    };
    
    setEditStart(toLocalDateTimeString(viewingTask.startDate));
    setEditDue(toLocalDateTimeString(viewingTask.dueDate));
    setEditReminder(toLocalDateTimeString(viewingTask.reminderAt));
    setEditChecklist(viewingTask.checklist || []);
    setEditNewChecklistItem('');
    setEditAttachments(viewingTask.attachments || []);
    setEditAttachmentUrl('');
    setEditAttachmentText('');
    setIsEditingTask(true);
  };

  const cancelEditingTask = () => {
    setIsEditingTask(false);
  };

  const addEditChecklistItem = () => {
    if (!editNewChecklistItem.trim()) return;
    setEditChecklist(prev => [...prev, { text: editNewChecklistItem.trim(), completed: false }]);
    setEditNewChecklistItem('');
  };

  const removeEditChecklistItem = (index: number) => {
    setEditChecklist(prev => prev.filter((_, i) => i !== index));
  };

  const addEditAttachment = () => {
    if (!editAttachmentUrl.trim() || !editAttachmentText.trim()) return;
    setEditAttachments(prev => [...prev, { url: editAttachmentUrl.trim(), name: editAttachmentText.trim() }]);
    setEditAttachmentUrl('');
    setEditAttachmentText('');
  };

  const removeEditAttachment = (index: number) => {
    setEditAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveTaskEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingTask) return;
    if (!editTitle.trim()) {
      handleShowAlert('error', 'Task title is required.');
      return;
    }

    try {
      setSubmittingEdit(true);
      const res = await api.patch(`/tasks/${viewingTask._id}`, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        assignedTo: editAssignedTo,
        startDate: editStart || null,
        dueDate: editDue || null,
        reminderAt: editReminder || null,
        checklist: editChecklist,
        attachments: editAttachments
      });

      setViewingTask(res.data.task);
      setTasks(prev => prev.map(t => t._id === viewingTask._id ? res.data.task : t));
      setIsEditingTask(false);
      handleShowAlert('success', 'Task updated successfully!');
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Failed to update task.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !viewingTask) return;

    try {
      setSubmittingComment(true);
      const res = await api.post(`/tasks/${viewingTask._id}/comments`, { text: commentText.trim() });
      setViewingTask(res.data.task);
      setTasks(prev => prev.map(t => t._id === viewingTask._id ? res.data.task : t));
      setCommentText('');
      handleShowAlert('success', 'Comment posted!');
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Failed to add comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const closeRevisionDialog = () => {
    setIsClosingRevision(true);
    setTimeout(() => {
      setShowRevisionDialog(false);
      setPendingRevisionTaskId('');
      setIsClosingRevision(false);
    }, 250);
  };

  // General Feedback Alert system
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleToggleChecklistItem = async (task: TaskItem, itemIdx: number) => {
    if (!task.checklist) return;
    
    const updatedChecklist = task.checklist.map((item, idx) => 
      idx === itemIdx ? { ...item, completed: !item.completed } : item
    );
    
    const updatedTask = { ...task, checklist: updatedChecklist };
    setTasks(prev => prev.map(t => t._id === task._id ? updatedTask : t));
    setViewingTask(updatedTask);
    
    try {
      await api.patch(`/tasks/${task._id}`, { checklist: updatedChecklist });
    } catch (err) {
      console.error('Failed to update checklist', err);
      handleShowAlert('error', 'Failed to update checklist status.');
      loadData();
    }
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklist(prev => [...prev, { text: newChecklistItem.trim(), completed: false }]);
    setNewChecklistItem('');
  };

  const removeChecklistItem = (index: number) => {
    setChecklist(prev => prev.filter((_, i) => i !== index));
  };

  const addAttachment = () => {
    if (!attachmentUrl.trim() || !attachmentText.trim()) return;
    setAttachments(prev => [...prev, { url: attachmentUrl.trim(), name: attachmentText.trim() }]);
    setAttachmentUrl('');
    setAttachmentText('');
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, tasksRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/tasks')
      ]);
      
      setMe(userRes.data.user);
      setTasks(tasksRes.data);

      if (userRes.data.org && userRes.data.org.kanbanStages) {
        setStages(userRes.data.org.kanbanStages);
      }

      const userRole = userRes.data.user.role;
      const isAdminUser = userRole === 'admin' || userRole === 'super_admin';

      if (isAdminUser) {
        const [usersRes, teamsRes] = await Promise.all([
          api.get('/users'),
          api.get('/teams')
        ]);
        const allUsers = usersRes.data.users || [];
        setMembers(allUsers.filter((u: any) => u.role !== 'super_admin'));
        setTeams(teamsRes.data);
        
        if (teamsRes.data.length === 0) {
          setTeamMode('new');
        } else {
          setTeamMode('existing');
        }
      } else {
        // Employees fetch their belonging teams securely from backend!
        const teamsRes = await api.get('/teams');
        setTeams(teamsRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard contents', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshTasks = React.useCallback(async () => {
    try {
      const res = await api.get('/tasks');
      // Updates local tasks silently without triggering the fullscreen skeleton loading states!
      setTasks(res.data);
    } catch (err) {
      console.error('Silent refresh failed', err);
    }
  }, []);

  // A: Live socket listener (refreshes when system issues websocket signals)
  React.useEffect(() => {
    if (!socket) return;
    const handleRefreshTrigger = () => refreshTasks();
    socket.on('notification:new', handleRefreshTrigger);
    return () => {
      socket.off('notification:new', handleRefreshTrigger);
    };
  }, [socket, refreshTasks]);

  // B: Silent background fetch polling loop (every 5 seconds)
  React.useEffect(() => {
    const interval = setInterval(() => {
      refreshTasks();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshTasks]);

  const handleShowAlert = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Toggle selection in team packager checkbox arrays
  const toggleMemberSelect = (uid: string) => {
    setSelectedTeamMembers(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // Submit: Dispatch Tasks API (with optional inline Team assembling)
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!taskTitle.trim()) {
      handleShowAlert('error', 'A task title is required.');
      return;
    }
    
    let finalTargetId = selectedTargetId;

    try {
      setSubmittingTask(true);

      // 1. Check if we need to assemble an inline team first!
      if (assignType === 'team' && teamMode === 'new') {
        if (!newTeamName.trim() || selectedTeamMembers.length === 0) {
          handleShowAlert('error', 'Specify a Team Name and select at least one employee to add to the team.');
          setSubmittingTask(false);
          return;
        }
        
        const newTeamRes = await api.post('/teams', { 
          name: newTeamName.trim(), 
          members: selectedTeamMembers 
        });
        
        finalTargetId = newTeamRes.data._id;
      } 
      else if (assignType !== 'all' && !selectedTargetId) {
        handleShowAlert('error', 'Please select an assignment target.');
        setSubmittingTask(false);
        return;
      }

      // 2. Dispatch the Tasks!
      const res = await api.post('/tasks', {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        targetType: assignType,
        targetId: assignType === 'all' ? undefined : finalTargetId,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        reminderAt: reminderAt || undefined,
        checklist,
        attachments
      });

      handleShowAlert('success', res.data.message || 'Tasks successfully dispatched!');
      
      setTaskTitle('');
      setTaskDesc('');
      setSelectedTargetId('');
      setNewTeamName('');
      setSelectedTeamMembers([]);
      setStartDate('');
      setDueDate('');
      setReminderAt('');
      setChecklist([]);
      setAttachments([]);
      setShowAssignTask(false);
      
      loadData();
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Dispatched execution failed.');
    } finally {
      setSubmittingTask(false);
    }
  };

  // Employee Actions: Complete Task
  const handleCompleteTask = async (taskId: string) => {
    try {
      await api.patch(`/tasks/${taskId}/complete`);
      handleShowAlert('success', 'Task completed! Management has been notified.');
      loadData();
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Completion lock failed.');
    }
  };

  // Admin Actions: Purge packaging team
  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!await confirm(`Are you sure you want to dissolve "${teamName}"?`, 'Dissolve Team')) return;
    try {
      await api.delete(`/teams/${teamId}`);
      handleShowAlert('success', 'Team dissolved.');
      loadData();
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Dissolve failed.');
    }
  };

  const isAdmin = me && (me.role === 'admin' || me.role === 'super_admin');

  const handleCreateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;
    try {
      const res = await api.patch('/tasks/stages', { stage: newStageName.trim() });
      setStages(res.data.stages);
      setShowAddStage(false);
      setNewStageName('');
      handleShowAlert('success', 'Custom stage created successfully!');
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Failed to create stage.');
    }
  };

  const handleDeleteStage = async (stageName: string) => {
    const isStandardStage = ['backlog', 'in progress', 'revision', 'completed'].includes(stageName.toLowerCase());
    const confirmMsg = isStandardStage 
      ? `Are you sure you want to delete the standard "${stageName}" stage? This might complicate task tracking.`
      : `Are you sure you want to delete the "${stageName}" custom stage? This action cannot be undone.`;

    const ok = await confirm(confirmMsg, 'Delete Stage');

    if (!ok) return;

    try {
      const res = await api.delete(`/tasks/stages/${encodeURIComponent(stageName)}`);
      setStages(res.data.stages);
      handleShowAlert('success', `Stage "${stageName}" removed successfully.`);
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Failed to delete stage.');
    }
  };

  const handleMoveTask = async (taskId: string, targetStage: string) => {
    const taskObj = tasks.find(t => t._id === taskId);
    const isSuperAdmin = me && (me.role === 'admin' || me.role === 'super_admin');
    
    // Detect transitioning task from Completed back to Revision
    if (taskObj && isSuperAdmin && taskObj.status.toLowerCase() === 'completed' && targetStage.toLowerCase() === 'revision') {
      setPendingRevisionTaskId(taskId);
      setPendingRevisionNotes('');
      setShowRevisionDialog(true);
      return;
    }

    try {
      await api.patch(`/tasks/${taskId}/stage`, { stage: targetStage });
      setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: targetStage } : t));
      handleShowAlert('success', `Task moved to ${targetStage}!`);
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Failed to move task.');
    }
  };

  const submitRevisionTask = async () => {
    if (!pendingRevisionNotes.trim()) {
      handleShowAlert('error', 'Revision description is required to submit.');
      return;
    }
    
    try {
      await api.patch(`/tasks/${pendingRevisionTaskId}/stage`, { 
        stage: 'revision', 
        revisionNotes: pendingRevisionNotes.trim() 
      });
      
      setTasks(prev => prev.map(t => 
        t._id === pendingRevisionTaskId 
          ? { ...t, status: 'revision', revisionNotes: pendingRevisionNotes.trim() } 
          : t
      ));
      
      handleShowAlert('success', `Task successfully returned to Revision with feedback.`);
      setShowRevisionDialog(false);
      setPendingRevisionTaskId('');
      setPendingRevisionNotes('');
    } catch (err: any) {
      handleShowAlert('error', err.response?.data?.message || 'Failed to push back into revision.');
    }
  };

  const getCleanStatus = (status?: string) => {
    if (!status) return 'backlog';
    const s = status.toLowerCase();
    if (s === 'pending') return 'backlog';
    return s;
  };

  const getStageColor = (stageName: string) => {
    return '#ea580c'; // Matches reference photo: unified orange stage dots
  };

  const formatTime = (dStr?: string) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderTimelineView = () => {
    const year = timelineDate.getFullYear();
    const month = timelineDate.getMonth();

    const handlePrevMonth = () => {
      setTimelineDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
      setTimelineDate(new Date(year, month + 1, 1));
    };

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const getDayOfWeekLetter = (day: number) => {
      const date = new Date(year, month, day);
      const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      return days[date.getDay()];
    };

    // Filter tasks that overlap with the selected month
    const timelineTasks = tasks.filter(task => {
      if (!task.dueDate) return false;
      const start = task.startDate ? new Date(task.startDate) : new Date(task.createdAt);
      const due = new Date(task.dueDate);
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
      return start <= endOfMonth && due >= startOfMonth;
    });

    const undatedTasks = tasks.filter(task => !task.dueDate);

    const getStatusColor = (status: string) => {
      const s = status.toLowerCase();
      if (s === 'completed') return '#22c55e'; // Green
      if (s === 'revision') return '#ef4444'; // Red
      if (s === 'in progress') return '#f97316'; // Orange
      return '#64748b'; // Slate for backlog/pending
    };

    return (
      <div className={styles.timelineContainer}>
        {/* Month controller */}
        <div className={styles.timelineControls}>
          <div className={styles.monthSelector}>
            <button type="button" onClick={handlePrevMonth} className={styles.navBtn} title="Previous Month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.navIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 className={styles.timelineMonthTitle}>
              {timelineDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <button type="button" onClick={handleNextMonth} className={styles.navBtn} title="Next Month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.navIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
          <button 
            type="button" 
            onClick={() => setTimelineDate(new Date())} 
            className={styles.secondaryBtn} 
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            Today
          </button>
        </div>

        {/* The Grid Board */}
        <div className={styles.timelineGridWrapper}>
          <div 
            className={styles.timelineGrid} 
            style={{ 
              gridTemplateColumns: `260px repeat(${daysInMonth}, minmax(40px, 1fr))` 
            }}
          >
            {/* Header row */}
            <div className={styles.timelineHeaderCell} style={{ borderBottom: '2px solid var(--border-color)' }}>
              <strong>Task Directive</strong>
            </div>
            {daysArray.map(day => {
              const dayOfWeek = getDayOfWeekLetter(day);
              const isWeekend = dayOfWeek === 'Su' || dayOfWeek === 'Sa';
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

              return (
                <div 
                  key={day} 
                  className={`${styles.timelineHeaderCell} ${isWeekend ? styles.weekendCell : ''} ${isToday ? styles.todayCell : ''}`}
                  style={{ borderBottom: '2px solid var(--border-color)' }}
                >
                  <span className={styles.timelineDayNum}>{day.toString().padStart(2, '0')}</span>
                  <span className={styles.timelineDayName}>{dayOfWeek}</span>
                </div>
              );
            })}

            {/* Task rows */}
            {timelineTasks.length === 0 ? (
              <div 
                className={styles.timelineEmptyRow} 
                style={{ gridColumn: `1 / span ${daysInMonth + 1}` }}
              >
                No tasks scheduled for this month.
              </div>
            ) : (
              timelineTasks.map(task => {
                const start = task.startDate ? new Date(task.startDate) : new Date(task.createdAt);
                const due = new Date(task.dueDate!);
                
                let startDay = 1;
                if (start.getFullYear() === year && start.getMonth() === month) {
                  startDay = start.getDate();
                }
                
                let endDay = daysInMonth;
                if (due.getFullYear() === year && due.getMonth() === month) {
                  endDay = due.getDate();
                }

                // Clamp days range
                startDay = Math.max(1, Math.min(daysInMonth, startDay));
                endDay = Math.max(startDay, Math.min(daysInMonth, endDay));

                const colStart = startDay + 1; // offset by 1 for left header column
                const colSpan = endDay - startDay + 1;

                const statusColor = getStatusColor(task.status);
                
                return (
                  <React.Fragment key={task._id}>
                    {/* Row task details */}
                    <div 
                      className={styles.timelineTaskLabel} 
                      onClick={() => setViewingTask(task)}
                    >
                      <div className={styles.timelineTaskAvatar} title={task.assignedTo.name}>
                        {task.assignedTo.avatar ? (
                          <img src={task.assignedTo.avatar} alt="" className={styles.fullImgCover} />
                        ) : (
                          task.assignedTo.name.charAt(0)
                        )}
                      </div>
                      <div className={styles.timelineTaskText}>
                        <span className={styles.timelineTaskTitle}>{task.title}</span>
                        <span className={styles.timelineTaskSubtitle}>{task.assignedTo.name}</span>
                      </div>
                    </div>

                    {/* Timeline Bar spanning across dates */}
                    <div 
                      className={styles.timelineBarCell} 
                      style={{ 
                        gridColumn: `${colStart} / span ${colSpan}` 
                      }}
                    >
                      <div 
                        className={styles.timelineBar}
                        onClick={() => setViewingTask(task)}
                        style={{ 
                          backgroundColor: statusColor,
                          boxShadow: `0 2px 6px ${statusColor}33`
                        }}
                      >
                        <span className={styles.timelineBarLabel}>
                          {task.title} ({Math.round(colSpan)} {colSpan === 1 ? 'day' : 'days'})
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>

        {/* Section: Undated Tasks list */}
        {undatedTasks.length > 0 && (
          <div className={styles.undatedContainer}>
            <h3 className={styles.undatedTitle}>
              Tasks without Dates ({undatedTasks.length})
            </h3>
            <div className={styles.undatedList}>
              {undatedTasks.map(task => (
                <div 
                  key={task._id} 
                  className={styles.undatedCard}
                  onClick={() => setViewingTask(task)}
                >
                  <div className={styles.undatedCardLeft}>
                    <span className={styles.undatedCardTitle}>{task.title}</span>
                    <span className={styles.undatedCardUser}>Assigned to {task.assignedTo.name}</span>
                  </div>
                  <span 
                    className={styles.undatedCardBadge}
                    style={{ background: getStatusColor(task.status) + '1a', color: getStatusColor(task.status) }}
                  >
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* HEADER SECTION */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Task Matrix</h1>
          <p className={styles.subtitle}>
            {isAdmin ? 'Package active subsets and dispatch task orders across the workspace.' : 'Verify assignment logs and finalize assigned workloads.'}
          </p>
        </div>
        {isAdmin && (
          <div className={styles.actions}>
            <button onClick={() => setShowAssignTask(true)} className={styles.primaryBtn}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.btnIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Assign Task
            </button>
          </div>
        )}
      </header>

      {/* ALERT PROMPTS */}
      {feedback && (
        <div className={`${styles.alert} ${feedback.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
          {feedback.msg}
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonWrap}>
          <div className={styles.loader}></div>
          <p>Parsing records...</p>
        </div>
      ) : (
        <main className={styles.mainContent}>
          {currentView === 'timeline' ? (
            renderTimelineView()
          ) : (
            /* LEFT SECTION: KANBAN BOARD */
            <section className={styles.taskPanel} style={{ background: 'none', border: 'none', backdropFilter: 'none', padding: 0, overflowX: 'auto' }}>
              <div className={styles.kanbanBoard}>
                {stages.map((stage, idx) => {
                  const cleanStage = stage.toLowerCase();
                  const stageTasks = tasks.filter(t => getCleanStatus(t.status) === cleanStage);
                  const isDraggedOver = draggedOverStage === cleanStage;
                  
                  return (
                    <div key={stage} className={styles.columnWrapper}>
                      <div 
                        className={`${styles.kanbanColumn} ${isDraggedOver ? styles.dragOver : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (draggedOverStage !== cleanStage) setDraggedOverStage(cleanStage);
                        }}
                        onDragLeave={() => setDraggedOverStage(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDraggedOverStage(null);
                          const stageIdxStr = e.dataTransfer.getData("stageIdx");
                          const taskId = e.dataTransfer.getData("taskId");
                          if (stageIdxStr) {
                            const fromIdx = parseInt(stageIdxStr, 10);
                            const toIdx = idx;
                            if (!isNaN(fromIdx) && fromIdx !== toIdx) {
                              const updatedStages = [...stages];
                              const [removed] = updatedStages.splice(fromIdx, 1);
                              updatedStages.splice(toIdx, 0, removed);
                              setStages(updatedStages);
                              api.patch('/tasks/stages/reorder', { stages: updatedStages })
                                .then(() => {
                                  handleShowAlert('success', 'Stage order updated!');
                                })
                                .catch(err => {
                                  console.error('Failed to reorder stages', err);
                                  handleShowAlert('error', 'Failed to save stage order.');
                                  loadData();
                                });
                            }
                          } else if (taskId) {
                            handleMoveTask(taskId, stage);
                          }
                        }}
                      >
                        <div 
                          className={styles.columnHeader}
                          draggable={isAdmin}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("stageIdx", idx.toString());
                          }}
                          style={{ cursor: isAdmin ? 'grab' : 'default' }}
                        >
                          <div className={styles.columnTitleWrap}>
                            <div className={styles.columnDot} style={{ background: getStageColor(stage) }}></div>
                            <h3 className={styles.columnTitle}>{stage}</h3>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
                            <span className={styles.columnCount}>{stageTasks.length}</span>
                            {isAdmin && (
                              <>
                                <button 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveMenuStage(activeMenuStage === stage ? null : stage);
                                  }}
                                  className={styles.menuBtn}
                                  title="Stage options"
                                >
                                  •••
                                </button>
                                {activeMenuStage === stage && (
                                  <div className={styles.columnDropdown} onClick={(e) => e.stopPropagation()}>
                                    <button 
                                      onClick={() => {
                                        handleDeleteStage(stage);
                                        setActiveMenuStage(null);
                                      }}
                                    >
                                      Delete Stage
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      
                        <div className={styles.columnTasksList}>
                          {stageTasks.length === 0 ? (
                            <div className={styles.emptyColumnState}>No assignments here.</div>
                          ) : (
                            stageTasks.map((task) => {
                              const isMine = task.assignedTo._id === me?._id;
                              const canMove = isAdmin || isMine;
                              
                              return (
                                <div 
                                  key={task._id} 
                                  className={styles.kanbanCard}
                                  draggable={canMove}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("taskId", task._id);
                                  }}
                                  onClick={() => setViewingTask(task)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <div className={styles.cardHeader}>
                                    <h4 className={styles.cardTitle}>{task.title}</h4>
                                  </div>
                                  {task.description && <p className={styles.cardDesc}>{task.description}</p>}

                                  {/* Task Metadata Indicators */}
                                  {(task.dueDate || (task.checklist && task.checklist.length > 0) || (task.attachments && task.attachments.length > 0)) && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                      {task.dueDate && (
                                        <span style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(234, 88, 12, 0.08)', color: '#ea580c', padding: '0.2rem 0.55rem', borderRadius: '20px', fontWeight: 600 }}>
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '10px', height: '10px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6v6m-3-3h6" /></svg>
                                          {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                      {task.checklist && task.checklist.length > 0 && (
                                        <span style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(234, 88, 12, 0.08)', color: '#ea580c', padding: '0.2rem 0.55rem', borderRadius: '20px', fontWeight: 600 }}>
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '10px', height: '10px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                          {task.checklist.filter(c => c.completed).length}/{task.checklist.length}
                                        </span>
                                      )}
                                      {task.attachments && task.attachments.map((att, attIdx) => (
                                        <a 
                                          key={attIdx}
                                          href={att.url.startsWith('http') ? att.url : `https://${att.url}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          style={{
                                            fontSize: '0.7rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            background: 'rgba(234, 88, 12, 0.08)',
                                            color: '#ea580c',
                                            padding: '0.2rem 0.55rem',
                                            borderRadius: '20px',
                                            fontWeight: 600,
                                            textDecoration: 'none'
                                          }}
                                        >
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '10px', height: '10px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                                          {att.name}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  
                                  <div className={styles.cardMetaRow}>
                                    <div className={styles.cardAssignee}>
                                      <div className={styles.cardAvatar} title={task.assignedTo.name}>
                                        {task.assignedTo.avatar ? (
                                          <img src={task.assignedTo.avatar} alt="" className={styles.fullImgCover} />
                                        ) : (
                                          task.assignedTo.name.charAt(0)
                                        )}
                                      </div>
                                      <span className={styles.cardAssigneeName}>{isMine ? 'You' : task.assignedTo.name}</span>
                                    </div>
                                    <span className={styles.cardDate}>{formatTime(task.createdAt)}</span>
                                  </div>

                                  {canMove && (
                                    <div className={styles.cardControls} onClick={(e) => e.stopPropagation()}>
                                      <CustomSelect 
                                        variant="small"
                                        value={stage} 
                                        onChange={(val) => handleMoveTask(task._id, val)}
                                        options={stages.map(s => ({ value: s, label: `Move: ${s}` }))}
                                        placeholder="Move stage..."
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                      {idx === 0 && isAdmin && (
                        <div className={styles.addStageColumn} onClick={() => setShowAddStage(true)}>
                          <div className={styles.addStagePlus}>+</div>
                          <span className={styles.addStageText}>Create Stage</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      )}

      {/* ===================== MODAL: ASSIGN TASK ===================== */}
      {mounted && showAssignTask && createPortal(
        <div className={`${styles.backdrop} ${isClosingAssign ? styles.closingBackdrop : ''}`} onClick={closeAssignTask}>
          <div className={`${styles.taskModalDrawer} ${isClosingAssign ? styles.closingTaskModalDrawer : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '18px', height: '18px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                Assign Task Directive
              </h3>
              <button onClick={closeAssignTask} className={styles.modalCloseBtn}>×</button>
            </div>
            <form onSubmit={handleAssignTask} className={styles.taskModalDrawerForm}>
              <div className={styles.modalScrollableBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Direct Target</label>
                  <div className={styles.radioGroup}>
                    <label className={`${styles.radioBtn} ${assignType === 'individual' ? styles.radioActive : ''}`}>
                      <input 
                        type="radio" 
                        name="assignType" 
                        checked={assignType === 'individual'} 
                        onChange={() => { setAssignType('individual'); setSelectedTargetId(''); }} 
                      />
                      Single Employee
                    </label>
                    <label className={`${styles.radioBtn} ${assignType === 'team' ? styles.radioActive : ''}`}>
                      <input 
                        type="radio" 
                        name="assignType" 
                        checked={assignType === 'team'} 
                        onChange={() => { setAssignType('team'); setSelectedTargetId(''); }} 
                      />
                      Custom Team
                    </label>
                    <label className={`${styles.radioBtn} ${assignType === 'all' ? styles.radioActive : ''}`}>
                      <input 
                        type="radio" 
                        name="assignType" 
                        checked={assignType === 'all'} 
                        onChange={() => { setAssignType('all'); setSelectedTargetId(''); }} 
                      />
                      Whole Org
                    </label>
                  </div>
                </div>

                {/* Target dropdown selector context */}
                {assignType === 'individual' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Select Employee</label>
                    <CustomSelect 
                      value={selectedTargetId}
                      onChange={setSelectedTargetId}
                      placeholder="-- Choose Assignee --"
                      options={members.map(u => ({ value: u._id, label: `${u.name} (@${u.username || 'member'})` }))}
                    />
                  </div>
                )}

                {assignType === 'team' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Team Selection</label>
                      <div className={styles.radioGroup}>
                        <label className={`${styles.radioBtn} ${teamMode === 'existing' ? styles.radioActive : ''} ${teams.length === 0 ? styles.radioDisabled : ''}`}>
                          <input 
                            type="radio" 
                            disabled={teams.length === 0}
                            name="teamMode" 
                            checked={teamMode === 'existing'} 
                            onChange={() => setTeamMode('existing')} 
                          />
                          Use Existing
                        </label>
                        <label className={`${styles.radioBtn} ${teamMode === 'new' ? styles.radioActive : ''}`}>
                          <input 
                            type="radio" 
                            name="teamMode" 
                            checked={teamMode === 'new'} 
                            onChange={() => setTeamMode('new')} 
                          />
                          Create New Team
                        </label>
                      </div>
                    </div>

                    {teamMode === 'existing' ? (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Select Target Team</label>
                        <CustomSelect 
                          value={selectedTargetId}
                          onChange={setSelectedTargetId}
                          placeholder="-- Choose Team Group --"
                          options={teams.map(t => ({ value: t._id, label: `${t.name} (${t.members.length} members)` }))}
                        />
                      </div>
                    ) : (
                      <>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Team Name</label>
                          <input
                            type="text"
                            className={styles.formInput}
                            placeholder="e.g., Support Squad, Creative Hub"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            maxLength={80}
                            required
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Select Employees ({selectedTeamMembers.length} selected)</label>
                          
                          {/* Interactive Search Portal */}
                          <div className={styles.searchWrapper}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.searchIcon}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input 
                              type="text"
                              className={styles.formInputSearch}
                              placeholder="Search by name or @username..."
                              value={memberSearchQuery}
                              onChange={(e) => setMemberSearchQuery(e.target.value)}
                            />
                          </div>

                          <div className={styles.scrollPicker}>
                            {(() => {
                              const q = memberSearchQuery.toLowerCase().trim();
                              const filtered = members.filter(m => 
                                m.name.toLowerCase().includes(q) || 
                                (m.username && m.username.toLowerCase().includes(q))
                              );

                              if (filtered.length === 0) {
                                return <div className={styles.pickerEmpty}>No matching employees found.</div>;
                              }

                              return filtered.map((member) => (
                                <label key={member._id} className={styles.pickerItem}>
                                  <input
                                    type="checkbox"
                                    className={styles.checkboxInput}
                                    checked={selectedTeamMembers.includes(member._id)}
                                    onChange={() => toggleMemberSelect(member._id)}
                                  />
                                  <div className={styles.pickerAvatar}>
                                    {member.avatar ? (
                                      <img src={member.avatar} alt="" className={styles.fullImgCover} />
                                    ) : (
                                      member.name.charAt(0)
                                    )}
                                  </div>
                                  <div className={styles.pickerInfo}>
                                    <span className={styles.pickerName}>{member.name}</span>
                                    <span className={styles.pickerSub}>@{member.username || 'member'}</span>
                                  </div>
                                </label>
                              ));
                            })()}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Task Header / Title</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g., Update client proposals, finalize billing"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    maxLength={200}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Operational Description (Optional)</label>
                  <textarea
                    className={styles.formTextarea}
                    placeholder="Outline deliverables, deadlines, or procedural notes..."
                    rows={2}
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    maxLength={900}
                  />
                </div>

                {/* Dates Grid */}
                <div className={styles.dateGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Start Date</label>
                    <input 
                      type="datetime-local" 
                      className={styles.formInput} 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)} 
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Due Date</label>
                    <input 
                      type="datetime-local" 
                      className={styles.formInput} 
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)} 
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Due Date Reminder</label>
                  <input 
                    type="datetime-local" 
                    className={styles.formInput} 
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)} 
                  />
                </div>

                {/* Checklist Builder Section */}
                <div className={styles.builderSection}>
                  <label className={styles.builderLabel}>Checklist Items ({checklist.length})</label>
                  <div className={styles.builderInputRow}>
                    <input 
                      type="text" 
                      placeholder="Add a checklist step..." 
                      className={styles.formInput} 
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                    />
                    <button type="button" onClick={addChecklistItem} className={styles.primaryBtn} style={{ padding: '0.5rem 1rem' }}>Add</button>
                  </div>
                  {checklist.length > 0 && (
                    <div className={styles.builderList}>
                      {checklist.map((item, idx) => (
                        <div key={idx} className={styles.builderItem}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {item.text}
                          </span>
                          <button type="button" className={styles.builderItemBtn} onClick={() => removeChecklistItem(idx)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attachments Section */}
                <div className={styles.builderSection}>
                  <label className={styles.builderLabel}>Attachments / External Links ({attachments.length})</label>
                  <div className={styles.builderInputRow}>
                    <input 
                      type="text" 
                      placeholder="Link Display Text (e.g. Drive Link)" 
                      className={styles.formInput}
                      style={{ flex: 1 }} 
                      value={attachmentText}
                      onChange={(e) => setAttachmentText(e.target.value)} 
                    />
                    <input 
                      type="text" 
                      placeholder="URL (http://...)" 
                      className={styles.formInput}
                      style={{ flex: 2 }} 
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)} 
                    />
                    <button type="button" onClick={addAttachment} className={styles.primaryBtn} style={{ padding: '0.5rem 1rem' }}>Attach</button>
                  </div>
                  {attachments.length > 0 && (
                    <div className={styles.builderList}>
                      {attachments.map((att, idx) => (
                        <div key={idx} className={styles.builderItem}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                            <a href={att.url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>{att.name}</a>
                          </span>
                          <button type="button" className={styles.builderItemBtn} onClick={() => removeAttachment(idx)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={closeAssignTask} className={styles.secondaryBtn}>Cancel</button>
                <button type="submit" disabled={submittingTask} className={styles.primaryBtn}>
                  {submittingTask ? 'Dispatching...' : 'Dispatch Task'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* ===================== MODAL: CREATE STAGE ===================== */}
      {mounted && showAddStage && createPortal(
        <div className={`${styles.backdrop} ${isClosingAddStage ? styles.closingBackdrop : ''}`} onClick={closeAddStage}>
          <div className={`${styles.taskModalDrawer} ${isClosingAddStage ? styles.closingTaskModalDrawer : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '18px', height: '18px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Create Custom Kanban Stage
              </h3>
              <button onClick={closeAddStage} className={styles.modalCloseBtn}>×</button>
            </div>
            <form onSubmit={handleCreateStage} className={styles.taskModalDrawerForm}>
              <div style={{ flex: 1 }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Stage Name</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g., Blocked, Testing, Q/A"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    maxLength={40}
                    required
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" onClick={closeAddStage} className={styles.secondaryBtn}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Stage
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {mounted && viewingTask && createPortal(
        <div className={`${styles.backdrop} ${isClosingViewing ? styles.closingBackdrop : ''}`} onClick={closeViewingTask}>
          <div className={`${styles.taskModalDrawer} ${isClosingViewing ? styles.closingTaskModalDrawer : ''}`} style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '22px', height: '22px', color: 'var(--primary)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <div style={{ flex: 1 }}>
                  {isEditingTask ? (
                    <h3 style={{ margin: 0 }}>Edit Task Directive</h3>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h3 style={{ margin: 0 }}>{viewingTask.title}</h3>
                        {isAdmin && (
                          <button 
                            onClick={startEditingTask} 
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                            title="Edit Title"
                          >
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                        in column <strong style={{ color: '#ea580c', textTransform: 'uppercase' }}>{viewingTask.status}</strong>
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button onClick={closeViewingTask} className={styles.modalCloseBtn}>×</button>
              </div>
            </div>

            {isEditingTask ? (
              <form onSubmit={handleSaveTaskEdit} className={styles.taskModalDrawerForm}>
                <div className={styles.modalScrollableBody} style={{ paddingTop: '0.5rem' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Task Title</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Description</label>
                    <textarea
                      className={styles.formTextarea}
                      style={{ minHeight: '100px' }}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Assigned To</label>
                    <CustomSelect
                      value={editAssignedTo}
                      onChange={setEditAssignedTo}
                      options={members.map(m => ({ value: m._id, label: `${m.name} (@${m.username || 'member'})` }))}
                    />
                  </div>

                  <div className={styles.dateGrid}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Start Date</label>
                      <input
                        type="datetime-local"
                        className={styles.formInput}
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Due Date</label>
                      <input
                        type="datetime-local"
                        className={styles.formInput}
                        value={editDue}
                        onChange={(e) => setEditDue(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Reminder At</label>
                    <input
                      type="datetime-local"
                      className={styles.formInput}
                      value={editReminder}
                      onChange={(e) => setEditReminder(e.target.value)}
                    />
                  </div>

                  {/* Edit Checklist Section */}
                  <div className={styles.builderSection}>
                    <label className={styles.builderLabel}>Checklist Items ({editChecklist.length})</label>
                    <div className={styles.builderInputRow}>
                      <input 
                        type="text" 
                        placeholder="Add a checklist step..." 
                        className={styles.formInput} 
                        value={editNewChecklistItem}
                        onChange={(e) => setEditNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditChecklistItem(); } }}
                      />
                      <button type="button" onClick={addEditChecklistItem} className={styles.primaryBtn} style={{ padding: '0.5rem 1rem' }}>Add</button>
                    </div>
                    {editChecklist.length > 0 && (
                      <div className={styles.builderList}>
                        {editChecklist.map((item, idx) => (
                          <div key={idx} className={styles.builderItem}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <input 
                                type="checkbox"
                                className={styles.checkboxInput}
                                checked={item.completed}
                                onChange={(e) => {
                                  const updated = [...editChecklist];
                                  updated[idx] = { ...updated[idx], completed: e.target.checked };
                                  setEditChecklist(updated);
                                }}
                                style={{ width: '14px', height: '14px', marginRight: '0.25rem' }}
                              />
                              <span style={{ textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? '#64748b' : 'var(--text-color)' }}>
                                {item.text}
                              </span>
                            </span>
                            <button type="button" className={styles.builderItemBtn} onClick={() => removeEditChecklistItem(idx)}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit Attachments Section */}
                  <div className={styles.builderSection}>
                    <label className={styles.builderLabel}>Attachments / External Links ({editAttachments.length})</label>
                    <div className={styles.builderInputRow}>
                      <input 
                        type="text" 
                        placeholder="Link Display Text (e.g. Drive Link)" 
                        className={styles.formInput}
                        style={{ flex: 1 }} 
                        value={editAttachmentText}
                        onChange={(e) => setEditAttachmentText(e.target.value)} 
                      />
                      <input 
                        type="text" 
                        placeholder="URL (http://...)" 
                        className={styles.formInput}
                        style={{ flex: 2 }} 
                        value={editAttachmentUrl}
                        onChange={(e) => setEditAttachmentUrl(e.target.value)} 
                      />
                      <button type="button" onClick={addEditAttachment} className={styles.primaryBtn} style={{ padding: '0.5rem 1rem' }}>Attach</button>
                    </div>
                    {editAttachments.length > 0 && (
                      <div className={styles.builderList}>
                        {editAttachments.map((att, idx) => (
                          <div key={idx} className={styles.builderItem}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                              <a href={att.url.startsWith('http') ? att.url : `https://${att.url}`} target="_blank" rel="noreferrer" className={styles.attachmentLink} onClick={(e) => e.stopPropagation()}>{att.name}</a>
                            </span>
                            <button type="button" className={styles.builderItemBtn} onClick={() => removeEditAttachment(idx)}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
                <div className={styles.modalFooter} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                  <button type="button" onClick={cancelEditingTask} className={styles.secondaryBtn} disabled={submittingEdit}>Cancel</button>
                  <button type="submit" className={styles.primaryBtn} disabled={submittingEdit}>
                    {submittingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.modalScrollableBody} style={{ paddingTop: '0.5rem' }}>
                  {/* Assignment Info */}
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label className={styles.builderLabel}>Assigned To</label>
                        {isAdmin && (
                          <button 
                            onClick={startEditingTask} 
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.25rem 0.25rem 0.25rem', display: 'inline-flex', alignItems: 'center' }}
                            title="Edit Assignee"
                          >
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div className={styles.cardAvatar} style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}>
                          {viewingTask.assignedTo.avatar ? (
                            <img src={viewingTask.assignedTo.avatar} className={styles.fullImgCover} alt="" />
                          ) : (
                            viewingTask.assignedTo.name.charAt(0)
                          )}
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{viewingTask.assignedTo.name}</span>
                      </div>
                    </div>
                    <div>
                      <label className={styles.builderLabel}>Assigned By</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div className={styles.cardAvatar} style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #475569, #64748b)', fontSize: '0.8rem' }}>
                          {viewingTask.assignedBy.avatar ? (
                            <img src={viewingTask.assignedBy.avatar} className={styles.fullImgCover} alt="" />
                          ) : (
                            viewingTask.assignedBy.name.charAt(0)
                          )}
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{viewingTask.assignedBy.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Revision Notes Feedback Callout */}
                  {viewingTask.revisionNotes && (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.5rem', 
                      background: 'rgba(239, 68, 68, 0.08)', 
                      border: '1px solid rgba(239, 68, 68, 0.2)', 
                      padding: '1rem', 
                      borderRadius: '12px',
                      marginTop: '0.25rem'
                    }}>
                      <label className={styles.builderLabel} style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" /></svg>
                        Super Admin Revision Feedback
                      </label>
                      <p style={{ fontSize: '0.88rem', color: '#ef4444', margin: 0, fontStyle: 'italic', lineHeight: 1.6 }}>
                        "{viewingTask.revisionNotes}"
                      </p>
                    </div>
                  )}

                  {/* Description */}
                  {viewingTask.description && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label className={styles.builderLabel}>Description</label>
                        {isAdmin && (
                          <button 
                            onClick={startEditingTask} 
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.25rem 0.25rem 0.25rem', display: 'inline-flex', alignItems: 'center' }}
                            title="Edit Description"
                          >
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-color)', whiteSpace: 'pre-wrap', margin: 0, background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', lineHeight: 1.6 }}>
                        {viewingTask.description}
                      </p>
                    </div>
                  )}

                  {/* Dates Details */}
                  {(viewingTask.startDate || viewingTask.dueDate) && (
                    <div className={styles.dateGrid}>
                      {viewingTask.startDate && (
                        <div className={styles.builderSection}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label className={styles.builderLabel}>Start Date</label>
                            {isAdmin && (
                              <button 
                                onClick={startEditingTask} 
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.25rem 0.25rem 0.25rem', display: 'inline-flex', alignItems: 'center' }}
                                title="Edit Dates"
                              >
                                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6v6m-3-3h6" /></svg>
                            {new Date(viewingTask.startDate).toLocaleDateString([], { dateStyle: 'medium' })} 
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                              {new Date(viewingTask.startDate).toLocaleTimeString([], { timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>
                      )}
                      {viewingTask.dueDate && (
                        <div className={styles.builderSection}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label className={styles.builderLabel}>Due Date</label>
                            {isAdmin && (
                              <button 
                                onClick={startEditingTask} 
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.25rem 0.25rem 0.25rem', display: 'inline-flex', alignItems: 'center' }}
                                title="Edit Dates"
                              >
                                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#ea580c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', color: '#ea580c' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {new Date(viewingTask.dueDate).toLocaleDateString([], { dateStyle: 'medium' })} 
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                              {new Date(viewingTask.dueDate).toLocaleTimeString([], { timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {viewingTask.reminderAt && (
                    <div style={{ fontSize: '0.8rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff7ed', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(234, 88, 12, 0.15)' }}>
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', color: '#ea580c' }}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 11-5.714 0" /></svg>
                      <strong>Reminder set for:</strong> {new Date(viewingTask.reminderAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  )}

                  {/* Checklist Container */}
                  {viewingTask.checklist && viewingTask.checklist.length > 0 && (
                    <div className={styles.builderSection}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className={styles.builderLabel}>Checklist</label>
                        <span style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: 700 }}>
                          {Math.round((viewingTask.checklist.filter(c => c.completed).length / viewingTask.checklist.length) * 100)}% Done
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ 
                          height: '100%', 
                          background: '#ea580c', 
                          width: `${(viewingTask.checklist.filter(c => c.completed).length / viewingTask.checklist.length) * 100}%`,
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <div className={styles.builderList} style={{ marginTop: '0.5rem' }}>
                        {viewingTask.checklist.map((item, idx) => {
                          const isMine = viewingTask.assignedTo._id === me?._id;
                          const canCheck = isAdmin || isMine;
                          return (
                            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', borderRadius: '8px', cursor: canCheck ? 'pointer' : 'default', background: 'rgba(0,0,0,0.01)' }} onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className={styles.checkboxInput}
                                checked={item.completed}
                                disabled={!canCheck}
                                onChange={() => handleToggleChecklistItem(viewingTask, idx)}
                                style={{ width: '16px', height: '16px' }}
                              />
                              <span style={{ fontSize: '0.9rem', color: item.completed ? '#64748b' : 'var(--text-color)', textDecoration: item.completed ? 'line-through' : 'none' }}>
                                {item.text}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Attachments */}
                  {viewingTask.attachments && viewingTask.attachments.length > 0 && (
                    <div className={styles.builderSection}>
                      <label className={styles.builderLabel}>Attachments ({viewingTask.attachments.length})</label>
                      <div className={styles.builderList}>
                        {viewingTask.attachments.map((att, idx) => (
                          <a 
                            key={idx} 
                            href={att.url.startsWith('http') ? att.url : `https://${att.url}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className={styles.builderItem} 
                            style={{ textDecoration: 'none', background: '#f8fafc', border: '1px solid var(--border-color)' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span style={{ color: '#ea580c', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                              {att.name}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }}>
                              {att.url}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className={styles.commentsSection}>
                    <label className={styles.commentsTitle}>Comments ({viewingTask.comments?.length || 0})</label>
                    
                    <div className={styles.commentsList}>
                      {viewingTask.comments && viewingTask.comments.length > 0 ? (
                        viewingTask.comments.map((comment, cIdx) => (
                          <div key={cIdx} className={styles.commentItem}>
                            <div className={styles.commentHeader}>
                              <div className={styles.commentUser}>
                                <div className={styles.cardAvatar} style={{ width: '20px', height: '20px', fontSize: '0.6rem' }}>
                                  {comment.userId?.avatar ? (
                                    <img src={comment.userId.avatar} className={styles.fullImgCover} alt="" />
                                  ) : (
                                    comment.userId?.name?.charAt(0) || 'U'
                                  )}
                                </div>
                                <span className={styles.commentUserName}>{comment.userId?.name || 'User'}</span>
                              </div>
                              <span className={styles.commentDate}>{formatTime(comment.createdAt)}</span>
                            </div>
                            <p className={styles.commentText}>{comment.text}</p>
                          </div>
                        ))
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', margin: 0 }}>No comments posted yet.</p>
                      )}
                    </div>

                    <form onSubmit={handleAddComment} className={styles.commentForm} onClick={(e) => e.stopPropagation()}>
                      <textarea
                        className={styles.commentInput}
                        placeholder="Write a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        required
                      />
                      <button type="submit" className={styles.commentSubmitBtn} disabled={submittingComment}>
                        {submittingComment ? 'Posting...' : 'Comment'}
                      </button>
                    </form>
                  </div>

                </div>
                <div className={styles.modalFooter} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                  <button onClick={closeViewingTask} className={styles.primaryBtn}>Close Details</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {/* ===================== MODAL: REVISION FEEDBACK DIALOG ===================== */}
      {mounted && showRevisionDialog && createPortal(
        <div className={`${styles.backdrop} ${isClosingRevision ? styles.closingBackdrop : ''}`} onClick={closeRevisionDialog}>
          <div className={`${styles.taskModalDrawer} ${isClosingRevision ? styles.closingTaskModalDrawer : ''}`} style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '18px', height: '18px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" /></svg>
                Push Task back to Revision
              </h3>
              <button onClick={closeRevisionDialog} className={styles.modalCloseBtn}>×</button>
            </div>
            <div className={styles.modalScrollableBody}>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginTop: 0 }}>
                You are moving this task from Completed back to Revision. Please provide feedback explaining what went wrong so the employee can fix it.
              </p>
              <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                <label className={styles.formLabel}>Revision Feedback / Issue Details</label>
                <textarea
                  className={styles.formInput}
                  style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Describe the issues, missing items, or updates required..."
                  value={pendingRevisionNotes}
                  onChange={(e) => setPendingRevisionNotes(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button 
                type="button" 
                onClick={closeRevisionDialog} 
                className={styles.secondaryBtn}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={submitRevisionTask} 
                className={styles.primaryBtn}
                style={{ background: '#dc2626' }}
              >
                Send to Revision
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
