'use server'

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import net from 'net';
import { randomBytes } from 'node:crypto';
import YAML from 'yaml';
import { ActionError, assertManagedProject, requireAdmin, requireCompose, requireUser } from "@/lib/authorization";
import { validateComposePolicy } from "@/lib/composePolicy";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "bson";
import { composeMetadata, generateHACompose, generateAllHAConfigs } from "@/lib/metadata";
import type { DatabaseHAConfig } from "@/types/library";
import type { HaDeploymentConfig } from "@/components/playground/haDeploymentDialog";
import { patchComposeYaml } from '@/lib/dockerCompose';
import {
    assertComposeId,
    assertDockerIdList,
    assertDockerReference,
    COMPOSE_PROJECT_PREFIX,
    composeProjectName,
    composeWorkDir,
    runCompose as runComposeCli,
    runDocker,
} from '@/lib/dockerExec';

const execAsync = promisify(exec);

function policyOptions(session?: { role: 'admin' | 'user' }) {
    const hostAccess = process.env.ALLOW_COMPOSE_HOST_ACCESS === 'true';
    const isAdmin = session?.role === 'admin';
    return {
        // Host mounts, builds and the Docker socket are admin-only opt-ins:
        // they are equivalent to root on the host.
        allowHostMounts: hostAccess && isAdmin,
        allowBuild: process.env.ALLOW_COMPOSE_BUILD === 'true' && isAdmin,
        allowDockerSocket: hostAccess && isAdmin,
    };
}

function checkComposePolicy(doc: unknown, session?: { role: 'admin' | 'user' }): { error: string; code: string } | null {
    const result = validateComposePolicy(doc, policyOptions(session));
    return result.ok ? null : { error: result.message, code: result.code };
}

function databaseHaConfigFromDeployment(config: HaDeploymentConfig): DatabaseHAConfig {
    return {
        replication: {
            enabled: config.enabled,
            mode: 'async',
            primaryRegion: 'primary',
            replicas: config.enabled
                ? Array.from({ length: Math.max(1, config.minReplicas - 1) }, (_, index) => ({
                    region: `replica-${index + 1}`,
                    role: 'async' as const,
                    priority: 50,
                }))
                : [],
        },
        failover: {
            enabled: false,
            timeout: 30,
            maxRetries: 3,
            healthCheckInterval: 10,
            promotionPolicy: 'priority',
        },
        connectionPool: {
            enabled: config.enabled && config.enableConnectionPool,
            type: 'pgbouncer',
            mode: 'transaction',
            poolSize: 25,
            maxConnections: 100,
            idleTimeout: 600,
        },
        loadBalancer: {
            enabled: config.enabled && config.enableLoadBalancer,
            type: 'haproxy',
            algorithm: 'round-robin',
            healthCheckPath: '/',
            stickySessions: false,
            port: 5432,
            targetPort: 5432,
        },
        backup: {
            enabled: false,
            schedule: '0 3 * * *',
            retentionDays: 7,
            storage: 'local',
            encryption: false,
            pointInTimeRecovery: false,
        },
    };
}

function extractDbCredentials(compose: any) {
    const services = compose?.services ?? {};
    const entry = Object.values<any>(services).find((service) =>
        typeof service?.image === 'string' && service.image.toLowerCase().includes('postgres'),
    );

    const env = entry?.environment;
    const get = (key: string): string | undefined => {
        if (Array.isArray(env)) {
            const found = env.find((item: string) => typeof item === 'string' && item.startsWith(`${key}=`));
            return found ? found.slice(key.length + 1) : undefined;
        }
        if (env && typeof env === 'object') {
            const value = env[key];
            return typeof value === 'string' ? value : undefined;
        }
        return undefined;
    };

    return {
        dbName: get('POSTGRES_DB') || 'expanse',
        dbUser: get('POSTGRES_USER') || 'postgres',
        dbPassword: get('POSTGRES_PASSWORD') || cryptoRandomPassword(),
    };
}

function cryptoRandomPassword(): string {
    return randomBytes(24).toString('base64url');
}

async function requireProjectAccess(projectName: string, session: Awaited<ReturnType<typeof requireUser>>) {
    const project = assertDockerReference(projectName, 'project name');

    if (session.role === 'admin') {
        // Admins can manage any Expanse project; non-Expanse stacks still
        // require the explicit ALLOW_HOST_PROJECT_OPS opt-in.
        return assertManagedProject(project);
    }

    if (project.startsWith(COMPOSE_PROJECT_PREFIX)) {
        await requireCompose(project.slice(COMPOSE_PROJECT_PREFIX.length), session);
        return project;
    }

    throw new ActionError('FORBIDDEN', 'Only administrators can manage host projects');
}

async function getContainerOwnership(containerId: string): Promise<{ owner: string; project: string }> {
    const container = assertDockerReference(containerId, 'container id');
    try {
        const { stdout } = await runDocker([
            'inspect', '--format',
            '{{ index .Config.Labels "com.expanse.owner" }}|{{ index .Config.Labels "com.docker.compose.project" }}',
            container,
        ]);
        const [owner = '', project = ''] = stdout.trim().split('|');
        const clean = (value: string) => (value && value !== '<no value>' ? value.trim() : '');
        return { owner: clean(owner), project: clean(project) };
    } catch {
        throw new ActionError('CONTAINER_NOT_FOUND', 'Container not found');
    }
}

async function requireContainerAccess(containerId: string, session: Awaited<ReturnType<typeof requireUser>>) {
    const { owner, project } = await getContainerOwnership(containerId);

    if (session.role === 'admin') {
        if (owner || project.startsWith(COMPOSE_PROJECT_PREFIX)) return;
        if (process.env.ALLOW_HOST_PROJECT_OPS === 'true') return;
        throw new ActionError('FORBIDDEN_HOST_CONTAINER', 'Only Expanse containers can be managed');
    }

    if (owner && owner === session.userId.toString()) return;
    if (project.startsWith(COMPOSE_PROJECT_PREFIX)) {
        await requireCompose(project.slice(COMPOSE_PROJECT_PREFIX.length), session);
        return;
    }

    throw new ActionError('FORBIDDEN_HOST_CONTAINER', 'Only Expanse containers can be managed');
}

async function requireVolumeAccess(volumeName: string, session: Awaited<ReturnType<typeof requireUser>>) {
    const volume = assertDockerReference(volumeName, 'volume name');
    try {
        const { stdout } = await runDocker([
            'volume', 'inspect', '--format',
            '{{ index .Labels "com.docker.compose.project" }}',
            volume,
        ]);
        const project = stdout.trim();
        if (project.startsWith(COMPOSE_PROJECT_PREFIX)) {
            if (session.role === 'admin') return volume;
            await requireCompose(project.slice(COMPOSE_PROJECT_PREFIX.length), session);
            return volume;
        }
    } catch {
        throw new ActionError('VOLUME_NOT_FOUND', 'Volume not found');
    }

    if (session.role === 'admin' && process.env.ALLOW_HOST_PROJECT_OPS === 'true') return volume;
    throw new ActionError('FORBIDDEN_HOST_VOLUME', 'Only Expanse volumes can be managed');
}

export async function runCompose(
    composeId: string,
    yamlContent: string,
    haConfig?: HaDeploymentConfig
) {
    const session = await requireUser();
    const id = assertComposeId(composeId);
    // Ownership check: the compose id is not a capability.
    const doc = await requireCompose(id, session);
    const tempDir = composeWorkDir(id);
    await fs.mkdir(tempDir, { recursive: true });
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    let parsed: any;
    try {
        parsed = YAML.parse(yamlContent);
    } catch {
        return { success: false, code: 'INVALID_COMPOSE', error: 'The compose file is not valid YAML' };
    }

    const basePolicy = checkComposePolicy(parsed, session);
    if (basePolicy) return { success: false, ...basePolicy };

    const metadata = doc?.metadata as composeMetadata | undefined;
    const collection = (await getDb()).collection("composes");

    // Persist the dialog choice only after a successful deploy so a failed
    // attempt (port collision, invalid YAML) does not leave HA half-enabled.
    let persistedHa: DatabaseHAConfig | undefined;
    if (haConfig) {
        persistedHa = databaseHaConfigFromDeployment(haConfig);
    }

    const storedHa = (doc?.haEnabled === true ? doc.haConfig : undefined) as DatabaseHAConfig | undefined;
    const effectiveHa = persistedHa ?? storedHa;

    let finalYaml = YAML.stringify(parsed);
    let finalConfigs: Record<string, string> = {};

    if (effectiveHa?.replication?.enabled) {
        const dbCredentials = extractDbCredentials(parsed);
        const haResult = generateHACompose({
            baseCompose: parsed,
            haConfig: effectiveHa,
            projectName: `expanse-${id}`,
            dbCredentials,
        });

        const generatedPolicy = checkComposePolicy(haResult, session);
        if (generatedPolicy) return { success: false, ...generatedPolicy };

        finalYaml = YAML.stringify(haResult);
        finalConfigs = generateAllHAConfigs(effectiveHa, dbCredentials);

        for (const [fileName, content] of Object.entries(finalConfigs)) {
            await fs.writeFile(path.join(tempDir, fileName), content);
        }
    }

    // Patch YAML: ownership labels + DB healthchecks + depends_on + limits.
    const patchedYaml = patchComposeYaml(finalYaml, metadata, {
        owner: session.userId.toString(),
        composeId: id,
    });
    await fs.writeFile(yamlPath, patchedYaml);

    try {
        // Validate with the real Compose CLI before touching the daemon.
        await runComposeCli(['config', '--quiet'], {
            project: composeProjectName(id),
            yamlPath,
        });
    } catch (error: any) {
        const detail = String(error?.stderr || error?.message || 'Invalid compose file').trim().slice(0, 500);
        return { success: false, code: 'INVALID_COMPOSE', error: detail };
    }

    try {
        // We use -p to specify a project name based on the ID to avoid collisions
        const { stdout, stderr } = await runComposeCli(['up', '-d', '--remove-orphans'], {
            project: composeProjectName(id),
            yamlPath,
        });
        console.log('Docker Compose Up:', stdout);
        if (stderr) console.error('Docker Compose Up Stderr:', stderr);

        if (persistedHa) {
            await collection.updateOne(
                { _id: new ObjectId(id), userId: session.userId },
                {
                    $set: {
                        haConfig: persistedHa,
                        haEnabled: persistedHa.replication?.enabled === true,
                        haUpdatedAt: Date.now(),
                    },
                },
            );
        }

        return { success: true, message: 'Services started successfully' };
    } catch (error: any) {
        console.error('Docker Compose Up Error:', error);
        const errText = error.message || error.stderr || "";
        const regex = /:(\d+)(?:\/tcp)?.*(?:already in use|already allocated)/i;
        const match = errText.match(regex) || errText.match(/Bind for.*:(\d+) failed/i);
        if (match) {
            return { success: false, code: 'PORT_IN_USE', error: errText, collisionPort: parseInt(match[1]) };
        }
        return { success: false, error: error.message };
    }
}

export async function stopCompose(composeId: string) {
    const session = await requireUser();
    const id = assertComposeId(composeId);
    await requireCompose(id, session);
    const tempDir = composeWorkDir(id);
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    try {
        const fileExists = await fs.access(yamlPath).then(() => true).catch(() => false);

        const { stdout, stderr } = await runComposeCli(['down'], {
            project: composeProjectName(id),
            yamlPath: fileExists ? yamlPath : undefined,
        });
        console.log('Docker Compose Down:', stdout);
        if (stderr) console.error('Docker Compose Down Stderr:', stderr);
        return { success: true, message: 'Services stopped successfully' };
    } catch (error: any) {
        console.error('Docker Compose Down Error:', error);
        return { success: false, error: error.message };
    }
}

export async function restartCompose(composeId: string, yamlContent: string) {
    const session = await requireUser();
    const id = assertComposeId(composeId);
    const doc = await requireCompose(id, session);
    const tempDir = composeWorkDir(id);
    await fs.mkdir(tempDir, { recursive: true });
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    let parsed: any;
    try {
        parsed = YAML.parse(yamlContent);
    } catch {
        return { success: false, code: 'INVALID_COMPOSE', error: 'The compose file is not valid YAML' };
    }

    const policy = checkComposePolicy(parsed, session);
    if (policy) return { success: false, ...policy };

    const metadata = doc?.metadata as composeMetadata | undefined;
    const dbHaConfig = (doc?.haEnabled === true ? doc.haConfig : undefined) as DatabaseHAConfig | undefined;

    let finalYaml = YAML.stringify(parsed);
    let finalConfigs: Record<string, string> = {};

    if (dbHaConfig?.replication?.enabled) {
        const dbCredentials = extractDbCredentials(parsed);
        const haResult = generateHACompose({
            baseCompose: parsed,
            haConfig: dbHaConfig,
            projectName: `expanse-${id}`,
            dbCredentials,
        });

        const generatedPolicy = checkComposePolicy(haResult, session);
        if (generatedPolicy) return { success: false, ...generatedPolicy };

        finalYaml = YAML.stringify(haResult);
        finalConfigs = generateAllHAConfigs(dbHaConfig, dbCredentials);

        for (const [fileName, content] of Object.entries(finalConfigs)) {
            await fs.writeFile(path.join(tempDir, fileName), content);
        }
    }

    const patchedYaml = patchComposeYaml(finalYaml, metadata, {
        owner: session.userId.toString(),
        composeId: id,
    });
    await fs.writeFile(yamlPath, patchedYaml);

    try {
        await runComposeCli(['config', '--quiet'], {
            project: composeProjectName(id),
            yamlPath,
        });
    } catch (error: any) {
        const detail = String(error?.stderr || error?.message || 'Invalid compose file').trim().slice(0, 500);
        return { success: false, code: 'INVALID_COMPOSE', error: detail };
    }

    try {
        await runComposeCli(['down', '--remove-orphans'], {
            project: composeProjectName(id),
            yamlPath,
        });
        const { stdout, stderr } = await runComposeCli(['up', '-d', '--build', '--force-recreate'], {
            project: composeProjectName(id),
            yamlPath,
        });

        console.log('Docker Compose Restart:', stdout);
        if (stderr) console.error('Docker Compose Restart Stderr:', stderr);
        return { success: true, message: 'Services restarted successfully' };
    } catch (error: any) {
        console.error('Docker Compose Restart Error:', error);
        const errText = error.message || error.stderr || "";
        const regex = /:(\d+)(?:\/tcp)?.*(?:already in use|already allocated)/i;
        const match = errText.match(regex) || errText.match(/Bind for.*:(\d+) failed/i);
        if (match) {
            return { success: false, error: errText, collisionPort: parseInt(match[1]) };
        }
        return { success: false, error: error.message };
    }
}

export async function getComposeStatus(composeId: string) {
    const session = await requireUser();
    const id = assertComposeId(composeId);
    await requireCompose(id, session);
    const tempDir = composeWorkDir(id);
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    try {
        const fileExists = await fs.access(yamlPath).then(() => true).catch(() => false);

        const { stdout } = await runComposeCli(['ps', '--format', 'json'], {
            project: composeProjectName(id),
            yamlPath: fileExists ? yamlPath : undefined,
        });
        if (!stdout.trim()) return [];

        // The output can be multiple JSON objects or a list depending on version
        try {
            const res = JSON.parse(stdout);
            return Array.isArray(res) ? res : [res];
        } catch {
            // If it's line-delimited JSON
            return stdout.trim().split('\n').map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(Boolean);
        }
    } catch (error: any) {
        console.error('Docker Compose PS Error:', error);
        return [];
    }
}

export async function getComposeLogs(composeId: string) {
    const session = await requireUser();
    const id = assertComposeId(composeId);
    await requireCompose(id, session);
    const tempDir = composeWorkDir(id);
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    try {
        const fileExists = await fs.access(yamlPath).then(() => true).catch(() => false);

        const { stdout } = await runComposeCli(['logs', '--tail=50', '--no-color'], {
            project: composeProjectName(id),
            yamlPath: fileExists ? yamlPath : undefined,
        });
        return { success: true, logs: stdout };
    } catch (error: any) {
        console.error('Docker Compose Logs Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getComposeStats(composeId: string) {
    const session = await requireUser();
    const id = assertComposeId(composeId);
    await requireCompose(id, session);
    try {
        // Run docker stats with no-stream to get a single snapshot.
        // We filter by project label if possible, or just parse all and filter.
        // The most robust way is to use docker compose ps to get IDs first.
        const containers = await getComposeStatus(composeId);
        if (!containers || containers.length === 0) return [];

        const ids = assertDockerIdList(containers.map((c: any) => String(c.ID ?? '')).join(' '), 'container ids');
        const { stdout } = await runDocker(['stats', ...ids, '--no-stream', '--format', 'json']);

        if (!stdout.trim()) return [];

        try {
            // Line-delimited JSON
            return stdout.trim().split('\n').map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(Boolean);
        } catch (e) {
            console.error("Stats parse error:", e);
            return [];
        }
    } catch (error: any) {
        console.error('Docker Stats Error:', error);
        return [];
    }
}

/**
 * Status of the projects owned by the current user, without exposing the rest
 * of the host. The dashboard only needs the compose project names it owns.
 */
export async function getMyProjectsStatus() {
    const session = await requireUser();
    const composes = await (await getDb())
        .collection('composes')
        .find({ userId: session.userId }, { projection: { _id: 1 } })
        .toArray();

    const names = new Set(composes.map((compose) => composeProjectName(compose._id.toString())));
    if (names.size === 0) return [];

    try {
        const { stdout } = await runDocker(['compose', 'ls', '--format', 'json']);
        if (!stdout.trim()) return [];
        const parsed = JSON.parse(stdout);
        const projects = Array.isArray(parsed) ? parsed : [parsed];
        return projects.filter((project: any) => names.has(project.Name));
    } catch (error: any) {
        console.error('Compose ls error:', error);
        return [];
    }
}

export async function getGlobalDockerStats() {
    await requireAdmin();
    try {
        const [projectsRes, containersRes, volumesRes, networksRes, dfRes] = await Promise.all([
            runDocker(['compose', 'ls', '--format', 'json']),
            runDocker(['ps', '-a', '--format', '{{json .}}']),
            runDocker(['volume', 'ls', '--format', '{{json .}}']),
            runDocker(['network', 'ls', '--format', 'json']),
            runDocker(['system', 'df', '-v']).catch(() => ({ stdout: '' }))
        ]);

        const parseJson = (stdout: string) => {
            if (!stdout.trim()) return [];
            try {
                const res = JSON.parse(stdout);
                return Array.isArray(res) ? res : [res];
            } catch {
                return stdout.trim().split('\n').map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                }).filter(Boolean);
            }
        };

        const volumes = parseJson(volumesRes.stdout);
        const networks = parseJson(networksRes.stdout);
        const dfOutput = dfRes.stdout;

        // Simple regex to find volume sizes in 'docker system df -v' output
        // It looks for the "Local Volumes" section and captures name + size
        if (dfOutput) {
            const volumeLines = dfOutput.split('\n');
            let inVolumesSection = false;
            const sizeMap: Record<string, { size: string, links: number }> = {};

            for (const line of volumeLines) {
                if (line.includes('VOLUME NAME') && line.includes('SIZE')) {
                    inVolumesSection = true;
                    continue;
                }
                if (inVolumesSection) {
                    if (line.trim() === '') {
                        if (Object.keys(sizeMap).length > 0) break;
                        continue;
                    }
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const name = parts[0];
                        const links = parseInt(parts[parts.length - 2]) || 0;
                        const size = parts[parts.length - 1];
                        sizeMap[name] = { size, links };
                    }
                }
            }

            // Inject sizes into volume objects
            for (const vol of volumes) {
                if (sizeMap[vol.Name]) {
                    vol.Size = sizeMap[vol.Name].size;
                    vol.Links = sizeMap[vol.Name].links;
                }
            }
        }

        return {
            projects: parseJson(projectsRes.stdout),
            containers: parseJson(containersRes.stdout),
            volumes,
            networks
        };
    } catch (error: any) {
        console.error('Global Docker Stats Error:', error);
        return { error: error.message };
    }
}

export async function getSystemInfo() {
    await requireAdmin();
    try {
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const uptime = os.uptime();

        let diskInfo = { total: 'Unknown', used: 'Unknown', free: 'Unknown', usage: '0%' };
        try {
            const { stdout } = await execAsync('df -h / | awk \'NR==2 {print $2, $3, $4, $5}\''); // static command, no user input
            const [total, used, free, usage] = stdout.trim().split(/\s+/);
            diskInfo = { total, used, free, usage };
        } catch (e) {
            console.error("Could not fetch disk info:", e);
        }

        return {
            cpuCount: cpus.length,
            cpuModel: cpus[0].model,
            totalMemory,
            freeMemory,
            uptime,
            diskInfo
        };
    } catch (error: any) {
        console.error('System Info Error:', error);
        return { error: error.message };
    }
}

export async function getUsedDockerPorts(): Promise<number[]> {
    await requireUser();
    try {
        const { stdout } = await runDocker(['ps', '--format', '{{.Ports}}']);
        if (!stdout.trim()) return [];

        const ports = new Set<number>();
        const lines = stdout.trim().split('\n');

        for (const line of lines) {
            if (!line) continue;
            // Example format: 0.0.0.0:8000->8000/tcp, :::8000->8000/tcp, 0.0.0.0:3306->3306/tcp, :::3306->3306/tcp
            const parts = line.split(',');
            for (const part of parts) {
                const match = part.match(/:(\d+)->/);
                if (match && match[1]) {
                    ports.add(parseInt(match[1]));
                }
            }
        }

        return Array.from(ports);
    } catch (error) {
        console.error('Error fetching used docker ports:', error);
        return [];
    }
}

async function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(true); // Other errors might mean it's free or restricted, but not in use
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '0.0.0.0');
    });
}

export async function getAvailablePort(preferred: number): Promise<number> {
    await requireUser();
    const usedDockerPorts = await getUsedDockerPorts();

    const isPortFree = async (p: number) => {
        if (usedDockerPorts.includes(p)) return false;
        return await checkPort(p);
    };

    const isAvailable = await isPortFree(preferred);
    if (isAvailable) return preferred;

    // Search for a free port starting from a random ephemeral range if possible, 
    // or just try common ranges.
    let port = preferred + 1;
    while (!(await isPortFree(port)) && port < preferred + 1000) {
        port++;
    }
    return port;
}

export async function stopProjectByName(projectName: string) {
    const session = await requireUser();
    try {
        const project = await requireProjectAccess(projectName, session);
        const { stdout, stderr } = await runComposeCli(['stop'], { project });
        console.log('Stop project:', stdout);
        if (stderr) console.error('Stop project stderr:', stderr);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeProjectByName(projectName: string, deleteVolumes: boolean = true) {
    const session = await requireUser();
    try {
        const project = await requireProjectAccess(projectName, session);
        const downArgs = deleteVolumes ? ['down', '--volumes', '--remove-orphans'] : ['down', '--remove-orphans'];

        // 1. Try standard compose down (best effort, may fail without yaml file)
        try {
            const { stdout, stderr } = await runComposeCli(downArgs, { project });
            console.log('Remove project standard:', stdout);
            if (stderr && !stderr.includes('no container') && !stderr.includes('Network')) {
                console.log('Remove project stderr:', stderr);
            }
        } catch (composeError) {
            // Compose down failed, but we'll clean up by label below
            console.log('Compose down skipped, will cleanup by label:', composeError instanceof Error ? composeError.message : composeError);
        }

        // 2. Force remove any containers with this project label
        const { stdout: containerIds } = await runDocker(['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '-q']);
        if (containerIds.trim()) {
            const ids = assertDockerIdList(containerIds, 'container ids');
            console.log('Removing containers by label:', ids.join(' '));
            await runDocker(['rm', '-f', ...ids]);
        }

        // 3. Remove volumes if requested
        if (deleteVolumes) {
            const { stdout: volumeNames } = await runDocker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '-q']);
            if (volumeNames.trim()) {
                const names = assertDockerIdList(volumeNames, 'volume names');
                console.log('Removing volumes by label:', names.join(' '));
                await runDocker(['volume', 'rm', '-f', ...names]);
            }
        }

        // 4. Remove networks
        const { stdout: networkNames } = await runDocker(['network', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '-q']);
        if (networkNames.trim()) {
            const names = assertDockerIdList(networkNames, 'network names');
            console.log('Removing networks by label:', names.join(' '));
            await runDocker(['network', 'rm', ...names]);
        }

        return {
            success: true,
            message: `Project "${projectName}" deleted${deleteVolumes ? " along with all persistent volumes" : " (volumes preserved)"}.`
        };
    } catch (error: any) {
        console.error('Remove project error:', error);
        return { success: false, error: error.message };
    }
}

export async function stopContainer(containerId: string) {
    const session = await requireUser();
    try {
        await requireContainerAccess(containerId, session);
        const container = assertDockerReference(containerId, 'container id');
        const { stdout } = await runDocker(['stop', container]);
        console.log('Stop container:', stdout);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeContainer(containerId: string) {
    const session = await requireUser();
    try {
        await requireContainerAccess(containerId, session);
        const container = assertDockerReference(containerId, 'container id');
        await runDocker(['stop', container]).catch(() => { });
        const { stdout } = await runDocker(['rm', '-f', container]);
        console.log('Remove container:', stdout);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeVolume(volumeName: string) {
    const session = await requireUser();
    try {
        const volume = await requireVolumeAccess(volumeName, session);
        const { stdout } = await runDocker(['volume', 'rm', '-f', volume]);
        console.log('Remove volume:', stdout);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}


export async function getProjectContainers(projectName: string) {
    const session = await requireUser();
    try {
        const project = await requireProjectAccess(projectName, session);
        const { stdout } = await runDocker([
            'ps', '-a',
            '--filter', `label=com.docker.compose.project=${project}`,
            '--format', 'json',
        ]);
        if (!stdout.trim()) return { containers: [], volumes: [] };

        const parseJson = (s: string) => {
            if (!s.trim()) return [];
            try {
                const res = JSON.parse(s);
                return Array.isArray(res) ? res : [res];
            } catch {
                return s.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
            }
        };

        const containers = parseJson(stdout);

        // fetch volumes for this project
        const { stdout: volOut } = await runDocker([
            'volume', 'ls',
            '--filter', `label=com.docker.compose.project=${project}`,
            '--format', 'json',
        ]).catch(() => ({ stdout: '' }));

        const volumes = volOut.trim() ? parseJson(volOut) : [];

        // Fetch sizes for these volumes
        try {
            const { stdout: dfOut } = await runDocker(['system', 'df', '-v']);
            const volumeLines = dfOut.split('\n');
            let inVolumesSection = false;
            const sizeMap: Record<string, string> = {};
            for (const line of volumeLines) {
                if (line.includes('VOLUME NAME') && line.includes('SIZE')) {
                    inVolumesSection = true;
                    continue;
                }
                if (inVolumesSection) {
                    if (line.trim() === '') {
                        if (Object.keys(sizeMap).length > 0) break;
                        continue;
                    }
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        sizeMap[parts[0]] = parts[parts.length - 1];
                    }
                }
            }
            for (const vol of volumes) {
                if (sizeMap[vol.Name]) vol.Size = sizeMap[vol.Name];
            }
        } catch (e) {
            console.error("Error fetching volume sizes in project containers:", e);
        }

        return { containers, volumes };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function validateComposePorts(yamlContent: string) {
    await requireUser();
    const doc = YAML.parse(yamlContent);
    const reassignments: Record<string, { old: number, new: number }[]> = {};
    const usedInConfig = new Set<number>();
    let hasChanges = false;

    if (doc.services) {
        for (const [serviceName, service] of Object.entries<any>(doc.services)) {
            if (service.ports) {
                const serviceReassignments: { old: number, new: number }[] = [];

                for (let i = 0; i < service.ports.length; i++) {
                    const portStr = String(service.ports[i]);
                    const match = portStr.match(/^(\d+):(\d+)$/);
                    if (match) {
                        const hostPort = parseInt(match[1]);
                        const containerPort = parseInt(match[2]);

                        // Check if this port is already used by another service in this config
                        // OR if it's actually busy in the system
                        let targetPort = hostPort;
                        if (usedInConfig.has(targetPort)) {
                            targetPort = await getAvailablePort(targetPort + 1);
                        } else {
                            const availablePort = await getAvailablePort(targetPort);
                            if (availablePort !== targetPort) {
                                targetPort = availablePort;
                            }
                        }

                        if (targetPort !== hostPort) {
                            service.ports[i] = `${targetPort}:${containerPort}`;
                            serviceReassignments.push({ old: hostPort, new: targetPort });
                            hasChanges = true;
                        }
                        usedInConfig.add(targetPort);
                    }
                }

                if (serviceReassignments.length > 0) {
                    reassignments[serviceName] = serviceReassignments;
                }
            }
        }
    }

    return { hasChanges, reassignments };
}

export async function execDockerCommand(containerId: string, command: string) {
    const session = await requireUser();
    try {
        await requireContainerAccess(containerId, session);
        const container = assertDockerReference(containerId, 'container id');
        if (!command || typeof command !== 'string' || command.length > 8192) {
            return { success: false, error: 'Invalid command' };
        }
        // Arguments are passed as an array: no shell escaping/interpolation,
        // the command itself is still executed by `sh -c` inside the container.
        const { stdout, stderr } = await runDocker(['exec', container, 'sh', '-c', command]);

        return { success: true, output: stdout || stderr || "Command executed" };
    } catch (error: any) {
        console.error('Docker Exec Error:', error);
        return { success: false, error: error.message || error.stderr || "Execution failed" };
    }
}

export async function searchDockerHub(query: string) {
    await requireUser();
    if (!query || query.trim().length < 2) {
        return { results: [], error: null };
    }

    try {
        const encodedQuery = encodeURIComponent(query.trim());
        const res = await fetch(
            `https://hub.docker.com/v2/search/repositories/?query=${encodedQuery}&page_size=20`,
            { next: { revalidate: 0 } } as RequestInit
        );

        if (!res.ok) {
            throw new Error(`Docker Hub API error: ${res.status}`);
        }

        const data = await res.json();
        return {
            results: (data.results || []).map((r: any) => ({
                name: r.repo_name || r.name,
                description: r.short_description || r.description || "",
                stars: r.star_count || r.stars || 0,
                pulls: r.pull_count || r.downloads || 0,
                official: r.official || false,
                logo: r.logo || null,
            })),
            error: null
        };
    } catch (err: any) {
        console.error('Docker Hub search error:', err);
        return { results: [], error: err.message || "Search failed" };
    }
}

export async function pullDockerImage(imageName: string) {
    await requireUser();
    if (!imageName || !imageName.trim()) {
        return { success: false, error: "Image name is required" };
    }

    try {
        const image = assertDockerReference(imageName, 'image name');
        const { stdout, stderr } = await runDocker(['pull', image], { timeout: 30 * 60 * 1000 });
        if (stderr && stderr.includes("Error")) {
            return { success: false, error: stderr };
        }
        return { success: true, output: stdout || `Image ${imageName} pulled successfully` };
    } catch (error: any) {
        console.error('Docker pull error:', error);
        return { success: false, error: error.message || "Pull failed" };
    }
}

export async function getLocalImages() {
    await requireAdmin();
    try {
        const { stdout } = await runDocker(['images', '--format', '{{json .}}']);
        if (!stdout.trim()) return { images: [], error: null };

        const images = stdout.trim().split('\n').map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);

        return { images, error: null };
    } catch (error: any) {
        console.error('Docker images error:', error);
        return { images: [], error: error.message };
    }
}

export async function dockerSearch(query: string) {
    await requireUser();
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
        return { results: [], error: null };
    }

    try {
        const term = query.trim();
        if (!/^[a-zA-Z0-9][a-zA-Z0-9 ._:@/-]{1,254}$/.test(term)) {
            return { results: [], error: 'Invalid search query' };
        }
        const { stdout, stderr } = await runDocker(['search', '--limit', '20', '--format', '{{json .}}', term]);
        if (stderr && !stdout) {
            return { results: [], error: stderr || "Search failed" };
        }

        const results = stdout.trim().split('\n').map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);

        return { results, error: null };
    } catch (error: any) {
        console.error('Docker search error:', error);
        return { results: [], error: error.message || "Search failed" };
    }
}
