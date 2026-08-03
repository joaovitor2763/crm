import { hashPassword } from "better-auth/crypto";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** Uses the same scrypt implementation as Better Auth's credential routes. */
export function hashCredentialPassword(password: string): Promise<string> {
	return hashPassword(password);
}
