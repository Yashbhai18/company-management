import { Request, Response } from 'express';
import { Task } from '../models/Task';
import { User } from '../models/User';
import { Team } from '../models/Team';
import { notificationService } from '../services/notification.service';
import type { TokenPayload } from '../utils/token';

// For WebSocket instant relays
import { getSocketIO } from '../gateway/chat.gateway'; 

/** Helper: Safe dispatch of socket triggers to real-time clients */
const pushNotifSocket = (userId: string) => {
  try {
    const io = getSocketIO();
    if (io) {
      io.to(`user:${userId}`).emit('notification:new');
    }
  } catch {}
};

/** GET /api/tasks — List tasks */
export const getTasks = async (req: Request, res: Response) => {
  try {
    const { orgId, userId, role } = (req as any).user as TokenPayload;

    // Base query: always within this organization node
    let query: any = { orgId };

    // If standard employee, strictly lock views to their own assignments!
    if (role === 'employee') {
      query.assignedTo = userId;
    }

    const tasks = await Task.find(query)
      .populate('assignedTo', '_id name username avatar')
      .populate('assignedBy', '_id name username')
      .populate('teamId', '_id name')
      .populate('comments.userId', '_id name username avatar')
      .sort({ status: 1, createdAt: -1 }); // Pending first, then newest

    return res.json(tasks);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** POST /api/tasks — Create task assignments (Bulk expand targets) */
export const createTasks = async (req: Request, res: Response) => {
  try {
    const { orgId, userId, role } = (req as any).user as TokenPayload;

    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ message: 'Administrative privileges required to assign tasks.' });
    }

    const { 
      title, 
      description, 
      targetType, 
      targetId,
      startDate,
      dueDate,
      reminderAt,
      checklist,
      attachments
    } = req.body;

    if (!title || !targetType) {
      return res.status(400).json({ message: 'Missing required parameters (title, targetType).' });
    }

    // 1. Resolve Target ID set into discrete user ID strings!
    let targetUserIds: string[] = [];
    let linkedTeamId: string | undefined = undefined;

    if (targetType === 'individual') {
      if (!targetId) return res.status(400).json({ message: 'Select an individual target employee.' });
      targetUserIds = [targetId];
    } else if (targetType === 'team') {
      if (!targetId) return res.status(400).json({ message: 'Select a target team.' });
      const teamObj = await Team.findOne({ _id: targetId, orgId }).lean();
      if (!teamObj) return res.status(404).json({ message: 'Team group not found.' });
      
      linkedTeamId = teamObj._id.toString();
      targetUserIds = teamObj.members.map((m) => m.toString());
    } else if (targetType === 'all') {
      // Fetch EVERY active user in the workspace (except the assigning admin if desired, or include them).
      // Standard flow: assign to ALL active employees!
      const allUsers = await User.find({ orgId, isActive: true }).select('_id').lean();
      targetUserIds = allUsers.map((u) => u._id.toString());
    } else {
      return res.status(400).json({ message: 'Unsupported targetType format.' });
    }

    // Ensure uniqueness and strip invalid duplicates
    targetUserIds = Array.from(new Set(targetUserIds));

    if (targetUserIds.length === 0) {
      return res.status(400).json({ message: 'Target resolved to zero active members.' });
    }

    // 2. Bulk construct distinct Task documents
    const payload = targetUserIds.map((assigneeId) => ({
      orgId,
      assignedBy: userId,
      assignedTo: assigneeId,
      teamId: linkedTeamId || null,
      title: title.trim(),
      description: description ? description.trim() : '',
      status: 'backlog',
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      reminderAt: reminderAt ? new Date(reminderAt) : null,
      checklist: checklist || [],
      attachments: attachments || []
    }));

    const createdTasks = await Task.insertMany(payload);

    // 3. Push background alerts to all assignees
    const assigningAdmin = await User.findById(userId).select('name').lean();
    const adminName = assigningAdmin?.name || 'Workspace Admin';

    for (const assigneeId of targetUserIds) {
      // Don't notify the assigning admin if they assigned to everyone including themselves
      if (assigneeId === userId) continue;

      await notificationService.createNotification({
        userId: assigneeId,
        orgId,
        type: 'task_assigned',
        title: `📢 New Task Assigned`,
        message: `Task: "${title.slice(0, 50)}" assigned by ${adminName}.`,
        actionUrl: '/tasks',
      });
    }

    return res.status(201).json({ 
      message: `Successfully dispatched tasks to ${createdTasks.length} active assignees.`,
      count: createdTasks.length 
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** PATCH /api/tasks/:id/complete — Mark an individual assignment as done */
export const completeTask = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { id } = req.params;

    const taskObj = await Task.findOne({ _id: id, orgId, assignedTo: userId });

    if (!taskObj) {
      return res.status(404).json({ message: 'Task not found or permission denied.' });
    }

    if (taskObj.status === 'completed') {
      return res.status(400).json({ message: 'Task is already marked as completed.' });
    }

    // Update
    taskObj.status = 'completed';
    taskObj.completedAt = new Date();
    await taskObj.save();

    // 🔔 Notify Administrative Team!
    const completer = await User.findById(userId).select('name').lean();
    const completerName = completer?.name || 'An employee';

    // Core requirement: notify assigning administrator AND any other Workspace Admins
    const admins = await User.find({ 
      orgId, 
      role: { $in: ['admin', 'super_admin'] },
      isActive: true 
    }).select('_id').lean();

    for (const admin of admins) {
      const adminIdStr = admin._id.toString();
      // Skip notifying the completionist if they are an admin doing their own task
      if (adminIdStr === userId) continue;

      await notificationService.createNotification({
        userId: adminIdStr,
        orgId,
        type: 'task_completed',
        title: `✅ Task Completed`,
        message: `${completerName} marked "${taskObj.title.slice(0, 40)}" as Done.`,
        actionUrl: '/tasks',
      });
    }

    return res.json({ message: 'Task successfully finalized.', task: taskObj });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateTaskStage = async (req: Request, res: Response) => {
  try {
    const { orgId, userId, role } = (req as any).user as TokenPayload;
    const { id } = req.params;
    const { stage, revisionNotes } = req.body;

    if (!stage || !stage.trim()) {
      return res.status(400).json({ message: 'Stage name is required.' });
    }

    const targetStage = stage.trim();

    // Load the task
    const query: any = { _id: id, orgId };
    // Standard employee can only update tasks assigned TO THEM.
    if (role === 'employee') {
      query.assignedTo = userId;
    }

    const taskObj = await Task.findOne(query);
    if (!taskObj) {
      return res.status(404).json({ message: 'Task not found or access denied.' });
    }

    const oldStatus = taskObj.status;

    if (targetStage !== oldStatus) {
      taskObj.status = targetStage;

      const isFinishing = targetStage.toLowerCase() === 'completed';
      const wasFinished = oldStatus.toLowerCase() === 'completed';
      const isRevision = targetStage.toLowerCase() === 'revision';

      if (isFinishing && !wasFinished) {
        taskObj.completedAt = new Date();
      } else if (!isFinishing && wasFinished) {
        taskObj.completedAt = undefined;
      }

      if (isRevision && (role === 'admin' || role === 'super_admin')) {
        taskObj.revisionNotes = revisionNotes || 'No feedback specified.';
      }

      await taskObj.save();

      // Send notifications for stage changes
      try {
        const updater = await User.findById(userId).select('name').lean();
        const updaterName = updater?.name || 'A user';
        
        const isMeAssignee = taskObj.assignedTo.toString() === userId;

        if (isMeAssignee) {
          // Assignee (employee) updated the task stage.
          // Notify creator (assignedBy) and all admins/super admins.
          const admins = await User.find({ 
            orgId, 
            role: { $in: ['admin', 'super_admin'] }, 
            isActive: true 
          }).select('_id').lean();
          
          const uniqueNotifyIds = new Set<string>();
          if (taskObj.assignedBy) {
            uniqueNotifyIds.add(taskObj.assignedBy.toString());
          }
          admins.forEach(admin => uniqueNotifyIds.add(admin._id.toString()));
          uniqueNotifyIds.delete(userId); // Don't notify self

          for (const notifyId of uniqueNotifyIds) {
            let notificationType = 'task_stage_changed';
            let title = `🔄 Task Stage Changed`;
            let message = `Task "${taskObj.title.slice(0, 35)}" moved to "${targetStage}" by ${updaterName}.`;

            if (isFinishing) {
              notificationType = 'task_completed';
              title = `✅ Task Completed`;
              message = `${updaterName} moved "${taskObj.title.slice(0, 35)}" to Completed.`;
            }

            await notificationService.createNotification({
              userId: notifyId,
              orgId,
              type: notificationType,
              title,
              message,
              actionUrl: '/tasks',
            });
          }
        } else {
          // Admin or manager updated the task stage.
          // Notify the assignee (assignedTo).
          if (taskObj.assignedTo.toString() !== userId) {
            let notificationType = 'task_stage_changed';
            let title = `🔄 Task Stage Changed`;
            let message = `Your task "${taskObj.title.slice(0, 35)}" was moved to "${targetStage}" by ${updaterName}.`;

            if (isRevision) {
              notificationType = 'task_revision';
              title = `⚠️ Task Moved to Revision`;
              message = `Task "${taskObj.title.slice(0, 35)}" was moved to Revision by ${updaterName}. Notes: ${revisionNotes || 'No feedback specified.'}`;
            }

            await notificationService.createNotification({
              userId: taskObj.assignedTo.toString(),
              orgId,
              type: notificationType,
              title,
              message,
              actionUrl: '/tasks',
            });
          }
        }
      } catch (notifyErr) {
        console.error('Failed to send stage change notification:', notifyErr);
      }
    } else {
      // Just save checklist or revision notes
      const isRevision = targetStage.toLowerCase() === 'revision';
      if (isRevision && (role === 'admin' || role === 'super_admin')) {
        taskObj.revisionNotes = revisionNotes || 'No feedback specified.';
      }
      await taskObj.save();
    }

    return res.json({ message: 'Task stage updated successfully.', task: taskObj });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

import { Organization } from '../models/Organization';

export const addKanbanStage = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { stage } = req.body;

    if (!stage || !stage.trim()) {
      return res.status(400).json({ message: 'Stage name is required.' });
    }

    const cleanStage = stage.trim();

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    if (!org.kanbanStages) {
      org.kanbanStages = ['backlog', 'in progress', 'revision', 'completed'];
    }

    // Prevent duplication
    if (org.kanbanStages.some(s => s.toLowerCase() === cleanStage.toLowerCase())) {
      return res.status(400).json({ message: 'This stage already exists.' });
    }

    org.kanbanStages.push(cleanStage);
    await org.save();

    return res.json({ message: 'Custom stage created successfully.', stages: org.kanbanStages });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const reorderKanbanStages = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { stages } = req.body;

    if (!stages || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ message: 'Stages array is required.' });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    org.kanbanStages = stages.map(s => s.trim());
    await org.save();

    return res.json({ message: 'Stages reordered successfully.', stages: org.kanbanStages });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const { orgId, userId, role } = (req as any).user as TokenPayload;
    const { id } = req.params;
    const { title, description, assignedTo, startDate, dueDate, reminderAt, checklist, attachments } = req.body;

    const query: any = { _id: id, orgId };
    // Standard employee can only update their own assigned tasks
    if (role === 'employee') {
      query.assignedTo = userId;
    }

    const taskObj = await Task.findOne(query);
    if (!taskObj) {
      return res.status(404).json({ message: 'Task not found or access denied.' });
    }

    const isAdmin = role === 'admin' || role === 'super_admin';

    if (isAdmin) {
      if (title !== undefined) taskObj.title = title;
      if (description !== undefined) taskObj.description = description;
      if (assignedTo !== undefined) taskObj.assignedTo = assignedTo;
      if (startDate !== undefined) taskObj.startDate = startDate ? new Date(startDate) : undefined;
      if (dueDate !== undefined) taskObj.dueDate = dueDate ? new Date(dueDate) : undefined;
      if (reminderAt !== undefined) taskObj.reminderAt = reminderAt ? new Date(reminderAt) : undefined;
      if (attachments !== undefined) taskObj.attachments = attachments;
    }

    if (checklist !== undefined) {
      taskObj.checklist = checklist;
    }

    await taskObj.save();

    const populated = await Task.findById(taskObj._id)
      .populate('assignedTo', '_id name username avatar')
      .populate('assignedBy', '_id name username')
      .populate('teamId', '_id name')
      .populate('comments.userId', '_id name username avatar');

    return res.json({ message: 'Task updated successfully.', task: populated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteKanbanStage = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { stageName } = req.params;

    if (!stageName) {
      return res.status(400).json({ message: 'Stage name is required.' });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    if (!org.kanbanStages) {
      org.kanbanStages = ['backlog', 'in progress', 'revision', 'completed'];
    }

    // Filter out target stage case-insensitively
    const originalCount = org.kanbanStages.length;
    org.kanbanStages = org.kanbanStages.filter(s => s.toLowerCase() !== String(stageName).toLowerCase());

    if (org.kanbanStages.length === originalCount) {
      return res.status(404).json({ message: 'Stage not found.' });
    }

    // Fallback to default if last one deleted
    if (org.kanbanStages.length === 0) {
      org.kanbanStages = ['backlog', 'in progress', 'revision', 'completed'];
    }

    await org.save();

    return res.json({ message: 'Stage deleted successfully.', stages: org.kanbanStages });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const addTaskComment = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required.' });
    }

    const taskObj = await Task.findOne({ _id: id, orgId });
    if (!taskObj) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    if (!taskObj.comments) {
      taskObj.comments = [];
    }

    taskObj.comments.push({
      userId: userId as any,
      text: text.trim(),
      createdAt: new Date()
    });

    await taskObj.save();

    const populated = await Task.findById(taskObj._id)
      .populate('assignedTo', '_id name username avatar')
      .populate('assignedBy', '_id name username')
      .populate('teamId', '_id name')
      .populate('comments.userId', '_id name username avatar');

    return res.json({ message: 'Comment added successfully.', task: populated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
