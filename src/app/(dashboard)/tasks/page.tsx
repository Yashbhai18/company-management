"use client";
import React from 'react';
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
  const [me, setMe] = React.useState<any>(null);
  const [tasks, setTasks] = React.useState<TaskItem[]>([]);
  const [members, setMembers] = React.useState<UserRef[]>([]);
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Kanban states
  const [stages, setStages] = React.useState<string[]>(['backlog', 'in progress', 'revision', 'completed']);
  const [showAddStage, setShowAddStage] = React.useState(false);
  const [newStageName, setNewStageName] = React.useState('');
  const [draggedOverStage, setDraggedOverStage] = React.useState<string | null>(null);

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
    const s = stageName.toLowerCase();
    if (s.includes('backlog')) return '#64748b';
    if (s.includes('progress')) return '#3b82f6';
    if (s.includes('revision')) return '#f59e0b';
    if (s.includes('completed') || s.includes('done')) return '#10b981';
    return '#a855f7';
  };

  const formatTime = (dStr?: string) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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
          {/* LEFT SECTION: KANBAN BOARD */}
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
                      const taskId = e.dataTransfer.getData("taskId");
                      if (taskId) handleMoveTask(taskId, stage);
                    }}
                  >
                    <div className={styles.columnHeader}>
                      <div className={styles.columnTitleWrap}>
                        <div className={styles.columnDot} style={{ background: getStageColor(stage) }}></div>
                        <h3 className={styles.columnTitle}>{stage}</h3>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={styles.columnCount}>{stageTasks.length}</span>
                        {isAdmin && (
                          <button 
                            onClick={() => handleDeleteStage(stage)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#ef4444', 
                              cursor: 'pointer', 
                              padding: '0.25rem', 
                              fontSize: '0.85rem', 
                              display: 'flex', 
                              opacity: 0.7, 
                              transition: 'opacity 0.15s, transform 0.1s' 
                            }}
                            title="Delete stage"
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.9)')}
                            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                          >
                            🗑️
                          </button>
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
                              {(task.dueDate || (task.checklist && task.checklist.length > 0)) && (
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                  {task.dueDate && (
                                    <span style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: 600 }}>
                                      📅 {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                  {task.checklist && task.checklist.length > 0 && (
                                    <span style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: 600 }}>
                                      ☑️ {task.checklist.filter(c => c.completed).length}/{task.checklist.length}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Clickable Attachments Inline */}
                              {task.attachments && task.attachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }} onMouseDown={(e) => e.stopPropagation()}>
                                  {task.attachments.map((att, attIdx) => (
                                    <a 
                                      key={attIdx}
                                      href={att.url.startsWith('http') ? att.url : `https://${att.url}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 500,
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        color: '#34d399',
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(16, 185, 129, 0.15)',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem'
                                      }}
                                    >
                                      🔗 {att.name}
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


        </main>
      )}



      {/* ===================== MODAL: ASSIGN TASK ===================== */}
      {showAssignTask && (
        <div className={styles.backdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>📝 Assign Task Directive</h3>
              <button onClick={() => setShowAssignTask(false)} className={styles.modalCloseBtn}>×</button>
            </div>
            <form onSubmit={handleAssignTask} className={styles.form}>
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
                          <span>☑️ {item.text}</span>
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
                          <span>🔗 <a href={att.url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>{att.name}</a></span>
                          <button type="button" className={styles.builderItemBtn} onClick={() => removeAttachment(idx)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setShowAssignTask(false)} className={styles.secondaryBtn}>Cancel</button>
                <button type="submit" disabled={submittingTask} className={styles.primaryBtn}>
                  {submittingTask ? 'Dispatching...' : 'Dispatch Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ===================== MODAL: CREATE STAGE ===================== */}
      {showAddStage && (
        <div className={styles.backdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>✨ Create Custom Kanban Stage</h3>
              <button onClick={() => setShowAddStage(false)} className={styles.modalCloseBtn}>×</button>
            </div>
            <form onSubmit={handleCreateStage} className={styles.form}>
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
              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setShowAddStage(false)} className={styles.secondaryBtn}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>
                  Create Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ===================== MODAL: VIEW TASK DETAILS ===================== */}
      {viewingTask && (
        <div className={styles.backdrop} onClick={() => setViewingTask(null)}>
          <div className={styles.modal} style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📋</span>
                <div>
                  <h3 style={{ margin: 0 }}>{viewingTask.title}</h3>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                    in column <strong style={{ color: '#fbbf24', textTransform: 'uppercase' }}>{viewingTask.status}</strong>
                  </p>
                </div>
              </div>
              <button onClick={() => setViewingTask(null)} className={styles.modalCloseBtn}>×</button>
            </div>

            <div className={styles.modalScrollableBody} style={{ paddingTop: '0.5rem' }}>
              {/* Assignment Info */}
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <label className={styles.builderLabel}>Assigned To</label>
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
                  <label className={styles.builderLabel} style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🚩 Super Admin Revision Feedback
                  </label>
                  <p style={{ fontSize: '0.88rem', color: '#fca5a5', margin: 0, fontStyle: 'italic', lineHeight: 1.6 }}>
                    "{viewingTask.revisionNotes}"
                  </p>
                </div>
              )}

              {/* Description */}
              {viewingTask.description && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className={styles.builderLabel}>Description</label>
                  <p style={{ fontSize: '0.9rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', margin: 0, background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)', lineHeight: 1.6 }}>
                    {viewingTask.description}
                  </p>
                </div>
              )}

              {/* Dates Details */}
              {(viewingTask.startDate || viewingTask.dueDate) && (
                <div className={styles.dateGrid}>
                  {viewingTask.startDate && (
                    <div className={styles.builderSection}>
                      <label className={styles.builderLabel}>Start Date</label>
                      <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>
                        📅 {new Date(viewingTask.startDate).toLocaleDateString([], { dateStyle: 'medium' })} 
                        <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                          {new Date(viewingTask.startDate).toLocaleTimeString([], { timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                  )}
                  {viewingTask.dueDate && (
                    <div className={styles.builderSection}>
                      <label className={styles.builderLabel}>Due Date</label>
                      <div style={{ fontSize: '0.9rem', color: '#fbbf24', fontWeight: 600 }}>
                        ⏱️ {new Date(viewingTask.dueDate).toLocaleDateString([], { dateStyle: 'medium' })} 
                        <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                          {new Date(viewingTask.dueDate).toLocaleTimeString([], { timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {viewingTask.reminderAt && (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(99, 102, 241, 0.08)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                  🔔 <strong>Reminder set for:</strong> {new Date(viewingTask.reminderAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              )}

              {/* Checklist Container */}
              {viewingTask.checklist && viewingTask.checklist.length > 0 && (
                <div className={styles.builderSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className={styles.builderLabel}>Checklist</label>
                    <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 700 }}>
                      {Math.round((viewingTask.checklist.filter(c => c.completed).length / viewingTask.checklist.length) * 100)}% Done
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      background: '#6366f1', 
                      width: `${(viewingTask.checklist.filter(c => c.completed).length / viewingTask.checklist.length) * 100}%`,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div className={styles.builderList} style={{ marginTop: '0.5rem' }}>
                    {viewingTask.checklist.map((item, idx) => {
                      const isMine = viewingTask.assignedTo._id === me?._id;
                      const canCheck = isAdmin || isMine;
                      return (
                        <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', borderRadius: '8px', cursor: canCheck ? 'pointer' : 'default', background: 'rgba(255,255,255,0.02)' }} onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className={styles.checkboxInput}
                            checked={item.completed}
                            disabled={!canCheck}
                            onChange={() => handleToggleChecklistItem(viewingTask, idx)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span style={{ fontSize: '0.9rem', color: item.completed ? '#64748b' : '#e2e8f0', textDecoration: item.completed ? 'line-through' : 'none' }}>
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
                        style={{ textDecoration: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                          🔗 {att.name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }}>
                          {att.url}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '1rem', marginTop: '1rem' }}>
              <button onClick={() => setViewingTask(null)} className={styles.primaryBtn}>Close Details</button>
            </div>
          </div>
        </div>
      )}
      {/* ===================== MODAL: REVISION FEEDBACK DIALOG ===================== */}
      {showRevisionDialog && (
        <div className={styles.backdrop}>
          <div className={styles.modal} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <h3>🚩 Push Task back to Revision</h3>
              <button onClick={() => { setShowRevisionDialog(false); setPendingRevisionTaskId(''); }} className={styles.modalCloseBtn}>×</button>
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
                onClick={() => { setShowRevisionDialog(false); setPendingRevisionTaskId(''); }} 
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
        </div>
      )}
    </div>
  );
}
