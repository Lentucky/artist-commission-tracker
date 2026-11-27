CREATE TABLE IF NOT EXISTS users (
                                     id            BIGSERIAL    PRIMARY KEY,
                                     email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS commissions (
                                           id          BIGSERIAL     PRIMARY KEY,
                                           user_id     BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255)  NOT NULL,
    client_name VARCHAR(255),
    platform    VARCHAR(20)   NOT NULL CHECK (platform IN ('VGEN','TWITTER','DISCORD','OTHER')),
    source_url  VARCHAR(2048),
    budget      NUMERIC(12,2) NOT NULL DEFAULT 0,
    deadline    TIMESTAMPTZ,
    status      VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
    notified    BOOLEAN       NOT NULL DEFAULT FALSE,
    metadata    JSONB         NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
    );

-- one index per sort method
CREATE INDEX IF NOT EXISTS idx_commissions_user_deadline ON commissions (user_id, deadline);
CREATE INDEX IF NOT EXISTS idx_commissions_user_budget   ON commissions (user_id, budget DESC);

-- re-scanning the same page must not create duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_user_source
    ON commissions (user_id, source_url) WHERE source_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
                                             id            BIGSERIAL   PRIMARY KEY,
                                             user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commission_id BIGINT      NOT NULL UNIQUE REFERENCES commissions(id) ON DELETE CASCADE,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

-- the extension only ever asks for unread rows
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL;