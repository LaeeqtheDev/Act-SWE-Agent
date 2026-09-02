import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The user's saved details, used to fill forms the agent encounters (job
// applications, contact forms, signups) without making them retype the
// same information every time. Scoped per-user in hosted mode; a single
// shared row in self-host, same pattern as settings.ts.

function rowId(userId?: string): string {
  return userId ?? "default";
}

export async function getUserProfile(userId?: string) {
  const profile = await prisma.userProfile.findUnique({ where: { id: rowId(userId) } });
  if (!profile) return null;
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    country: profile.country,
    dialCode: profile.dialCode,
    linkedin: profile.linkedin,
    github: profile.github,
    website: profile.website,
    resume: profile.resume,
    extra: profile.extra,
  };
}

export interface ProfileInput {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  country?: string;
  dialCode?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  resume?: string;
  extra?: Record<string, unknown>;
}

export async function saveUserProfile(input: ProfileInput, userId?: string) {
  const id = rowId(userId);
  const data = {
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    location: input.location,
    country: input.country,
    dialCode: input.dialCode,
    linkedin: input.linkedin,
    github: input.github,
    website: input.website,
    resume: input.resume,
    extra: input.extra as object | undefined,
  };
  return prisma.userProfile.upsert({ where: { id }, create: { id, ...data }, update: data });
}
