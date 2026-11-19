/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import createNextIntlPlugin from 'next-intl/plugin';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const withNextIntl = createNextIntlPlugin();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const json = require("./package.json");

const securityHeaders = [
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'X-Frame-Options', value: 'SAMEORIGIN' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
	{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
	{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
	{ key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const telemetryEnabled = process.env.ENABLE_EXTERNAL_TELEMETRY === 'true';

const contentSecurityPolicy = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://eu-assets.i.posthog.com${telemetryEnabled ? ' https://opentech-ux.org' : ''}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	`connect-src 'self' ws: wss: https://eu.i.posthog.com https://api.github.com https://hub.docker.com https://github.com${telemetryEnabled ? ' https://cattlemoontwelve.ux-key.com https://opentech-ux.org' : ''}`,
	"worker-src 'self' blob:",
	"frame-ancestors 'self'",
	"base-uri 'none'",
	"form-action 'self'",
].join('; ');

securityHeaders.push({ key: 'Content-Security-Policy', value: contentSecurityPolicy });

if ((process.env.URL || '').startsWith('https://')) {
	securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
}

const nextConfig = {
	output: 'standalone',
	poweredByHeader: false,
	outputFileTracingRoot: __dirname,
	typescript: {
		ignoreBuildErrors: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	images: {
		remotePatterns: [new URL('https://directus.composecraft.com/assets/**')],
	},
	experimental: {
		// Saving a project embeds a canvas screenshot (base64 PNG). The default
		// 1 MB Server Action limit silently breaks saves for large diagrams.
		serverActions: {
			bodySizeLimit: '4mb',
		},
	},
	env: {
		NEXT_PUBLIC_VERSION: json.version,
	},
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: securityHeaders,
			},
		];
	},
	async rewrites() {
		return [
			{
				source: "/mesures/static/:path*",
				destination: "https://eu-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/mesures/:path*",
				destination: "https://eu.i.posthog.com/:path*",
			},
		];
	},
	skipTrailingSlashRedirect: true,
};

export default withNextIntl(nextConfig);