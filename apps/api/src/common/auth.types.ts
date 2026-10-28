import { UserRole } from '@prisma/client';
export type AuthUser = {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
  authType?: 'JWT' | 'API_KEY';
  scopes?: string[];
};
