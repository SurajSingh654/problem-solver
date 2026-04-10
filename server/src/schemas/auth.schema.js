/**
 * AUTH SCHEMAS — Zod validation for auth endpoints
 */
import { z } from 'zod'

export const registerSchema = z.object({
  body: z.object({
    username: z.string()
      .min(2,  'Username must be at least 2 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, - and _'),
    email: z.string()
      .email('Invalid email address')
      .toLowerCase(),
    password: z.string()
      .min(6, 'Password must be at least 6 characters')
      .max(72, 'Password too long'),
  }),
})

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email').toLowerCase(),
    password: z.string().min(1, 'Password required'),
  }),
})

export const claimAdminSchema = z.object({
  body: z.object({
    password: z.string().min(1, 'Admin password required'),
  }),
})

export const updateProfileSchema = z.object({
  body: z.object({
    username:        z.string().min(2).max(30).optional(),
    avatarColor:     z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    targetCompanies: z.array(z.string()).optional(),
    targetRole:      z.string().optional(),
    targetDate:      z.string().datetime().optional().nullable(),
    currentLevel:    z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
    preferences:     z.record(z.unknown()).optional(),
  }),
})