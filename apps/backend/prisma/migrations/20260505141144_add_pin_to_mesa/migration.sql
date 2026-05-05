-- Step 1: add nullable so existing rows don't break
ALTER TABLE "mesa" ADD COLUMN "pin" TEXT;

-- Step 2: backfill — assign a zero-padded sequential PIN per restaurant
-- (lpad over row_number ordered by numero ensures uniqueness within each restaurante)
UPDATE "mesa"
SET "pin" = sub.generated_pin
FROM (
  SELECT id,
         LPAD(ROW_NUMBER() OVER (PARTITION BY restaurante_id ORDER BY numero)::TEXT, 4, '0') AS generated_pin
  FROM "mesa"
) sub
WHERE "mesa".id = sub.id;

-- Step 3: enforce NOT NULL now that every row has a value
ALTER TABLE "mesa" ALTER COLUMN "pin" SET NOT NULL;

-- Step 4: unique constraint (restaurante_id, pin)
CREATE UNIQUE INDEX "mesa_restaurante_id_pin_key" ON "mesa"("restaurante_id", "pin");
