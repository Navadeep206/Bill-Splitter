-- A home's bills may add up to at most 9007199254740991 cents (Number.MAX_SAFE_INTEGER),
-- so every balance stays an exact whole number in SQLite and in JavaScript. A trigger
-- runs inside the insert itself, so two bills created at the same time can't both pass.
CREATE TRIGGER trg_bills_home_total_safe
BEFORE INSERT ON bills
WHEN NEW.total_cents > 9007199254740991 - (
  SELECT COALESCE(SUM(total_cents), 0) FROM bills WHERE home_id = NEW.home_id
)
BEGIN
  SELECT RAISE(ABORT, 'home total too large');
END;
