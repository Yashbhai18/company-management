import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type Role = 'super_admin' | 'admin' | 'employee';

export interface IUser extends Document {
  orgId: mongoose.Types.ObjectId;
  role: Role;
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  department?: string;
  avatar?: string;
  passwordHash?: string | null;
  isActive: boolean;
  inviteToken?: string | null;
  inviteExpiry?: Date | null;
  rememberMe: boolean;
  lastLogin?: Date;
  baseSalary?: number;
  weekendSettings?: {
    type: 'default' | 'custom' | 'alternate-saturday';
    customDays: number[];
    alternateSaturdayType: 'even' | 'odd' | 'none';
    isConfigured?: boolean;
  };
  twoFactorEnabled: boolean;
  twoFactorSecret?: string | null;
  tempTwoFactorSecret?: string | null;
  twoFactorEnabledAt?: Date | null;
  twoFactorBackupCodes: string[];
  twoFactorDevices: {
    id: string;
    deviceName: string;
    secret: string;
    createdAt: Date;
  }[];
  tempTwoFactorDevice?: {
    deviceName: string;
    secret: string;
  } | null;
  resetPasswordOtp?: string | null;
  resetPasswordOtpExpiry?: Date | null;
  mustChangePassword?: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword?: (candidate: string) => Promise<boolean>;
}

const SALT_ROUNDS = 12;

const UserSchema = new Schema<IUser>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    role: { type: String, enum: ['super_admin', 'admin', 'employee'], default: 'employee' },
    name: { type: String, required: true },
    username: { type: String, lowercase: true, trim: true },
    email: { type: String, lowercase: true, index: true },
    phone: { type: String },
    countryCode: { type: String },
    department: { 
      type: String, 
      validate: {
        validator: function(this: IUser, val: string) {
          if (this.role === 'employee') {
            return !!(val && val.trim());
          }
          return true;
        },
        message: 'Department is mandatory for employees.'
      }
    },
    avatar: { type: String },
    passwordHash: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    inviteToken: { type: String, default: null },
    inviteExpiry: { type: Date, default: null },
    rememberMe: { type: Boolean, default: false },
    lastLogin: { type: Date },
    baseSalary: { type: Number, default: 10000 },
    weekendSettings: {
      type: {
        type: String,
        enum: ['default', 'custom', 'alternate-saturday'],
        default: 'default'
      },
      customDays: { type: [Number], default: [0, 6] },
      alternateSaturdayType: {
        type: String,
        enum: ['even', 'odd', 'none'],
        default: 'none'
      },
      isConfigured: { type: Boolean, default: false }
    },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null },
    tempTwoFactorSecret: { type: String, default: null },
    twoFactorEnabledAt: { type: Date, default: null },
    twoFactorBackupCodes: { type: [String], default: [] },
    twoFactorDevices: {
      type: [
        {
          id: { type: String, required: true },
          deviceName: { type: String, required: true },
          secret: { type: String, required: true },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    tempTwoFactorDevice: {
      type: {
        deviceName: { type: String },
        secret: { type: String }
      },
      default: null
    },
    resetPasswordOtp: { type: String, default: null },
    resetPasswordOtpExpiry: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false }
  },
  { timestamps: true }
);

/** Pre-save hook to hash password when passwordHash is set as plaintext on `passwordHash` field */
UserSchema.pre('save', async function (this: IUser) {
  if (!this.isModified('passwordHash') || !this.passwordHash) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, SALT_ROUNDS);
});

UserSchema.methods.comparePassword = async function (this: IUser, candidate: string) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

export const User = mongoose.model<IUser>('User', UserSchema);
