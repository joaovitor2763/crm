/**
 * Builds the API as a single Vercel function, via the Build Output API.
 *
 * Vercel's own tracing cannot deploy this app: the workspace packages export
 * raw TypeScript (`@crm/auth` -> src/index.ts), and every relative import in
 * `src` is extensionless because the repo compiles with
 * `moduleResolution: "Bundler"`. Traced and run as-is, Node fails on one or
 * the other — a missing `.ts`, or a missing `./create-app`.
 *
 * Bundling settles both at build time: bun resolves the whole graph, inlines
 * the workspace source, and emits one ESM file with no runtime resolution
 * left to do. Nothing about how the packages export has to change.
 */
import { execSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(apiDir));
const outDir = join(repoRoot, ".vercel/output");
const funcDir = join(outDir, "functions/api/index.func");
const bun = process.env.BUN_BIN || "bun";

/**
 * Left out of the bundle.
 *
 * The `@nestjs/*` entries are optional platforms Nest probes for at runtime
 * and this app never installs; bundling them turns an absent peer into a
 * build error. The rest are native or environment-specific modules that
 * cannot survive being inlined.
 */
const EXTERNALS = [
	"@nestjs/microservices",
	"@nestjs/websockets",
	"@nestjs/platform-fastify",
	"@nestjs/graphql",
	"@nestjs/swagger",
	"class-transformer/storage",
	"pg-native",
	"better-sqlite3",
	"cardinal",
];

/**
 * Copied into the function's `node_modules` instead of bundled.
 *
 * Express is resolved by name at runtime by `@nestjs/platform-express`, so a
 * bundled copy is invisible to it.
 */
const VENDOR_ROOTS = ["express"];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(funcDir, { recursive: true });

console.log("• bundling function with bun build...");
execSync(
	[
		`${bun} build api/index.ts`,
		"--target=node",
		"--format=esm",
		`--outfile=${JSON.stringify(join(funcDir, "index.mjs"))}`,
		...EXTERNALS.map((e) => `--external ${e}`),
	].join(" "),
	// NODE_ENV matters at *build* time, not just at run time: bun constant-folds
	// `process.env.NODE_ENV`, so `isProduction` in @crm/auth is burned into the
	// bundle as a literal. Built without this, it folds to `false`, Better Auth
	// drops the `__Secure-` cookie prefix, the app's proxy looks for the
	// prefixed name over HTTPS and bounces every signed-in user to /sign-in.
	{
		cwd: apiDir,
		stdio: "inherit",
		env: { ...process.env, NODE_ENV: "production" },
	},
);

/**
 * Pin NODE_ENV at run time too.
 *
 * The line above settles everything bun folded, but vendored and external
 * packages still read `process.env.NODE_ENV` themselves, and Vercel does not
 * inject it into functions declared through the Build Output API (it also
 * strips the name from a function's `environment` map, since it is reserved).
 *
 * `??=` so a real environment value still wins, and prepended rather than
 * `--define`d because it has to run before any bundled module body reads it.
 */
console.log("• pinning NODE_ENV in the bundle...");
const entry = join(funcDir, "index.mjs");
writeFileSync(
	entry,
	`process.env.NODE_ENV ??= "production";\n${readFileSync(entry, "utf8")}`,
);

/**
 * Vendoring walks bun's store rather than resolving by name across it.
 *
 * A store holds several versions of the same package side by side, so
 * resolving by name alone can copy a version the dependent never asked for.
 * Each `.bun/<pkg>@<ver>/node_modules/` entry links the exact versions that
 * package resolves to, so dependencies are followed from there.
 */
console.log("• vendoring runtime-resolved dependencies...");
const bunStore = join(repoRoot, "node_modules/.bun");
const stores = existsSync(bunStore) ? readdirSync(bunStore) : [];
const funcNm = join(funcDir, "node_modules");
mkdirSync(funcNm, { recursive: true });
let vendorCount = 0;

function findInStore(name) {
	const enc = name.replace(/\//g, "+");
	for (const d of stores.filter((s) => s.startsWith(`${enc}@`))) {
		const p = join(bunStore, d, "node_modules", name);
		if (existsSync(p)) return p;
	}
	return null;
}

function packageVersion(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
	} catch {
		return null;
	}
}

function resolveDep(realDir, name, depName) {
	const storeNm = realDir.slice(0, realDir.length - name.length);
	const candidate = join(storeNm, depName);
	if (existsSync(candidate)) return realpathSync(candidate);
	return findInStore(depName);
}

function place(realDir, dest) {
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(realDir, dest, { recursive: true, dereference: true });
	vendorCount++;
}

function vendorDeps(realDir, name, placedDir) {
	let pj;
	try {
		pj = JSON.parse(readFileSync(join(realDir, "package.json"), "utf8"));
	} catch {
		return;
	}
	for (const depName of Object.keys(pj.dependencies || {})) {
		const depReal = resolveDep(realDir, name, depName);
		if (!depReal) {
			console.warn(`  ! not found: ${depName} (needed by ${name})`);
			continue;
		}
		vendor(depName, depReal, placedDir);
	}
}

function vendor(name, realDir, dependentDir) {
	const rootDest = join(funcNm, name);
	if (!existsSync(rootDest)) {
		place(realDir, rootDest);
		vendorDeps(realDir, name, rootDest);
		return;
	}
	if (packageVersion(rootDest) === packageVersion(realDir)) return;
	const nested = join(dependentDir, "node_modules", name);
	if (existsSync(nested)) return;
	place(realDir, nested);
	vendorDeps(realDir, name, nested);
}

for (const root of VENDOR_ROOTS) {
	const dir = findInStore(root);
	if (!dir) {
		console.warn(`  ! not found: ${root}`);
		continue;
	}
	vendor(root, realpathSync(dir), funcNm);
}
console.log(`  vendored ${vendorCount} packages`);

writeFileSync(
	join(funcDir, "package.json"),
	JSON.stringify({ type: "module" }),
);
writeFileSync(
	join(funcDir, ".vc-config.json"),
	JSON.stringify({
		runtime: "nodejs22.x",
		handler: "index.mjs",
		launcherType: "Nodejs",
		shouldAddHelpers: false,
		maxDuration: 60,
		memory: 1769,
		/**
		 * Vercel injects NODE_ENV for framework builds but not for functions
		 * declared through the Build Output API, and Better Auth keys
		 * `useSecureCookies` off it. Unset, it issued the session cookie without
		 * the `__Secure-` prefix, the app's proxy looked for the prefixed name
		 * over HTTPS, found nothing, and bounced every signed-in user back to
		 * /sign-in. It also selects JSON logging over the colourised dev sink.
		 */
		environment: { NODE_ENV: "production" },
		// Beside the database: Neon is us-east-1, and every request makes
		// several round trips to it.
		regions: ["iad1"],
	}),
);
writeFileSync(
	join(outDir, "config.json"),
	JSON.stringify({
		version: 3,
		// Nest owns its own routing — /health, /api/auth/*, /api/trpc/* — so
		// everything goes to the one function.
		routes: [{ src: "/(.*)", dest: "/api/index" }],
		/**
		 * The Gmail and Calendar sync.
		 *
		 * Declared here rather than in `apps/api/vercel.json`, because that file
		 * is never read: this project's Root Directory is the repository root,
		 * so Vercel looks for `/vercel.json` and the one beside the app is
		 * inert. The cron silently did not exist — the sync only ever ran when
		 * somebody called the route by hand, and the CRM quietly stopped
		 * learning anything new from the mailbox.
		 *
		 * A root `vercel.json` is not the fix, because `crm-agent` builds from
		 * the same root directory and would inherit a schedule for a route it
		 * does not serve. The Build Output API is per-project by construction.
		 *
		 * The route fails closed without `CRON_SECRET`, so this is safe to
		 * declare unconditionally.
		 */
		// Hobby projects allow daily schedules only. This keeps sync automatic
		// without requiring a paid plan; Pro deployments can raise the cadence.
		crons: [{ path: "/internal/sync/google", schedule: "0 9 * * *" }],
	}),
);

console.log(`✓ built ${outDir}`);
