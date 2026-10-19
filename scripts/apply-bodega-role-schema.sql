BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TYPE "TipoPerfilVendedor" ADD VALUE IF NOT EXISTS 'BODEGA';

INSERT INTO "Rol" ("nombre", "descripcion", "createdAt", "updatedAt")
VALUES ('BODEGA', 'Gestion exclusiva de la bodega principal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;

COMMIT;
