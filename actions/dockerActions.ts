'use server'

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import net from 'net';
import YAML from 'yaml';
import { ensureAuth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "bson";
import { composeMetadata, generateHaproxyConfig, generateHACompose, generateAllHAConfigs } from "@/lib/metadata";
import type { DatabaseHAConfig } from "@/types/library";
import type { HaDeploymentConfig } from "@/components/playground/haDeploymentDialog";
import { patchComposeYaml } from '@/lib/dockerCompose';
import {
    assertComposeId,
    assertDockerIdList,
    assertDockerReference,
    composeProjectName,
    composeWorkDir,
    runCompose as runComposeCli,
    runDocker,
} from '@/lib/dockerExec';

const execAsync = promisify(exec);

export async function runCompose(
    composeId: string,
    yamlContent: string,
    haConfig?: HaDeploymentConfig
) {
    await ensureAuth();
    const id = assertComposeId(composeId);
    const tempDir = composeWorkDir(id);
    await fs.mkdir(tempDir, { recursive: true });
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    // Fetch metadata for resource limits
    const db = await getDb();
    const collection = db.collection("composes");
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    const metadata = doc?.metadata as composeMetadata | undefined;

    // Check if compose has HA enabled in database
    const dbHaConfig = doc?.haConfig as DatabaseHAConfig | undefined;
    const dbHaEnabled = doc?.haEnabled === true;

    let finalYaml = yamlContent;
    let finalConfigs: Record<string, string> = {};

    // If HA is enabled in database, generate full HA compose
    if (dbHaEnabled && dbHaConfig) {
        const dbCredentials = {
            dbName: 'expanse', // Could be extracted from compose env vars
            dbUser: 'postgres',
            dbPassword: 'postgres'
        };

        // Generate HA compose and config files
        const haResult = await generateHACompose({
            baseCompose: YAML.parse(yamlContent),
            haConfig: dbHaConfig,
            projectName: `expanse-${id}`,
            dbCredentials
        });

        finalYaml = YAML.stringify(haResult);
        finalConfigs = generateAllHAConfigs(dbHaConfig, dbCredentials);

        // Write all HA config files to temp directory
        for (const [fileName, content] of Object.entries(finalConfigs)) {
            await fs.writeFile(path.join(tempDir, fileName), content);
        }
    } else {
        // Legacy HA injection from haDeploymentDialog (for backwards compatibility)
        const parsedYaml = YAML.parse(yamlContent);

        if (haConfig?.enabled) {
            // Inject PgBouncer configuration if connection pooling is enabled
            if (haConfig.enableConnectionPool) {
                const dbServiceEntry = Object.entries(parsedYaml.services || {}).find(
                    ([, svc]: [string, any]) => svc.image?.includes('postgres')
                );
                if (dbServiceEntry) {
                    const [svcName, dbSvc] = dbServiceEntry as [string, any];
                    if (!parsedYaml.services.pgbouncer) {
                        parsedYaml.services.pgbouncer = {
                            image: 'edoburu/pgbouncer:latest',
                            environment: {
                                DATABASE_URL: `postgres://${dbSvc.environment?.POSTGRES_USER || 'postgres'}:${dbSvc.environment?.POSTGRES_PASSWORD || 'postgres'}@${svcName}:5432/${dbSvc.environment?.POSTGRES_DB || 'postgres'}`,
                                POOL_MODE: 'transaction',
                                MAX_CLIENT_CONN: '100',
                                DEFAULT_POOL_SIZE: '20'
                            },
                            ports: ['5439:5432'],
                            depends_on: {
                                [svcName]: { condition: 'service_healthy' }
                            }
                        };
                    }
                }
            }

            // Inject HAProxy configuration if load balancer is enabled
            if (haConfig.enableLoadBalancer) {
                const apiServices = Object.entries(parsedYaml.services || {}).filter(
                    ([name, svc]: [string, any]) => svc.image?.includes('postgrest') || name === 'api'
                );

                if (apiServices.length > 0) {
                    const servers = apiServices.map(([name], idx) => ({
                        name: `${name}_${idx + 1}`,
                        host: name,
                        port: 3000
                    }));

                    const haproxyConfig = generateHaproxyConfig({
                        type: 'haproxy',
                        port: 80,
                        targetPort: 3000,
                        algorithm: 'round-robin',
                        healthCheckPath: '/'
                    }, servers);

                    await fs.writeFile(path.join(tempDir, 'haproxy.conf'), haproxyConfig);

                    parsedYaml.services.lb = {
                        image: 'haproxy:2.9-alpine',
                        ports: ['80:80'],
                        volumes: ['./haproxy.conf:/usr/local/etc/haproxy/haproxy.cfg:ro'],
                        depends_on: apiServices.map(([name]) => name).reduce((acc, name) => {
                            acc[name] = { condition: 'service_started' };
                            return acc;
                        }, {} as Record<string, any>)
                    };

                    if (haConfig.enableConnectionPool && parsedYaml.services.pgbouncer) {
                        for (const [, svc] of apiServices as Array<[string, any]>) {
                            if (svc.environment) {
                                svc.environment.PGRST_DB_URI = `postgres://${parsedYaml.services.pgbouncer.environment.DATABASE_URL.split('@')[1]?.split('/')[0] || 'postgres'}:5439/postgres`;
                            }
                        }
                    }

                    for (const [name] of apiServices) {
                        if (!parsedYaml.services[name].deploy) {
                            parsedYaml.services[name].deploy = {};
                        }
                        parsedYaml.services[name].deploy.replicas = haConfig.minReplicas;
                    }
                }
            }
        }

        finalYaml = YAML.stringify(parsedYaml);
    }

    // Patch YAML: inject DB healthchecks + depends_on service_healthy + resource limits
    const patchedYaml = patchComposeYaml(finalYaml, metadata);
    await fs.writeFile(yamlPath, patchedYaml);

    try {
        // We use -p to specify a project name based on the ID to avoid collisions
        const { stdout, stderr } = await runComposeCli(['up', '-d'], {
            project: composeProjectName(id),
            yamlPath,
        });
        console.log('Docker Compose Up:', stdout);
        if (stderr) console.error('Docker Compose Up Stderr:', stderr);
        return { success: true, message: 'Services started successfully' };
    } catch (error: any) {
        console.error('Docker Compose Up Error:', error);
        const errText = error.message || error.stderr || "";
        const regex = /:(\d+)(?:\/tcp)?.*(?:already in use|already allocated)/i;
        const match = errText.match(regex) || errText.match(/Bind for.*:(\d+) failed/i);
        if (match) {
            return { success: false, error: errText, collisionPort: parseInt(match[1]) };
        }
        return { success: false, error: error.message };
    }
}

export async function stopCompose(composeId: string) {
    await ensureAuth();
    const id = assertComposeId(composeId);
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
    await ensureAuth();
    const id = assertComposeId(composeId);
    const tempDir = composeWorkDir(id);
    await fs.mkdir(tempDir, { recursive: true });
    const yamlPath = path.join(tempDir, 'docker-compose.yaml');

    // Fetch metadata for resource limits
    const db = await getDb();
    const collection = db.collection("composes");
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    const metadata = doc?.metadata as composeMetadata | undefined;

    // Check if compose has HA enabled in database
    const dbHaConfig = doc?.haConfig as DatabaseHAConfig | undefined;
    const dbHaEnabled = doc?.haEnabled === true;

    let finalYaml = yamlContent;
    let finalConfigs: Record<string, string> = {};

    // If HA is enabled in database, generate full HA compose
    if (dbHaEnabled && dbHaConfig) {
        const dbCredentials = {
            dbName: 'expanse',
            dbUser: 'postgres',
            dbPassword: 'postgres'
        };

        const haResult = await generateHACompose({
            baseCompose: YAML.parse(yamlContent),
            haConfig: dbHaConfig,
            projectName: `expanse-${id}`,
            dbCredentials
        });

        finalYaml = YAML.stringify(haResult);
        finalConfigs = generateAllHAConfigs(dbHaConfig, dbCredentials);

        // Write all HA config files to temp directory
        for (const [fileName, content] of Object.entries(finalConfigs)) {
            await fs.writeFile(path.join(tempDir, fileName), content);
        }
    }

    // Patch YAML: inject DB healthchecks + depends_on service_healthy + resource limits
    const patchedYaml = patchComposeYaml(finalYaml, metadata);
    await fs.writeFile(yamlPath, patchedYaml);

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
    await ensureAuth();
    const id = assertComposeId(composeId);
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
    await ensureAuth();
    const id = assertComposeId(composeId);
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
    await ensureAuth();
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

export async function getGlobalDockerStats() {
    await ensureAuth();
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
    await ensureAuth();
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
    await ensureAuth();
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
    await ensureAuth();
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
    await ensureAuth();
    try {
        const project = assertDockerReference(projectName, 'project name');
        const { stdout, stderr } = await runComposeCli(['stop'], { project });
        console.log('Stop project:', stdout);
        if (stderr) console.error('Stop project stderr:', stderr);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeProjectByName(projectName: string, deleteVolumes: boolean = true) {
    await ensureAuth();
    try {
        const project = assertDockerReference(projectName, 'project name');
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
    await ensureAuth();
    try {
        const container = assertDockerReference(containerId, 'container id');
        const { stdout } = await runDocker(['stop', container]);
        console.log('Stop container:', stdout);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeContainer(containerId: string) {
    await ensureAuth();
    try {
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
    await ensureAuth();
    try {
        const volume = assertDockerReference(volumeName, 'volume name');
        const { stdout } = await runDocker(['volume', 'rm', '-f', volume]);
        console.log('Remove volume:', stdout);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}


export async function getProjectContainers(projectName: string) {
    await ensureAuth();
    try {
        const project = assertDockerReference(projectName, 'project name');
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
    await ensureAuth();
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
    await ensureAuth();
    try {
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
    await ensureAuth();
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
    await ensureAuth();
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
    await ensureAuth();
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
    await ensureAuth();
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
