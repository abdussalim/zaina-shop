ALTER TABLE stock_movements
  ADD COLUMN product_name VARCHAR(160),
  ADD COLUMN unit_name VARCHAR(40);

UPDATE stock_movements AS movement
SET product_name = product.name,
    unit_name = unit.name
FROM products AS product, product_units AS unit
WHERE product.id = movement.product_id
  AND unit.id = movement.unit_id;

ALTER TABLE stock_movements
  ALTER COLUMN product_name SET NOT NULL,
  ALTER COLUMN unit_name SET NOT NULL;

DROP INDEX uk_product_units_name_lower;
CREATE UNIQUE INDEX uk_product_units_active_name_lower
  ON product_units (product_id, LOWER(name))
  WHERE is_active = TRUE;

UPDATE products AS product
SET is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
FROM inventory_balances AS balance
WHERE balance.product_id = product.id
  AND balance.quantity_base > 0
  AND product.is_active = FALSE;
