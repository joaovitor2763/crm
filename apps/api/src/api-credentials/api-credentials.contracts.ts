import { ApiCredentialAccessMode } from "@crm/db";
import { z } from "zod";

export const apiCredentialCreateInput = z
	.object({
		name: z.string().trim().min(1).max(120),
		accessMode: z
			.enum(ApiCredentialAccessMode)
			.default(ApiCredentialAccessMode.SCOPED_ROLE),
		roleId: z.string().optional(),
		businessUnitIds: z.array(z.string()).default([]),
		teamIds: z.array(z.string()).default([]),
		expiresAt: z.iso.datetime().nullable().optional(),
	})
	.superRefine((input, context) => {
		if (input.accessMode !== ApiCredentialAccessMode.SCOPED_ROLE) return;
		if (!input.roleId) {
			context.addIssue({
				code: "custom",
				path: ["roleId"],
				message: "Role is required for a scoped credential.",
			});
		}
		if (input.businessUnitIds.length === 0) {
			context.addIssue({
				code: "custom",
				path: ["businessUnitIds"],
				message: "At least one business unit is required.",
			});
		}
	});

export const apiCredentialIdInput = z.object({ id: z.string() });

export type ApiCredentialCreateInput = z.input<typeof apiCredentialCreateInput>;
