import { AccessScope, PermissionAction } from "@crm/db";
import { z } from "zod";

const key = z
	.string()
	.trim()
	.min(2)
	.max(64)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words and hyphens.");

export const businessUnitCreateInput = z.object({
	name: z.string().trim().min(1).max(120),
	key,
	parentId: z.string().nullable().optional(),
	leaderId: z.string().nullable().optional(),
});

export const businessUnitUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).max(120).optional(),
	parentId: z.string().nullable().optional(),
	leaderId: z.string().nullable().optional(),
});

export const teamCreateInput = z.object({
	name: z.string().trim().min(1).max(120),
	key,
	businessUnitId: z.string(),
	leaderId: z.string().nullable().optional(),
});

export const teamUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).max(120).optional(),
	leaderId: z.string().nullable().optional(),
});

export const roleCreateInput = z.object({
	name: z.string().trim().min(1).max(120),
	key,
	description: z.string().trim().max(500).nullable().optional(),
});

export const roleUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(500).nullable().optional(),
});

export const rolePermissionInput = z.object({
	roleId: z.string(),
	resource: key,
	action: z.enum(PermissionAction),
	scope: z.enum(AccessScope),
});

export const userAccessUpdateInput = z.object({
	userId: z.string(),
	roleId: z.string(),
	status: z.enum(["ACTIVE", "SUSPENDED"]),
	primaryBusinessUnitId: z.string().nullable(),
	primaryTeamId: z.string().nullable(),
	businessUnitIds: z.array(z.string()).default([]),
	teamIds: z.array(z.string()).default([]),
	managedTeamIds: z.array(z.string()).default([]),
});

export const governanceIdInput = z.object({ id: z.string() });

export const workspaceConfigurationUpdateInput = z.object({
	currency: z
		.string()
		.trim()
		.length(3)
		.regex(/^[A-Z]{3}$/, "Use an ISO 4217 currency code."),
});

export type WorkspaceConfigurationUpdateInput = z.infer<
	typeof workspaceConfigurationUpdateInput
>;

export type BusinessUnitCreateInput = z.infer<typeof businessUnitCreateInput>;
export type BusinessUnitUpdateInput = z.infer<typeof businessUnitUpdateInput>;
export type TeamCreateInput = z.infer<typeof teamCreateInput>;
export type TeamUpdateInput = z.infer<typeof teamUpdateInput>;
export type RoleCreateInput = z.infer<typeof roleCreateInput>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInput>;
export type RolePermissionInput = z.infer<typeof rolePermissionInput>;
export type UserAccessUpdateInput = z.infer<typeof userAccessUpdateInput>;
