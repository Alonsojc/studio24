import { spawn } from 'node:child_process';
import { readFile, cp, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withVerifiedBundle } from './business-backup.mjs';

export function validateRestoreTarget(value) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/studio24_test' ||
    !url.port ||
    url.search ||
    url.hash
  )
    throw new Error('Restore drills require the isolated local studio24_test database');
  return value;
}

export function localSql(url, sql) {
  validateRestoreTarget(url);
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGOPTIONS: '-c log_min_error_statement=panic -c log_error_verbosity=terse' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    // PostgreSQL errors can contain row data. Never publish them in backup logs.
    child.stderr.resume();
    child.on('error', () => reject(new Error('Could not start isolated restore verification')));
    child.on('close', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error('Isolated restore verification failed; no business data was logged')),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
  });
}

export async function restoreDrill(file, passphrase, databaseUrl) {
  validateRestoreTarget(databaseUrl);
  return withVerifiedBundle(file, passphrase, async ({ root, records, manifest, summary }) => {
    // Only the bootstrap fixture schema can pass this guard, never Supabase Auth.
    const shape = await localSql(
      databaseUrl,
      "select count(*) from information_schema.columns where table_schema='auth' and table_name='users';",
    );
    if (shape !== '3') throw new Error('This is not the isolated Auth fixture');
    const expected = JSON.parse(await localSql(databaseUrl, 'select export_business_snapshot();'));
    const tables = Object.keys(expected.tables).sort();
    if (JSON.stringify(tables) !== JSON.stringify(Object.keys(records.tables).sort()))
      throw new Error('Backup tables do not match the restore schema');
    if (tables.some((table) => table !== 'inpc' && expected.tables[table].length))
      throw new Error('Restore target is not empty');
    const storage = JSON.parse(await readFile(join(root, 'storage.json'), 'utf8'));
    const included = new Map(manifest.files.map((item) => [item.path, item]));
    const recovered = join(root, 'recovered-storage');
    await mkdir(recovered);
    for (const object of storage.objects) {
      const key = `storage/${object.bucket}/${object.path}`;
      const entry = included.get(key);
      if (!entry) throw new Error('Storage object is not verified');
      const destination = join(recovered, key);
      await cp(join(root, key), destination, { recursive: true });
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(destination)) hash.update(chunk);
      if (hash.digest('hex') !== entry.sha256) throw new Error('Recovered evidence changed');
    }
    const staged = JSON.stringify(records).replaceAll('"', '""');
    await localSql(
      databaseUrl,
      `
begin;
create temporary table restore_payload(document jsonb);
copy restore_payload from stdin with (format csv);
"${staged}"
\\.
create temporary table original_fks as
 select conrelid::regclass as tbl,conname,condeferrable,condeferred from pg_constraint
 where contype='f' and connamespace='public'::regnamespace;
do $$ declare item record; tbl text; payload jsonb; source jsonb; actual jsonb; seq text; last_value bigint; begin
 select document->'tables' into payload from restore_payload;
 if (select count(*) from auth.users)<>0 then raise exception 'Nonempty identity fixture'; end if;
 alter table auth.users disable trigger user;
 for tbl in select jsonb_object_keys(payload) loop
   if tbl<>'inpc' then
     execute format('select count(*) from public.%I',tbl) into actual;
     if actual<>'0'::jsonb then raise exception 'Nonempty restore target'; end if;
   end if;
   execute format('alter table public.%I disable trigger user',tbl);
 end loop;
 for item in select * from original_fks loop
   execute format('alter table %s alter constraint %I deferrable initially deferred',item.tbl,item.conname);
 end loop;
 set constraints all deferred;
 -- Recreate identity references only. Auth passwords and sessions are NOT backups.
 for item in select c.conrelid::regclass as tbl,a.attname as col
   from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid='auth.users'::regclass and c.connamespace='public'::regnamespace loop
   tbl:=replace(item.tbl::text,'public.','');
   insert into auth.users(id) select distinct (row->>item.col)::uuid
     from jsonb_array_elements(coalesce(payload->tbl,'[]')) row where row->>item.col is not null
     on conflict do nothing;
 end loop;
 delete from public.inpc;
 for tbl,source in select * from jsonb_each(payload) loop
   if jsonb_array_length(source)=0 then continue; end if;
   execute format('insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I,$1)',tbl,tbl) using source;
   execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t',tbl) into actual;
   if actual<>(select jsonb_agg(row order by row::text) from jsonb_array_elements(source) row) then
     raise exception 'Restored records differ from the backup';
   end if;
 end loop;
 set constraints all immediate;
 for item in select table_name,column_name from information_schema.columns
   where table_schema='public' and (is_identity='YES' or column_default like 'nextval(%') loop
   seq:=pg_get_serial_sequence(format('public.%I',item.table_name),item.column_name);
   if seq is not null then
     execute format('select max(%I) from public.%I',item.column_name,item.table_name) into last_value;
     perform setval(seq,coalesce(last_value,1),last_value is not null);
   end if;
 end loop;
 for item in select * from original_fks loop
   execute format('alter table %s alter constraint %I %s %s',item.tbl,item.conname,
     case when item.condeferrable then 'deferrable' else 'not deferrable' end,
     case when item.condeferred then 'initially deferred' else 'initially immediate' end);
 end loop;
 for tbl in select jsonb_object_keys(payload) loop execute format('alter table public.%I enable trigger user',tbl); end loop;
 alter table auth.users enable trigger user;
end $$;
commit;
`,
    );
    return {
      ...summary,
      restored: true,
      restoredObjects: storage.objects.length,
      auth: 'identity references only; passwords and sessions require separate recovery',
    };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(
        await restoreDrill(process.argv[2], process.env.STUDIO24_BACKUP_PASSPHRASE, process.env.TEST_DATABASE_URL),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
