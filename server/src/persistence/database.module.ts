import { Inject, Module } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import { Pool } from 'pg'
import { ensureSchema } from './schema'

export const PG_POOL = Symbol('PgPool')

/**
 * One connection pool per process, from `DATABASE_URL`, with the schema in
 * place before anything can query it. Imported only by `StoresModule`, and
 * only when the variable is set: an unreachable database at boot is a
 * misconfiguration and fails the process, never a table.
 */
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async (): Promise<Pool> => {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL })
        await ensureSchema(pool)
        return pool
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onModuleDestroy(): Promise<void> {
    return this.pool.end()
  }
}
