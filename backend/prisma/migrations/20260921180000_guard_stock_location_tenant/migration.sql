-- Enforce tenant boundaries even for older application instances.
CREATE OR REPLACE FUNCTION enforce_stock_location_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product_establishment uuid;
  location_establishment uuid;
BEGIN
  IF NEW."productId" IS NOT NULL THEN
    SELECT "establishmentId" INTO product_establishment FROM products WHERE id = NEW."productId";
  END IF;
  IF NEW."locationId" IS NOT NULL THEN
    SELECT "establishmentId" INTO location_establishment FROM stock_locations WHERE id = NEW."locationId";
  END IF;
  IF product_establishment IS NOT NULL AND location_establishment IS NOT NULL
     AND product_establishment <> location_establishment THEN
    RAISE EXCEPTION 'Stock location belongs to another establishment' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'stock_movements' THEN
    IF (product_establishment IS NOT NULL AND product_establishment <> NEW."establishmentId")
       OR (location_establishment IS NOT NULL AND location_establishment <> NEW."establishmentId") THEN
      RAISE EXCEPTION 'Stock movement belongs to another establishment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_stocks_tenant_guard
BEFORE INSERT OR UPDATE ON product_stocks
FOR EACH ROW EXECUTE FUNCTION enforce_stock_location_tenant();

CREATE TRIGGER stock_movements_tenant_guard
BEFORE INSERT OR UPDATE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION enforce_stock_location_tenant();
