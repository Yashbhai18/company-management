import mongoose, { Schema, Document } from 'mongoose';

export interface IChecklistItem {
  text: string;
  completed: boolean;
}

export interface IAttachment {
  url: string;
  name: string;
}

export interface IComment {
  userId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface ITask extends Document {
  orgId: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: string;
  completedAt?: Date;
  startDate?: Date;
  dueDate?: Date;
  reminderAt?: Date;
  checklist?: IChecklistItem[];
  attachments?: IAttachment[];
  revisionNotes?: string;
  comments?: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    title: { type: String, required: true, trim: true, maxlength: 250 },
    description: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, default: 'backlog', required: true },
    completedAt: { type: Date, default: null },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    reminderAt: { type: Date, default: null },
    revisionNotes: { type: String, default: null },
    checklist: [
      {
        text: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String, required: true },
      },
    ],
    comments: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

// Fast lookups for specific users or full organization filters
TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ orgId: 1, createdAt: -1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
