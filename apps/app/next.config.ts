import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@crm/env";
import type { NextConfig } from "next";

// Next only looks for `.env` files beside the app. The one in this repo is at
// the workspace root, so it is read here — before `env` below is evaluated.
loadRootEnv();

/**
 * The auth origin published to the browser.
 *
 * Usually this is the API itself. Deployments on unrelated hostnames (including
 * two `*.vercel.app` projects) cannot share an auth cookie, though, so the
 * browser may instead use the app's same-origin `/api/*` proxy while server
 * components continue to call the real API through `API_URL`.
 *
 * `env` rather than a runtime read, because `NEXT_PUBLIC_*` is inlined at build
 * time and a value that only exists in the root `.env` would otherwise be
 * `undefined` in the bundle.
 */
const publicApiUrl =
	process.env.NEXT_PUBLIC_API_URL ??
	process.env.API_URL ??
	"http://localhost:3001";

const nextConfig: NextConfig = {
	turbopack: {
		root: fileURLToPath(new URL("../..", import.meta.url)),
	},

	env: {
		NEXT_PUBLIC_API_URL: publicApiUrl,
	},

	// The @crm/* packages are just-in-time: they ship TypeScript sources, so
	// Next has to compile them rather than treat them as prebuilt dependencies.
	transpilePackages: ["@crm/auth", "@crm/db", "@crm/ui"],

	// Prisma's runtime and the pg driver are Node-only and resolve files at
	// runtime; bundling them breaks that. @crm/db itself is still transpiled.
	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

	images: {
		remotePatterns: [
			// Google account avatars, which arrive as `user.image`.
			{ protocol: "https", hostname: "lh3.googleusercontent.com" },
		],
	},

	experimental: {
		// The app shell uses `view-transition-name` and <Link transitionTypes>.
		viewTransition: true,
	},
};

export default nextConfig;
