/**
 * Representación del usuario en API (sin password).
 * Alineado con los campos persistidos en Mongo.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  lastName: string;
  document: string;
  roles?: string[];
  company?: string;
  branchId?: string;
  /** Presente solo en algunos listados enriquecidos. */
  branchName?: string;
  isActive: boolean;
  lastAccessAt?: string;
}
