-- Additive identity metadata only: no inventory balances or legacy labels change.
CREATE TABLE IF NOT EXISTS "InventarioAcreedorIdentidad" (
  "id" SERIAL NOT NULL,
  "origen" TEXT COLLATE "C" NOT NULL,
  "nombre" TEXT COLLATE "C" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventarioAcreedorIdentidad_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventarioAcreedorIdentidad_origen_nombre_key"
    UNIQUE ("origen", "nombre")
);
