import mongoose, { Schema, Document } from 'mongoose';

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface ILocation {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radius: number; // in meters
}

export interface IOrganization extends Document {
  name: string;
  slug: string;
  ownerId: mongoose.Types.ObjectId;
  plan: PlanType;
  timezone: string;
  kanbanStages: string[];
  departments: string[];
  locations: ILocation[];
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    kanbanStages: { type: [String], default: ['backlog', 'in progress', 'revision', 'completed'] },
    departments: { type: [String], default: [] },
    locations: {
      type: [{
        name: { type: String, required: true },
        address: { type: String },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        radius: { type: Number, required: true, default: 300 }
      }],
      default: []
    },
  },
  { timestamps: true }
);

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);

export const PREDEFINED_DEPARTMENTS = [
  "Web Development",
  "App Development",
  "Video Editing",
  "Graphic Design",
  "Social Media",
  "Operations",
  "Human Resources",
  "Sales & Marketing",
  "Finance"
];

export const ensureCustomDepartmentSaved = async (orgId: string | mongoose.Types.ObjectId, departmentName?: string) => {
  if (!departmentName || !departmentName.trim()) return;
  const cleanName = departmentName.trim();
  
  // Check predefined case-insensitive
  const existsPredefined = PREDEFINED_DEPARTMENTS.some(
    (d) => d.toLowerCase() === cleanName.toLowerCase()
  );
  if (existsPredefined) return;

  // Fetch organization
  const org = await Organization.findById(orgId);
  if (!org) return;

  if (!org.departments) {
    org.departments = [];
  }

  const existsCustom = org.departments.some(
    (d) => d.toLowerCase() === cleanName.toLowerCase()
  );

  if (!existsCustom) {
    org.departments.push(cleanName);
    await org.save();
  }
};
