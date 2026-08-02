import { z } from "zod";

export const apiCredentialCreateInput = z.object({
	name: z.string().trim().min(1).max(120),
	roleId: z.string(),
	businessUnitIds: z.array(z.string()).min(1),
	teamIds: z.array(z.string()).default([]),
	expiresAt: z.iso.datetime().nullable().optional(),
});

export const apiCredentialIdInput = z.object({ id: z.string() });

export type ApiCredentialCreateInput = z.infer<typeof apiCredentialCreateInput>;
