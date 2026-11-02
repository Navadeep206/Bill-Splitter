CREATE TABLE homes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT ck_home_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT uq_member_id UNIQUE (id),
  CONSTRAINT fk_member_home FOREIGN KEY (home_id) REFERENCES homes(id),
  CONSTRAINT ck_member_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE bills (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT uq_bill_id UNIQUE (id),
  CONSTRAINT fk_bill_home FOREIGN KEY (home_id) REFERENCES homes(id),
  CONSTRAINT ck_bill_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT ck_bill_total_positive_int CHECK (
    typeof(total_cents) = 'integer' AND total_cents > 0
  )
);

CREATE TABLE shares (
  id TEXT PRIMARY KEY NOT NULL,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT,
  paid_key TEXT,
  CONSTRAINT fk_share_bill FOREIGN KEY (bill_id) REFERENCES bills(id),
  CONSTRAINT fk_share_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT uq_share_bill_member UNIQUE (bill_id, member_id),
  CONSTRAINT ck_share_amount_nonneg_int CHECK (
    typeof(amount_cents) = 'integer' AND amount_cents >= 0
  ),
  CONSTRAINT ck_share_paid_consistent CHECK ((paid_at IS NULL) = (paid_key IS NULL))
);

CREATE INDEX idx_members_home_seq ON members(home_id, seq);
CREATE INDEX idx_bills_home_seq ON bills(home_id, seq);
CREATE INDEX idx_shares_bill ON shares(bill_id);
CREATE INDEX idx_shares_member ON shares(member_id);
