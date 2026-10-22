import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, open, stat, lstat, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline, finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const format = 'studio24-encrypted-backup-v1';
const digest = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
function safePath(name) {
  if (
    !name ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('Invalid backup path');
  return name;
}

export async function encryptBundle(root, output, passphrase) {
  if (!passphrase || passphrase.length < 32) throw new Error('A recovery key of at least 32 characters is required');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({ format, salt: salt.toString('hex'), iv: iv.toString('hex') }) + '\n');
  const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  cipher.setAAD(header);
  await mkdir(dirname(resolve(output)), { recursive: true });
  const destination = createWriteStream(output, { mode: 0o600 });
  destination.write(header);
  const tar = spawn('tar', ['-czf', '-', '-C', root, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise((accept, reject) => {
    tar.on('error', reject);
    tar.on('close', (code) => (code === 0 ? accept() : reject(new Error('Could not create backup archive'))));
  });
  // Drain diagnostics without publishing customer filenames into Actions logs.
  tar.stderr.resume();
  await Promise.all([pipeline(tar.stdout, cipher, destination, { end: false }), exited]);
  destination.end(cipher.getAuthTag());
  await finished(destination);
}

export async function verifyBundle(file, passphrase) {
  const root = await mkdtemp(join(tmpdir(), 'studio24-verify-'));
  try {
    const handle = await open(file, 'r');
    const prefix = Buffer.alloc(512);
    const tag = Buffer.alloc(16);
    let size;
    try {
      size = (await handle.stat()).size;
      if (size < 32) throw new Error('Incomplete encrypted backup');
      await handle.read(prefix, 0, prefix.length, 0);
      await handle.read(tag, 0, tag.length, size - 16);
    } finally {
      await handle.close();
    }
    const newline = prefix.indexOf(10);
    if (newline < 0) throw new Error('Invalid encrypted header');
    const header = prefix.subarray(0, newline + 1);
    const metadata = JSON.parse(header.toString());
    if (metadata.format !== format) throw new Error('Unsupported backup format');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      scryptSync(passphrase, Buffer.from(metadata.salt, 'hex'), 32),
      Buffer.from(metadata.iv, 'hex'),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const archive = join(root, 'backup.tar.gz');
    await pipeline(
      createReadStream(file, { start: newline + 1, end: size - 17 }),
      decipher,
      createWriteStream(archive, { mode: 0o600 }),
    );
    const { stdout: paths } = await run('tar', ['-tzf', archive]);
    for (const path of paths.trim().split('\n'))
      if (path !== './') safePath(path.replace(/^\.\//, '').replace(/\/$/, ''));
    const { stdout: entries } = await run('tar', ['-tvzf', archive]);
    if (
      entries
        .split('\n')
        .filter(Boolean)
        .some((line) => !['-', 'd'].includes(line[0]))
    )
      throw new Error('Links are not allowed in a backup');
    const extracted = join(root, 'contents');
    await mkdir(extracted);
    await run('tar', ['-xzf', archive, '-C', extracted, '--no-same-owner', '--no-same-permissions']);
    const manifest = JSON.parse(await readFile(join(extracted, 'manifest.json'), 'utf8'));
    if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.files)) throw new Error('Invalid manifest');
    for (const item of manifest.files) {
      const path = join(extracted, safePath(item.path));
      const info = await lstat(path);
      if (!info.isFile() || info.size !== item.size || (await digest(path)) !== item.sha256)
        throw new Error('A backup file did not pass integrity verification');
    }
    const records = JSON.parse(await readFile(join(extracted, 'records.json'), 'utf8'));
    for (const [table, count] of Object.entries(manifest.counts)) {
      if (!Array.isArray(records.tables[table]) || records.tables[table].length !== count)
        throw new Error('Backup row counts do not match');
    }
    return {
      verified: true,
      tables: Object.keys(manifest.counts).length,
      files: manifest.files.length,
      createdAt: manifest.createdAt,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function createBusinessBackup(client, output, passphrase) {
  const root = await mkdtemp(join(tmpdir(), 'studio24-backup-'));
  const files = [];
  let bytes = 0;
  const include = async (path) => {
    const file = join(root, safePath(path));
    const info = await stat(file);
    files.push({ path, size: info.size, sha256: await digest(file) });
  };
  try {
    const { data: records, error } = await client.rpc('export_business_snapshot');
    if (error) throw new Error('Could not obtain a consistent database snapshot');
    if (records?.schemaVersion !== 2 || !records.tables?.customer_account_movements)
      throw new Error('Database snapshot is incomplete');
    await writeFile(join(root, 'records.json'), JSON.stringify(records), { mode: 0o600 });
    await include('records.json');
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError) throw new Error('Could not enumerate storage buckets');
    const storageManifest = [];
    for (const bucket of buckets) {
      if (bucket.id === 'backups') continue;
      safePath(bucket.id);
      const versions = new Map();
      let verifyVersions = false;
      const walk = async (prefix = '') => {
        for (let offset = 0; ; offset += 100) {
          const { data: objects, error } = await client.storage.from(bucket.id).list(prefix, {
            limit: 100,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          });
          if (error) throw new Error('Could not enumerate stored files');
          if (!objects?.length) break;
          for (const object of objects) {
            const path = safePath(prefix ? `${prefix}/${object.name}` : object.name);
            if (!object.id) {
              await walk(path);
              continue;
            }
            const version = JSON.stringify([object.updated_at, object.metadata?.eTag, object.metadata?.size]);
            if (verifyVersions) {
              if (versions.get(path) !== version) throw new Error('Stored evidence changed while creating the backup');
              versions.delete(path);
              continue;
            }
            versions.set(path, version);
            const { data: blob, error } = await client.storage.from(bucket.id).download(path);
            if (error || !blob) throw new Error('Could not download stored evidence');
            if (object.metadata?.size !== undefined && Number(object.metadata.size) !== blob.size)
              throw new Error('Stored evidence changed while downloading');
            bytes += blob.size;
            if (bytes > 512 * 1024 * 1024) throw new Error('Backup exceeds its configured storage budget');
            const target = `storage/${bucket.id}/${path}`;
            await mkdir(dirname(join(root, target)), { recursive: true });
            await writeFile(join(root, target), Buffer.from(await blob.arrayBuffer()), { mode: 0o600 });
            await include(target);
            storageManifest.push({ bucket: bucket.id, path, metadata: object.metadata });
          }
          if (objects.length < 100) break;
        }
      };
      await walk();
      verifyVersions = true;
      await walk();
      if (versions.size) throw new Error('Stored evidence disappeared while creating the backup');
    }
    const included = new Set(files.map((file) => file.path));
    const requireEvidence = (bucket, path) => {
      if (path && !/^(https?:|data:)/.test(path) && !included.has(`storage/${bucket}/${safePath(path)}`))
        throw new Error('Referenced business evidence is missing from Storage');
    };
    for (const row of [...(records.tables.ingresos || []), ...(records.tables.egresos || [])]) {
      requireEvidence('facturas', row.pdf_url);
      requireEvidence('facturas', row.xml_url);
    }
    for (const row of records.tables.customer_advances || []) requireEvidence('customer-receipts', row.receipt_path);
    await writeFile(join(root, 'storage.json'), JSON.stringify({ buckets, objects: storageManifest }), { mode: 0o600 });
    await include('storage.json');
    const migrations = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
    await cp(migrations, join(root, 'migrations'), { recursive: true });
    // Migration sources are public in the repository; business files are hashed.
    const counts = Object.fromEntries(Object.entries(records.tables).map(([table, rows]) => [table, rows.length]));
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 2,
        createdAt: records.createdAt,
        revision: process.env.GITHUB_SHA || 'local',
        counts,
        files,
      }),
      { mode: 0o600 },
    );
    await encryptBundle(root, output, passphrase);
    return await verifyBundle(output, passphrase);
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, file = 'backup/studio24.enc'] = process.argv.slice(2);
    const passphrase = process.env.STUDIO24_BACKUP_PASSPHRASE;
    if (!passphrase || passphrase.length < 32) throw new Error('Backup recovery key is not configured');
    if (command === 'verify') console.log(JSON.stringify(await verifyBundle(file, passphrase)));
    else if (command === 'create') {
      const url = process.env.SUPABASE_BACKUP_URL;
      const key = process.env.SUPABASE_BACKUP_KEY;
      if (!url || !key) throw new Error('Backup credentials are not configured');
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(60000) }) },
      });
      console.log(JSON.stringify(await createBusinessBackup(client, file, passphrase)));
    } else throw new Error('Use create or verify');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Backup failed');
    process.exitCode = 1;
  }
}
