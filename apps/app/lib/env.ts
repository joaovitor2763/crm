/**
 * Where the NestJS API actually lives.
 *
 * Server-side calls and the same-origin `/api/*` proxy prefer the private
 * `API_URL`. The browser may use a different `NEXT_PUBLIC_API_URL` (normally the
 * app origin) when separate deployment hostnames cannot share cookies.
 */
export const API_URL =
	process.env.API_URL ??
	process.env.NEXT_PUBLIC_API_URL ??
	"http://localhost:3001";
