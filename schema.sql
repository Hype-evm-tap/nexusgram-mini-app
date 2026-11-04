PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT 'Miner',
  username TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
  energy INTEGER NOT NULL DEFAULT 1000 CHECK(energy >= 0),
  max_energy INTEGER NOT NULL DEFAULT 1000 CHECK(max_energy >= 0),
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  multitap_level INTEGER NOT NULL DEFAULT 0,
  energy_level INTEGER NOT NULL DEFAULT 0,
  recharge_level INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_daily_day TEXT,
  referred_by TEXT
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  bonus_awarded INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(inviter_id) REFERENCES users(telegram_id),
  FOREIGN KEY(invitee_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS daily_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  claim_day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(telegram_id, claim_day),
  FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS ad_claims (
  claim_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  claim_day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_claims_user_day ON ad_claims(telegram_id, claim_day);
