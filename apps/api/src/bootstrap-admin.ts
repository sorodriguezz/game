/** Operación LOCAL explícita: crea una cuenta administrativa separada, nunca promueve jugadores. */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { createDatabase, requireDatabaseUrl, accounts } from '@reinos/db';
import { eq } from 'drizzle-orm';
const url = requireDatabaseUrl(),
  parsed = new URL(url);
if (
  !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
  !parsed.pathname.endsWith('/reinos_dev')
)
  throw new Error('Bootstrap solo para la base local reinos_dev');
const file = fileURLToPath(new URL('../../../.env.admin.local', import.meta.url));
const database = createDatabase(url, { max: 1 });
try {
  const [old] = await database.db
    .select()
    .from(accounts)
    .where(eq(accounts.email, 'administrador@reinos.local'));
  if (old) {
    if (old.role !== 'ADMIN') throw new Error('La cuenta ya existe con otro perfil');
    console.log('Administrador local ya existe; credenciales en .env.admin.local');
  } else {
    if (existsSync(file)) throw new Error('Ya existe .env.admin.local; no se sobrescribe');
    const password = randomBytes(24).toString('base64url'),
      id = randomUUID();
    await database.db.insert(accounts).values({
      id,
      email: 'administrador@reinos.local',
      displayName: 'AdministradorLocal',
      role: 'ADMIN',
      passwordHash: await hash(password, {
        algorithm: 2,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
    });
    writeFileSync(
      file,
      `# Acceso local privado; archivo ignorado por Git\nADMIN_USERNAME=AdministradorLocal\nADMIN_EMAIL=administrador@reinos.local\nADMIN_PASSWORD=${password}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    console.log('Administrador local creado; credenciales en .env.admin.local');
  }
} finally {
  await database.close();
}
