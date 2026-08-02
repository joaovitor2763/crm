"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Overview = RouterOutputs["governance"]["overview"];
type User = Overview["users"][number];

const NONE = "__none__";

export function GovernanceSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const overview = useQuery(trpc.governance.overview.queryOptions());
	const refresh = async (message: string) => {
		await queryClient.invalidateQueries(trpc.governance.overview.queryFilter());
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);
	const createUnit = useMutation(
		trpc.governance.createBusinessUnit.mutationOptions({
			onSuccess: () => refresh("Business unit created."),
			onError: fail,
		}),
	);
	const createTeam = useMutation(
		trpc.governance.createTeam.mutationOptions({
			onSuccess: () => refresh("Team created."),
			onError: fail,
		}),
	);
	const createRole = useMutation(
		trpc.governance.createRole.mutationOptions({
			onSuccess: () => refresh("Role created."),
			onError: fail,
		}),
	);
	const setPermission = useMutation(
		trpc.governance.setRolePermission.mutationOptions({
			onSuccess: () => refresh("Role permission updated."),
			onError: fail,
		}),
	);
	const setUser = useMutation(
		trpc.governance.setUserAccess.mutationOptions({
			onSuccess: () => refresh("User access updated."),
			onError: fail,
		}),
	);
	const data = overview.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Governance</CardTitle>
				<CardDescription>
					One role per user, with visibility composed from business units and
					teams.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 xl:grid-cols-3">
					<CreateUnitForm data={data} mutate={createUnit.mutate} />
					<CreateTeamForm data={data} mutate={createTeam.mutate} />
					<CreateRoleForm mutate={createRole.mutate} />
				</div>

				{data ? (
					<PermissionForm data={data} mutate={setPermission.mutate} />
				) : null}

				<div className="flex flex-col gap-3">
					{data?.users.map((user) => (
						<UserAccessForm
							key={user.id}
							user={user}
							data={data}
							mutate={setUser.mutate}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function CreateUnitForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		key: string;
		parentId?: string | null;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const parent = String(form.get("parentId") ?? NONE);
				mutate({
					name: String(form.get("name") ?? ""),
					key: String(form.get("key") ?? ""),
					parentId: parent === NONE ? null : parent,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="unit-name">New business unit</FieldLabel>
					<Input id="unit-name" name="name" placeholder="Brazil" required />
				</Field>
				<Field>
					<FieldLabel htmlFor="unit-key">Key</FieldLabel>
					<Input id="unit-key" name="key" placeholder="brazil" required />
				</Field>
				<Field>
					<FieldLabel>Parent</FieldLabel>
					<Select name="parentId" defaultValue={NONE}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={NONE}>Root</SelectItem>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Button type="submit">Create unit</Button>
			</FieldGroup>
		</form>
	);
}

function CreateTeamForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		key: string;
		businessUnitId: string;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					name: String(form.get("name") ?? ""),
					key: String(form.get("key") ?? ""),
					businessUnitId: String(form.get("businessUnitId") ?? ""),
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="team-name">New team</FieldLabel>
					<Input
						id="team-name"
						name="name"
						placeholder="Enterprise sales"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="team-key">Key</FieldLabel>
					<Input
						id="team-key"
						name="key"
						placeholder="enterprise-sales"
						required
					/>
				</Field>
				<Field>
					<FieldLabel>Business unit</FieldLabel>
					<Select name="businessUnitId" required>
						<SelectTrigger>
							<SelectValue placeholder="Select" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Button type="submit">Create team</Button>
			</FieldGroup>
		</form>
	);
}

function CreateRoleForm({
	mutate,
}: {
	mutate: (input: {
		name: string;
		key: string;
		description?: string | null;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					name: String(form.get("name") ?? ""),
					key: String(form.get("key") ?? ""),
					description: String(form.get("description") ?? "") || null,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="role-name">New role</FieldLabel>
					<Input
						id="role-name"
						name="name"
						placeholder="Partner manager"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="role-key">Key</FieldLabel>
					<Input
						id="role-key"
						name="key"
						placeholder="partner-manager"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="role-description">Description</FieldLabel>
					<Input id="role-description" name="description" />
				</Field>
				<Button type="submit">Create role</Button>
			</FieldGroup>
		</form>
	);
}

function PermissionForm({
	data,
	mutate,
}: {
	data: Overview;
	mutate: (input: {
		roleId: string;
		resource: string;
		action:
			| "READ"
			| "CREATE"
			| "UPDATE"
			| "ARCHIVE"
			| "RESTORE"
			| "DESTROY"
			| "TRANSFER"
			| "MANAGE"
			| "EXPORT";
		scope:
			| "NONE"
			| "OWNED"
			| "TEAM"
			| "MANAGED_TEAMS"
			| "BUSINESS_UNIT"
			| "BUSINESS_UNIT_TREE"
			| "ALL";
	}) => void;
}) {
	return (
		<form
			className="grid gap-2 md:grid-cols-4 md:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					roleId: String(form.get("roleId")),
					resource: String(form.get("resource")),
					action: String(form.get("action")) as Parameters<
						typeof mutate
					>[0]["action"],
					scope: String(form.get("scope")) as Parameters<
						typeof mutate
					>[0]["scope"],
				});
			}}
		>
			<Field>
				<FieldLabel>Role permission</FieldLabel>
				<Select name="roleId" required>
					<SelectTrigger>
						<SelectValue placeholder="Role" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data.roles
								.filter((role) => !role.isAdmin)
								.map((role) => (
									<SelectItem key={role.id} value={role.id}>
										{role.name}
									</SelectItem>
								))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel htmlFor="permission-resource">Resource</FieldLabel>
				<Input
					id="permission-resource"
					name="resource"
					placeholder="contacts"
					required
				/>
			</Field>
			<Field>
				<FieldLabel>Action and scope</FieldLabel>
				<div className="flex gap-2">
					<Select name="action" defaultValue="READ">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{[
									"READ",
									"CREATE",
									"UPDATE",
									"ARCHIVE",
									"RESTORE",
									"MANAGE",
									"EXPORT",
								].map((action) => (
									<SelectItem key={action} value={action}>
										{action}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Select name="scope" defaultValue="BUSINESS_UNIT">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{[
									"NONE",
									"OWNED",
									"TEAM",
									"MANAGED_TEAMS",
									"BUSINESS_UNIT",
									"BUSINESS_UNIT_TREE",
									"ALL",
								].map((scope) => (
									<SelectItem key={scope} value={scope}>
										{scope}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</Field>
			<Button type="submit">Save permission</Button>
		</form>
	);
}

function UserAccessForm({
	user,
	data,
	mutate,
}: {
	user: User;
	data: Overview;
	mutate: (input: {
		userId: string;
		roleId: string;
		status: "ACTIVE" | "SUSPENDED";
		primaryBusinessUnitId: string | null;
		primaryTeamId: string | null;
		businessUnitIds?: string[];
		teamIds?: string[];
		managedTeamIds?: string[];
	}) => void;
}) {
	const teams = data.businessUnits.flatMap((unit) => unit.teams);
	return (
		<form
			className="grid gap-2 border p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const unitId = String(form.get("unitId") ?? NONE);
				const teamId = String(form.get("teamId") ?? NONE);
				mutate({
					userId: user.id,
					roleId: String(form.get("roleId")),
					status: String(form.get("status")) as "ACTIVE" | "SUSPENDED",
					primaryBusinessUnitId: unitId === NONE ? null : unitId,
					primaryTeamId: teamId === NONE ? null : teamId,
					businessUnitIds: unitId === NONE ? [] : [unitId],
					teamIds: teamId === NONE ? [] : [teamId],
					managedTeamIds: [],
				});
			}}
		>
			<div>
				<p className="text-sm font-medium">{user.name}</p>
				<p className="text-xs text-muted-foreground">{user.email}</p>
			</div>
			<Select name="roleId" defaultValue={user.access?.role.id}>
				<SelectTrigger aria-label="Role">
					<SelectValue placeholder="Role" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{data.roles.map((role) => (
							<SelectItem key={role.id} value={role.id}>
								{role.name}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<Select
				name="unitId"
				defaultValue={user.access?.primaryBusinessUnit?.id ?? NONE}
			>
				<SelectTrigger aria-label="Business unit">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value={NONE}>No unit</SelectItem>
						{data.businessUnits.map((unit) => (
							<SelectItem key={unit.id} value={unit.id}>
								{unit.name}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<Select name="teamId" defaultValue={user.access?.primaryTeam?.id ?? NONE}>
				<SelectTrigger aria-label="Team">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value={NONE}>No team</SelectItem>
						{teams.map((team) => (
							<SelectItem key={team.id} value={team.id}>
								{team.name}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<div className="flex gap-2">
				<Select name="status" defaultValue={user.access?.status ?? "ACTIVE"}>
					<SelectTrigger aria-label="Status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="ACTIVE">Active</SelectItem>
							<SelectItem value="SUSPENDED">Suspended</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
				<Button type="submit" variant="outline">
					Save
				</Button>
			</div>
		</form>
	);
}
