DROP TABLE IF EXISTS "DiscountRule";

ALTER TABLE "Employee"
  DROP COLUMN IF EXISTS "baseSalary";

ALTER TABLE "ConfigurationVersion"
  DROP COLUMN IF EXISTS "baseSalary",
  DROP COLUMN IF EXISTS "legalDiscountRate",
  DROP COLUMN IF EXISTS "dailyDiscountAmount",
  DROP COLUMN IF EXISTS "discountMode";

DROP TYPE IF EXISTS "DiscountMode";
