import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

function keyFrom(secret: string) {
	return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string, secret: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

export function decryptSecret(value: string, secret: string): string {
	const [version, iv, tag, encrypted] = value.split(".");
	if (version !== "v1" || !iv || !tag || !encrypted) {
		throw new Error("Unsupported encrypted secret format.");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		keyFrom(secret),
		Buffer.from(iv, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(encrypted, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
