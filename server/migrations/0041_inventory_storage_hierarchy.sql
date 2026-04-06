-- Add photo storage to locations
ALTER TABLE inventory_locations
  ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]';

-- Areas: within a location
CREATE TABLE IF NOT EXISTS inventory_areas (
  id          SERIAL        PRIMARY KEY,
  company_id  UUID          NOT NULL,
  location_id INT           NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  name        VARCHAR(100)  NOT NULL,
  notes       TEXT,
  photo_urls  JSONB         NOT NULL DEFAULT '[]',
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_areas_company  ON inventory_areas(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_areas_location ON inventory_areas(location_id);

-- Racks: within an area
CREATE TABLE IF NOT EXISTS inventory_racks (
  id          SERIAL        PRIMARY KEY,
  company_id  UUID          NOT NULL,
  area_id     INT           NOT NULL REFERENCES inventory_areas(id) ON DELETE CASCADE,
  name        VARCHAR(100)  NOT NULL,
  notes       TEXT,
  photo_urls  JSONB         NOT NULL DEFAULT '[]',
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_racks_company ON inventory_racks(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_racks_area    ON inventory_racks(area_id);

-- Bays: within a rack
CREATE TABLE IF NOT EXISTS inventory_bays (
  id          SERIAL        PRIMARY KEY,
  company_id  UUID          NOT NULL,
  rack_id     INT           NOT NULL REFERENCES inventory_racks(id) ON DELETE CASCADE,
  name        VARCHAR(100)  NOT NULL,
  notes       TEXT,
  photo_urls  JSONB         NOT NULL DEFAULT '[]',
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_bays_company ON inventory_bays(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_bays_rack    ON inventory_bays(rack_id);

-- Compartments: within a bay
CREATE TABLE IF NOT EXISTS inventory_compartments (
  id          SERIAL        PRIMARY KEY,
  company_id  UUID          NOT NULL,
  bay_id      INT           NOT NULL REFERENCES inventory_bays(id) ON DELETE CASCADE,
  name        VARCHAR(100)  NOT NULL,
  notes       TEXT,
  photo_urls  JSONB         NOT NULL DEFAULT '[]',
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_compartments_company ON inventory_compartments(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_compartments_bay     ON inventory_compartments(bay_id);
