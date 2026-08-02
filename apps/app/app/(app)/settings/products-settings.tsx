"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Product = RouterOutputs["products"]["list"][number];

export function ProductsSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const products = useQuery(
		trpc.products.list.queryOptions({ includeArchived: true }),
	);
	const directory = useQuery(trpc.governance.directory.queryOptions());
	const [sku, setSku] = useState("");
	const [name, setName] = useState("");
	const [price, setPrice] = useState("");
	const [currency, setCurrency] = useState("USD");
	const [businessUnitId, setBusinessUnitId] = useState("");
	const done = async (message: string) => {
		await cache.products();
		toast.success(message);
	};
	const fail = (error: { message: string }) => {
		toast.error(error.message);
	};
	const create = useMutation(
		trpc.products.create.mutationOptions({
			onSuccess: async () => {
				setSku("");
				setName("");
				setPrice("");
				await done("Product created.");
			},
			onError: fail,
		}),
	);
	const update = useMutation(
		trpc.products.update.mutationOptions({
			onSuccess: () => done("Product updated."),
			onError: fail,
		}),
	);
	const archive = useMutation(
		trpc.products.archive.mutationOptions({
			onSuccess: () => done("Product archived."),
			onError: fail,
		}),
	);
	const restore = useMutation(
		trpc.products.restore.mutationOptions({
			onSuccess: () => done("Product restored."),
			onError: fail,
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Product catalogue</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-2 md:grid-cols-[1fr_2fr_1fr_6rem_1fr_auto] md:items-end"
					onSubmit={(event) => {
						event.preventDefault();
						const parsed = Number.parseFloat(price);
						if (
							sku.trim() &&
							name.trim() &&
							currency.trim().length === 3 &&
							Number.isFinite(parsed)
						) {
							create.mutate({
								sku,
								name,
								priceCents: Math.round(parsed * 100),
								currency,
								businessUnitId: businessUnitId || undefined,
							});
						}
					}}
				>
					<Field>
						<FieldLabel htmlFor="product-sku">SKU</FieldLabel>
						<Input
							id="product-sku"
							value={sku}
							onChange={(event) => setSku(event.target.value)}
							placeholder="CRM-PRO"
						/>
					</Field>
					<Field>
						<FieldLabel>Business unit</FieldLabel>
						<Select value={businessUnitId} onValueChange={setBusinessUnitId}>
							<SelectTrigger>
								<SelectValue placeholder="Primary unit" />
							</SelectTrigger>
							<SelectContent>
								{(directory.data?.businessUnits ?? []).map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="product-name">Name</FieldLabel>
						<Input
							id="product-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="CRM Pro"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="product-price">Price</FieldLabel>
						<Input
							id="product-price"
							value={price}
							onChange={(event) => setPrice(event.target.value)}
							inputMode="decimal"
							placeholder="9900"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="product-currency">Currency</FieldLabel>
						<Input
							id="product-currency"
							value={currency}
							onChange={(event) =>
								setCurrency(event.target.value.toUpperCase())
							}
							maxLength={3}
							placeholder="USD"
						/>
					</Field>
					<Button type="submit" disabled={create.isPending}>
						Create
					</Button>
				</form>

				<div className="flex flex-col gap-2">
					{(products.data ?? []).map((product) => (
						<ProductRow
							key={product.id}
							product={product}
							onSave={(values) => update.mutate({ id: product.id, ...values })}
							onArchive={() => archive.mutate({ id: product.id })}
							onRestore={() => restore.mutate({ id: product.id })}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function ProductRow({
	product,
	onSave,
	onArchive,
	onRestore,
}: {
	product: Product;
	onSave: (values: {
		sku: string;
		name: string;
		priceCents: number;
		currency: string;
	}) => void;
	onArchive: () => void;
	onRestore: () => void;
}) {
	return (
		<form
			className="grid gap-2 md:grid-cols-[1fr_2fr_1fr_5rem_auto_auto] md:items-center"
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				const parsed = Number.parseFloat(String(data.get("price") ?? ""));
				if (!Number.isFinite(parsed)) return;
				onSave({
					sku: String(data.get("sku") ?? ""),
					name: String(data.get("name") ?? ""),
					priceCents: Math.round(parsed * 100),
					currency: String(data.get("currency") ?? ""),
				});
			}}
		>
			<Input name="sku" defaultValue={product.sku} aria-label="SKU" />
			<Input
				name="name"
				defaultValue={product.name}
				aria-label="Product name"
			/>
			<Input
				name="price"
				defaultValue={(product.priceCents / 100).toFixed(2)}
				inputMode="decimal"
				aria-label="Product price"
			/>
			<Input
				name="currency"
				defaultValue={product.currency}
				maxLength={3}
				aria-label="Product currency"
			/>
			{product.archivedAt ? (
				<StatusIndicator tone="neutral" label="Archived" />
			) : (
				<span className="text-muted-foreground text-xs">
					{product._count.lineItems} line items
				</span>
			)}
			<div className="flex gap-2">
				<Button type="submit" variant="outline" size="sm">
					Save
				</Button>
				{product.archivedAt ? (
					<Button type="button" variant="outline" size="sm" onClick={onRestore}>
						Restore
					</Button>
				) : (
					<Button type="button" variant="outline" size="sm" onClick={onArchive}>
						Archive
					</Button>
				)}
			</div>
		</form>
	);
}
