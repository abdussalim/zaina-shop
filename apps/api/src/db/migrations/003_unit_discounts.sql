ALTER TABLE product_units
  ADD COLUMN discount_type VARCHAR(16) NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN minimum_discount NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN maximum_discount NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_product_units_discount_type
    CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  ADD CONSTRAINT ck_product_units_discount_range
    CHECK (minimum_discount >= 0 AND maximum_discount >= minimum_discount),
  ADD CONSTRAINT ck_product_units_percentage_discount
    CHECK (discount_type <> 'PERCENTAGE' OR maximum_discount <= 100),
  ADD CONSTRAINT ck_product_units_fixed_discount
    CHECK (
      discount_type <> 'FIXED'
      OR (
        minimum_discount = TRUNC(minimum_discount)
        AND maximum_discount = TRUNC(maximum_discount)
        AND maximum_discount <= sale_price
      )
    );

ALTER TABLE sale_items
  ADD COLUMN discount_type_snapshot VARCHAR(16) NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN minimum_discount_snapshot NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN maximum_discount_snapshot NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN discount_value NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN total BIGINT;

UPDATE sale_items SET total = subtotal WHERE total IS NULL;

ALTER TABLE sale_items
  ALTER COLUMN total SET NOT NULL,
  ADD CONSTRAINT ck_sale_items_discount_type
    CHECK (discount_type_snapshot IN ('PERCENTAGE', 'FIXED')),
  ADD CONSTRAINT ck_sale_items_discount_range
    CHECK (
      minimum_discount_snapshot >= 0
      AND maximum_discount_snapshot >= minimum_discount_snapshot
      AND (
        discount_value = 0
        OR discount_value BETWEEN minimum_discount_snapshot
                              AND maximum_discount_snapshot
      )
    ),
  ADD CONSTRAINT ck_sale_items_percentage_discount
    CHECK (
      discount_type_snapshot <> 'PERCENTAGE'
      OR maximum_discount_snapshot <= 100
    ),
  ADD CONSTRAINT ck_sale_items_fixed_discount
    CHECK (
      discount_type_snapshot <> 'FIXED'
      OR (
        minimum_discount_snapshot = TRUNC(minimum_discount_snapshot)
        AND maximum_discount_snapshot = TRUNC(maximum_discount_snapshot)
        AND discount_value = TRUNC(discount_value)
        AND maximum_discount_snapshot <= unit_price
      )
    ),
  ADD CONSTRAINT ck_sale_items_discount_money
    CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
  ADD CONSTRAINT ck_sale_items_total
    CHECK (total = subtotal - discount_amount);
