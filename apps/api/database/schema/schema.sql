BEGIN;

-- ----------------------------------------------------------------------------
-- Configurations
-- ----------------------------------------------------------------------------
ALTER DATABASE kamino SET timezone TO 'UTC';

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
CREATE TYPE inventory_item_kind AS ENUM ('folder', 'vm');
CREATE TYPE inventory_ace_effect AS ENUM ('allow', 'deny');
CREATE TYPE principal_type AS ENUM ('user', 'group');
CREATE TYPE principal_provider_type AS ENUM ('active_directory', 'proxmox');

-- ----------------------------------------------------------------------------
-- Permission bit definitions (reference)
-- ----------------------------------------------------------------------------
-- 1       = view
-- 2       = create_vm
-- 4       = create_folder
-- 8       = delete_vm
-- 16      = delete_folder
-- 32      = move_vm
-- 64      = move_folder
-- 128     = power_vm
-- 256     = snapshot_vm

-- ----------------------------------------------------------------------------
-- Directory provider configuration
-- Configured once during initial setup; exactly one row may exist.
-- external_id format per provider:
--   active_directory  — Windows SID string (e.g. S-1-5-21-...)
--   proxmox           — user@realm (e.g. root@pam) or group name
-- ----------------------------------------------------------------------------
CREATE TABLE principal_providers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_type   principal_provider_type NOT NULL,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT principal_providers_name_not_empty
        CHECK (length(trim(name)) > 0)
);

-- Enforce: exactly one provider row may ever exist
CREATE UNIQUE INDEX ux_principal_providers_single_row
    ON principal_providers ((true));

-- ----------------------------------------------------------------------------
-- Directory principals (users + groups)
-- external_id is provider-specific (see principal_providers comment above)
-- ----------------------------------------------------------------------------
CREATE TABLE principals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL REFERENCES principal_providers(id) ON DELETE RESTRICT,
    principal_type      principal_type NOT NULL,
    external_id         TEXT NOT NULL,
    name                TEXT NULL,
    description         TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate principals within the same provider
CREATE UNIQUE INDEX ux_principals_provider_external_id
    ON principals (provider_id, external_id);

-- ----------------------------------------------------------------------------
-- Group memberships
-- group_id must point to a group principal
-- member_id may point to a user or a group (nested groups supported)
-- Both sides must belong to the same provider (enforced by trigger below)
-- ----------------------------------------------------------------------------
CREATE TABLE group_memberships (
    group_id             UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    member_id            UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, member_id),
    CONSTRAINT group_memberships_no_self_membership
        CHECK (group_id <> member_id)
);

CREATE INDEX ix_group_memberships_member_id
    ON group_memberships (member_id);

-- ----------------------------------------------------------------------------
-- Inventory tree (folders + VM references)
-- ----------------------------------------------------------------------------
CREATE TABLE inventory_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id            UUID NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    kind                 inventory_item_kind NOT NULL,
    name                 TEXT NOT NULL,
    inherit_permissions  BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_items_name_not_empty
        CHECK (length(trim(name)) > 0),
    CONSTRAINT inventory_items_name_no_slash
        CHECK (name !~ '/'),
    CONSTRAINT inventory_folder_name_frontend_compatible
        CHECK (kind <> 'folder' OR name ~ '^[A-Za-z][A-Za-z0-9-]{0,62}$'),
    CONSTRAINT inventory_root_must_be_folder
        CHECK (parent_id IS NOT NULL OR kind = 'folder')
);

CREATE UNIQUE INDEX ux_inventory_items_root_folder_name
    ON inventory_items (name) WHERE parent_id IS NULL AND kind = 'folder';

CREATE INDEX ix_inventory_items_parent_kind_name
    ON inventory_items (parent_id, kind, name);

-- ----------------------------------------------------------------------------
-- Proxmox VM metadata
-- One row only for inventory_items.kind = 'vm'
-- ----------------------------------------------------------------------------
CREATE TABLE proxmox_vms (
    inventory_item_id     UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
    node                  TEXT NOT NULL,
    vmid                  INTEGER NOT NULL CHECK (vmid > 0),
    is_template           BOOLEAN NOT NULL DEFAULT false,
    cpu_count             INTEGER NULL CHECK (cpu_count IS NULL OR cpu_count >= 0),
    memory_mb             INTEGER NULL CHECK (memory_mb IS NULL OR memory_mb >= 0),
    disk_gb               NUMERIC(12,2) NULL CHECK (disk_gb IS NULL OR disk_gb >= 0),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT proxmox_vms_node_name_not_empty
        CHECK (length(trim(node)) > 0)
);

CREATE UNIQUE INDEX ux_proxmox_vms_node_vmid
    ON proxmox_vms (node, vmid);

CREATE INDEX ix_proxmox_vms_vmid
    ON proxmox_vms (vmid);


-- ----------------------------------------------------------------------------
-- ACL entries
-- Applies to folders and VM items
-- ----------------------------------------------------------------------------
CREATE TABLE inventory_acl_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    principal_id          UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    effect                inventory_ace_effect NOT NULL,
    permissions           BIGINT NOT NULL CHECK (permissions > 0),
    applies_to_self       BOOLEAN NOT NULL DEFAULT true,
    applies_to_children   BOOLEAN NOT NULL DEFAULT true,
    inherited_only        BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_acl_entries_scope_not_empty
        CHECK (applies_to_self OR applies_to_children)
);

CREATE UNIQUE INDEX ux_inventory_acl_entries_dedup
    ON inventory_acl_entries (
        inventory_item_id,
        principal_id,
        effect,
        permissions,
        applies_to_self,
        applies_to_children,
        inherited_only
    );

CREATE INDEX ix_inventory_acl_entries_principal
    ON inventory_acl_entries (principal_id);

-- ----------------------------------------------------------------------------
-- Generic updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_principal_providers_set_updated_at
BEFORE UPDATE ON principal_providers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_principals_set_updated_at
BEFORE UPDATE ON principals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_items_set_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_proxmox_vms_set_updated_at
BEFORE UPDATE ON proxmox_vms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- Validate that parent exists and is a folder
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_validate_parent_folder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_kind inventory_item_kind;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT kind
      INTO parent_kind
      FROM inventory_items
     WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent does not exist or is deleted';
    END IF;

    IF parent_kind <> 'folder' THEN
        RAISE EXCEPTION 'Parent must be a folder';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_validate_parent_folder
BEFORE INSERT OR UPDATE OF parent_id
ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION inventory_validate_parent_folder();

-- ----------------------------------------------------------------------------
-- Prevent moving an item into itself or moving a folder into its own subtree
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_prevent_cycles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    cycle_found BOOLEAN;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'Cannot move an item into itself';
    END IF;

    IF OLD.kind = 'folder' THEN
        WITH RECURSIVE descendants AS (
            SELECT id
            FROM inventory_items
            WHERE parent_id = OLD.id

            UNION ALL

            SELECT c.id
            FROM inventory_items c
            JOIN descendants d
              ON c.parent_id = d.id
        )
        SELECT EXISTS (
            SELECT 1
            FROM descendants
            WHERE id = NEW.parent_id
        )
        INTO cycle_found;

        IF cycle_found THEN
            RAISE EXCEPTION 'Cannot move a folder into its own subtree';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_prevent_cycles
BEFORE UPDATE OF parent_id
ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION inventory_prevent_cycles();

-- ----------------------------------------------------------------------------
-- Enforce:
--   - proxmox_vms row must point to inventory_items.kind = 'vm'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION proxmox_vms_validate_inventory_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item_kind inventory_item_kind;
BEGIN
    SELECT kind
      INTO item_kind
      FROM inventory_items
     WHERE id = NEW.inventory_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced inventory item does not exist';
    END IF;

    IF item_kind <> 'vm' THEN
        RAISE EXCEPTION 'proxmox_vms row must reference inventory_items.kind = ''vm''';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_proxmox_vms_validate_inventory_item
BEFORE INSERT OR UPDATE OF inventory_item_id
ON proxmox_vms
FOR EACH ROW
EXECUTE FUNCTION proxmox_vms_validate_inventory_item();

-- ----------------------------------------------------------------------------
-- Prevent changing inventory item kind if proxmox_vms linkage would become invalid
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_validate_kind_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    has_vm_row BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.kind <> OLD.kind THEN
        SELECT EXISTS (
            SELECT 1
            FROM proxmox_vms pv
            WHERE pv.inventory_item_id = NEW.id
        )
        INTO has_vm_row;

        IF has_vm_row AND NEW.kind <> 'vm' THEN
            RAISE EXCEPTION 'Cannot change kind away from vm while proxmox_vms row exists';
        END IF;

        IF NOT has_vm_row AND NEW.kind = 'vm' THEN
            -- allowed temporarily so caller can insert proxmox_vms in same transaction
            NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_validate_kind_change
BEFORE UPDATE OF kind
ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION inventory_validate_kind_change();

-- ----------------------------------------------------------------------------
-- Ensure group_memberships.group_id is actually a group
-- Also ensures both sides belong to the same provider
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION group_memberships_validate_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    group_type      principal_type;
    group_provider  UUID;
    member_provider UUID;
BEGIN
    SELECT principal_type, provider_id
      INTO group_type, group_provider
      FROM principals
     WHERE id = NEW.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group principal does not exist';
    END IF;

    IF group_type <> 'group' THEN
        RAISE EXCEPTION 'group_id must reference a group principal';
    END IF;

    SELECT provider_id
      INTO member_provider
      FROM principals
     WHERE id = NEW.member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member principal does not exist';
    END IF;

    IF group_provider <> member_provider THEN
        RAISE EXCEPTION 'group_id and member_id must belong to the same directory provider';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_group_memberships_validate_group
BEFORE INSERT OR UPDATE OF group_id, member_id
ON group_memberships
FOR EACH ROW
EXECUTE FUNCTION group_memberships_validate_group();

-- ----------------------------------------------------------------------------
-- Prevent nested group cycles
-- Only relevant when member_id is also a group
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION group_memberships_prevent_cycles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    member_type principal_type;
    cycle_found BOOLEAN;
BEGIN
    SELECT principal_type
      INTO member_type
      FROM principals
     WHERE id = NEW.member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member principal does not exist';
    END IF;

    -- If member is a user, no nested-group cycle possible
    IF member_type <> 'group' THEN
        RETURN NEW;
    END IF;

    -- Check whether NEW.group_id is reachable from NEW.member_id
    WITH RECURSIVE nested_groups AS (
        SELECT gm.group_id, gm.member_id
        FROM group_memberships gm
        WHERE gm.group_id = NEW.member_id

        UNION ALL

        SELECT gm.group_id, gm.member_id
        FROM group_memberships gm
        JOIN nested_groups ng
          ON gm.group_id = ng.member_id
    )
    SELECT EXISTS (
        SELECT 1
        FROM nested_groups
        WHERE member_id = NEW.group_id
    )
    INTO cycle_found;

    IF cycle_found THEN
        RAISE EXCEPTION 'Nested group membership would create a cycle';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_group_memberships_prevent_cycles
BEFORE INSERT OR UPDATE OF group_id, member_id
ON group_memberships
FOR EACH ROW
EXECUTE FUNCTION group_memberships_prevent_cycles();

-- ----------------------------------------------------------------------------
-- Helper: get all effective principals for a user (user + all transitive groups)
-- Returns UUIDs of principals applicable to the user
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_effective_principals(p_user_principal_id UUID)
RETURNS TABLE (principal_id UUID)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE effective_groups AS (
        SELECT gm.group_id
        FROM group_memberships gm
        WHERE gm.member_id = p_user_principal_id

        UNION

        SELECT gm.group_id
        FROM group_memberships gm
        JOIN effective_groups eg
          ON gm.member_id = eg.group_id
    )
    SELECT p_user_principal_id
    UNION
    SELECT eg.group_id
    FROM effective_groups eg;
$$;

-- ----------------------------------------------------------------------------
-- Helper: get ancestor chain from item to root (including self)
-- depth = 0 => self
-- depth increases toward root
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_inventory_ancestor_chain(p_inventory_item_id UUID)
RETURNS TABLE (
    inventory_item_id UUID,
    depth             INTEGER,
    kind              inventory_item_kind,
    inherit_permissions BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE chain AS (
        SELECT
            ii.id,
            ii.parent_id,
            ii.kind,
            ii.inherit_permissions,
            0::INTEGER AS depth
        FROM inventory_items ii
        WHERE ii.id = p_inventory_item_id

        UNION ALL

        SELECT
            parent.id,
            parent.parent_id,
            parent.kind,
            parent.inherit_permissions,
            chain.depth + 1
        FROM inventory_items parent
        JOIN chain
          ON parent.id = chain.parent_id
    )
    SELECT
        id AS inventory_item_id,
        depth,
        kind,
        inherit_permissions
    FROM chain;
$$;

-- ----------------------------------------------------------------------------
-- Core helper: effective permissions for a user on an inventory item
--
-- Semantics:
--   - Applies ACEs from self and ancestors
--   - Traverses upward until first ancestor (excluding self) where
--     inherit_permissions = false, and includes that ancestor's ACEs but stops there
--   - Self row uses applies_to_self
--   - Ancestor rows use applies_to_children
--   - inherited_only = true ACEs do NOT apply on self row, only inherited descendants
--   - Deny wins over allow per bit
--
-- Return:
--   allowed_mask = allow bits after deny subtraction
--   denied_mask  = aggregate deny bits considered
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_effective_permissions(
    p_user_principal_id UUID,
    p_inventory_item_id UUID
)
RETURNS TABLE (
    allowed_mask BIGINT,
    denied_mask  BIGINT
)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE principal_set AS (
        SELECT principal_id
        FROM get_user_effective_principals(p_user_principal_id)
    ),
    chain AS (
        -- Build self -> root, but stop *after including* first ancestor with inherit_permissions = false
        WITH RECURSIVE c AS (
            SELECT
                ii.id,
                ii.parent_id,
                ii.inherit_permissions,
                0::INTEGER AS depth,
                false AS stop_after_this
            FROM inventory_items ii
            WHERE ii.id = p_inventory_item_id

            UNION ALL

            SELECT
                parent.id,
                parent.parent_id,
                parent.inherit_permissions,
                c.depth + 1,
                (c.depth + 1) > 0 AND parent.inherit_permissions = false
            FROM inventory_items parent
            JOIN c
              ON parent.id = c.parent_id
            WHERE NOT c.stop_after_this
        )
        SELECT id, depth
        FROM c
    ),
    applicable_aces AS (
        SELECT
            ace.effect,
            ace.permissions
        FROM chain ch
        JOIN inventory_acl_entries ace
          ON ace.inventory_item_id = ch.id
        JOIN principal_set ps
          ON ps.principal_id = ace.principal_id
        WHERE
            (
                ch.depth = 0
                AND ace.applies_to_self = true
                AND ace.inherited_only = false
            )
            OR
            (
                ch.depth > 0
                AND ace.applies_to_children = true
            )
    ),
    agg AS (
        SELECT
            COALESCE(bit_or(permissions) FILTER (WHERE effect = 'allow'), 0::BIGINT) AS allow_bits,
            COALESCE(bit_or(permissions) FILTER (WHERE effect = 'deny'),  0::BIGINT) AS deny_bits
        FROM applicable_aces
    )
    SELECT
        (allow_bits & ~deny_bits) AS allowed_mask,
        deny_bits                 AS denied_mask
    FROM agg;
$$;

-- ----------------------------------------------------------------------------
-- Optional helper: boolean permission check for a specific bit mask
-- Example:
--   SELECT has_permission(user_id, item_id, 128); -- power_vm
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_permission(
    p_user_principal_id UUID,
    p_inventory_item_id UUID,
    p_required_mask BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT ((gep.allowed_mask & p_required_mask) = p_required_mask)
    FROM get_effective_permissions(p_user_principal_id, p_inventory_item_id) gep;
$$;

-- ----------------------------------------------------------------------------
-- Optional helper: inventory path (for display/debug)
-- Returns root/.../self
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_inventory_item_path(p_inventory_item_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE chain AS (
        SELECT
            ii.id,
            ii.parent_id,
            ii.name,
            0::INTEGER AS depth
        FROM inventory_items ii
        WHERE ii.id = p_inventory_item_id

        UNION ALL

        SELECT
            parent.id,
            parent.parent_id,
            parent.name,
            chain.depth + 1
        FROM inventory_items parent
        JOIN chain
          ON parent.id = chain.parent_id
    )
    SELECT string_agg(name, '/' ORDER BY depth DESC)
    FROM chain;
$$;

COMMIT;
