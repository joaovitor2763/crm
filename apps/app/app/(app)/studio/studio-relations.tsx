import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import type { RouterOutputs } from "@/lib/trpc/types";
import { relationRows } from "./studio-data";

type Schema = RouterOutputs["fields"]["schema"];

export function StudioRelations({ schema }: { schema?: Schema }) {
	if (!schema) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Relations are not available in this scope</EmptyTitle>
					<EmptyDescription>
						The Studio only renders relations returned by the governed fields
						contract. Grant fields read access to inspect them here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const relations = relationRows(schema);

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Relation graph</CardTitle>
					<CardDescription>
						Definitions are read from the current object schema; record links
						are still governed by their owning module.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{relations.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No relation definitions yet</EmptyTitle>
								<EmptyDescription>
									Create a relation from the Fields settings view to make the
									business ontology explicit.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="grid gap-2">
							{relations.map((relation) => (
								<div
									key={relation.id}
									className="grid gap-2 border p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center"
								>
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">
											{relation.source}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{relation.name} · {relation.key}
										</p>
									</div>
									<StatusIndicator tone="info" label={relation.cardinality} />
									<div className="min-w-0 md:text-right">
										<p className="truncate font-medium text-sm">
											{relation.target}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											Inverse: {relation.inverseName}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Object inventory</CardTitle>
					<CardDescription>
						Custom fields remain attached to their object definition.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2 md:grid-cols-2">
					{schema.map((object) => (
						<div key={object.id} className="border p-3">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="font-medium text-sm">{object.pluralName}</p>
									<p className="text-muted-foreground text-xs">
										{object.kind} · {object.key}
									</p>
								</div>
								<StatusIndicator
									tone="neutral"
									label={`${object.fields.length} fields`}
								/>
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
