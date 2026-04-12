export interface SeedUser {
  id: string;
  email: string;
  document: string;
  password: string;
  name: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
}
