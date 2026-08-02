"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type {
	OntologyDetail as OntologyDetailRecord,
	OntologyImpact,
	OntologySnapshot,
} from "./studio-ontology-data";

export function OntologyVersionDetail({
	detail,
	impact,
	canManage,
	busy,
	onReplace,
	onPublish,
}: {
	detail: OntologyDetailRecord;
	impact: { impact: OntologyImpact } | undefined;
	canManage: boolean;
	busy: boolean;
	onReplace: () => void;
	onPublish: () => void;
}) {
	const snapshot = detail.snapshot as OntologySnapshot | undefined;
	return (
		<div className="flex flex-col gap-5">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>
								{detail.schemaDefinition?.name ?? "Ontology schema"}
							</CardTitle>
							<CardDescription>
								Version {detail.version} · {detail.status} ·{" "}
								{detail.checksum.slice(0, 12)}
							</CardDescription>
						</div>
						{canManage && detail.status === "DRAFT" ? (
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									disabled={busy || !snapshot}
									onClick={onReplace}
								>
									Replace snapshot
								</Button>
								<Button type="button" disabled={busy} onClick={onPublish}>
									Publish version
								</Button>
							</div>
						) : null}
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="grid gap-2 sm:grid-cols-3">
						<ImpactStat label="Objects" value={snapshot?.objects.length ?? 0} />
						<ImpactStat
							label="Relations"
							value={snapshot?.relations.length ?? 0}
						/>
						<ImpactStat
							label="Fields"
							value={
								snapshot?.objects.reduce(
									(total, object) => total + object.fields.length,
									0,
								) ?? 0
							}
						/>
					</div>
					{impact ? <ImpactPanel impact={impact.impact} /> : null}
				</CardContent>
			</Card>
		</div>
	);
}

function ImpactStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="border p-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 font-medium text-sm">{value}</p>
		</div>
	);
}

function ImpactPanel({ impact }: { impact: OntologyImpact }) {
	return (
		<div className="flex flex-col gap-3 border-t pt-4">
			<div>
				<p className="font-medium text-sm">Impact preview</p>
				<p className="text-muted-foreground text-xs">
					Compared with the latest published version.
				</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-3">
				<ImpactStat
					label="Added"
					value={
						impact.objects.added.length +
						impact.fields.added.length +
						impact.relations.added.length
					}
				/>
				<ImpactStat
					label="Changed"
					value={
						impact.objects.changed.length +
						impact.fields.changed.length +
						impact.relations.changed.length
					}
				/>
				<ImpactStat label="Breaking" value={impact.breakingChanges.length} />
			</div>
			{impact.breakingChanges.length ? (
				<ul className="flex flex-col gap-1 border border-destructive/40 p-3 text-destructive text-xs">
					{impact.breakingChanges.map((change) => (
						<li key={change}>{change}</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-xs">
					No breaking changes detected.
				</p>
			)}
		</div>
	);
}
