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
CREATE TYPE principal_provider_type AS ENUM ('active_directory', 'proxmox', 'system');
CREATE TYPE reserved_principal_key AS ENUM ('all-users');
CREATE TYPE request_family AS ENUM ('inventory');
CREATE TYPE request_status AS ENUM (
    'pending',
    'approved',
    'executing',
    'denied',
    'executed',
    'execution_failed',
    'canceled'
);
CREATE TYPE request_event_kind AS ENUM (
    'submitted',
    'approved',
    'execution_started',
    'denied',
    'executed',
    'execution_failed',
    'canceled'
);
CREATE TYPE inventory_request_power_action AS ENUM (
    'power_on',
    'shutdown',
    'reboot',
    'stop'
);
CREATE TYPE published_pod_status AS ENUM ('listed', 'unlisted');

-- ----------------------------------------------------------------------------
-- Permission bit definitions (reference)
-- ----------------------------------------------------------------------------
-- 1       = view
-- 2       = create_vm
-- 4       = create_folder
-- 8       = rename_vm
-- 16      = rename_folder
-- 32      = delete_vm
-- 64      = delete_folder
-- 128     = move_vm
-- 256     = move_folder
-- 512     = power_vm
-- 1024    = console_vm
-- 2048    = clone_vm
-- 4096    = snapshot_vm
-- 8192    = template_vm
-- 16384   = manage_permissions
-- 32768   = edit_vm_hardware
-- 65536   = view_snapshots

-- ----------------------------------------------------------------------------
-- Management permission definitions (reference)
-- ----------------------------------------------------------------------------
-- administrator
-- manager

-- ----------------------------------------------------------------------------
-- Directory provider configuration
-- Configured once during initial setup for the directory provider.
-- A reserved system provider row also exists for built-in principals.
-- external_id format per provider:
--   active_directory  — Windows SID string (e.g. S-1-5-21-...)
--   proxmox           — user@realm (e.g. root@pam) or group name
--   system            — reserved internal keys (e.g. system:all-users)
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

-- Enforce:
--   - only one system provider row may exist
--   - only one non-system directory provider row may exist
CREATE UNIQUE INDEX ux_principal_providers_provider_type
    ON principal_providers (provider_type);

CREATE UNIQUE INDEX ux_principal_providers_single_directory_row
    ON principal_providers ((true))
    WHERE provider_type <> 'system';

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
-- Reserved / system principals
-- ----------------------------------------------------------------------------
CREATE TABLE reserved_principals (
    principal_id    UUID PRIMARY KEY REFERENCES principals(id) ON DELETE RESTRICT,
    reserved_key    reserved_principal_key NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
-- Browser authentication sessions
-- Stores hashed opaque refresh tokens for rotation and revocation.
-- Access JWTs stay short-lived and are not persisted server-side.
-- ----------------------------------------------------------------------------
CREATE TABLE auth_sessions (
    id                      UUID PRIMARY KEY,
    principal_id            UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    token_hash              TEXT NOT NULL,
    family_id               UUID NOT NULL,
    replaced_by_session_id  UUID NULL REFERENCES auth_sessions(id) ON DELETE SET NULL,
    user_agent              TEXT NULL,
    ip_address              TEXT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at              TIMESTAMPTZ NOT NULL,
    revoked_at              TIMESTAMPTZ NULL,
    CONSTRAINT auth_sessions_token_hash_not_empty
        CHECK (length(token_hash) > 0)
);

CREATE UNIQUE INDEX ux_auth_sessions_token_hash
    ON auth_sessions (token_hash);

CREATE INDEX ix_auth_sessions_principal_id
    ON auth_sessions (principal_id);

CREATE INDEX ix_auth_sessions_family_id
    ON auth_sessions (family_id);

CREATE INDEX ix_auth_sessions_expires_at
    ON auth_sessions (expires_at);

-- ----------------------------------------------------------------------------
-- Inventory tree (folders + VM references)
-- ----------------------------------------------------------------------------
CREATE TABLE inventory_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id            UUID NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    kind                 inventory_item_kind NOT NULL,
    name                 TEXT NOT NULL,
    inherit_permissions  BOOLEAN NOT NULL DEFAULT true,
    vm_limit             INTEGER NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_items_name_not_empty
        CHECK (length(trim(name)) > 0),
    CONSTRAINT inventory_items_name_no_slash
        CHECK (name !~ '/'),
    CONSTRAINT inventory_folder_name_frontend_compatible
        CHECK (kind <> 'folder' OR name ~ '^[A-Za-z][A-Za-z0-9-]{0,62}$'),
    CONSTRAINT inventory_root_must_be_folder
        CHECK (parent_id IS NOT NULL OR kind = 'folder'),
    CONSTRAINT inventory_folder_vm_limit_positive
        CHECK (vm_limit IS NULL OR vm_limit > 0),
    CONSTRAINT inventory_vm_limit_folders_only
        CHECK (kind = 'folder' OR vm_limit IS NULL)
);

CREATE UNIQUE INDEX ux_inventory_items_root_folder_name
    ON inventory_items (name) WHERE parent_id IS NULL AND kind = 'folder';

CREATE UNIQUE INDEX ux_inventory_items_child_folder_name
    ON inventory_items (parent_id, name) WHERE parent_id IS NOT NULL AND kind = 'folder';

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
    upstream_uuid         UUID NOT NULL,
    is_template           BOOLEAN NOT NULL DEFAULT false,
    notes                 TEXT NULL,
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

CREATE UNIQUE INDEX ux_proxmox_vms_upstream_uuid
    ON proxmox_vms (upstream_uuid);

CREATE INDEX ix_proxmox_vms_vmid
    ON proxmox_vms (vmid);


-- ----------------------------------------------------------------------------
-- VM action claims
-- Durable serialization boundary: only one direct mutation may hold a claim
-- on a given inventory item at a time. The unique constraint on
-- inventory_item_id (enforced via the primary key) is what actually blocks
-- concurrent claims; the row lock taken by SELECT ... FOR UPDATE only lasts
-- for the surrounding transaction/statement, so this table is the source of
-- truth for cross-request serialization.
-- ----------------------------------------------------------------------------
CREATE TABLE vm_action_claims (
    inventory_item_id    UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
    action               TEXT NOT NULL,
    actor_principal_id   UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    claimed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    detail               TEXT NULL,
    CONSTRAINT vm_action_claims_action_not_empty
        CHECK (length(trim(action)) > 0)
);

-- ----------------------------------------------------------------------------
-- Folder VM capacity reservations
-- Serialization boundary for folder VM capacity checks.
-- ----------------------------------------------------------------------------
CREATE TABLE folder_vm_capacity_reservations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id   UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    vm_count    INTEGER NOT NULL CHECK (vm_count > 0),
    operation   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT folder_vm_capacity_reservations_operation_not_empty
        CHECK (length(trim(operation)) > 0)
);

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
-- Management permission grants
-- Applies to non-inventory management surfaces and only to group principals.
-- ----------------------------------------------------------------------------
CREATE TABLE management_permission_grants (
    group_principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    permission_key     TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_principal_id, permission_key),
    CONSTRAINT management_permission_grants_permission_key_not_empty
        CHECK (length(trim(permission_key)) > 0)
);

CREATE INDEX ix_management_permission_grants_permission_key
    ON management_permission_grants (permission_key);

-- ----------------------------------------------------------------------------
-- Requests
-- ----------------------------------------------------------------------------
CREATE TABLE requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family                  request_family NOT NULL,
    kind                    TEXT NOT NULL,
    requester_principal_id  UUID NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    reviewer_principal_id   UUID NULL REFERENCES principals(id) ON DELETE RESTRICT,
    status                  request_status NOT NULL DEFAULT 'pending',
    reviewed_at             TIMESTAMPTZ NULL,
    execution_started_at    TIMESTAMPTZ NULL,
    executed_at             TIMESTAMPTZ NULL,
    canceled_at             TIMESTAMPTZ NULL,
    execution_error         TEXT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT requests_kind_not_empty
        CHECK (length(trim(kind)) > 0),
    CONSTRAINT requests_inventory_kind_known
        CHECK (
            family <> 'inventory'
            OR kind IN (
                'inventory.vm.power',
                'inventory.vm.snapshot.create',
                'inventory.vm.snapshot.rollback'
            )
        ),
    CONSTRAINT requests_reviewer_required_when_reviewed
        CHECK (reviewed_at IS NULL OR reviewer_principal_id IS NOT NULL),
    CONSTRAINT requests_canceled_at_requires_canceled
        CHECK ((status = 'canceled') = (canceled_at IS NOT NULL))
);

CREATE INDEX ix_requests_status_created_at
    ON requests (status, created_at DESC);

CREATE INDEX ix_requests_requester_created_at
    ON requests (requester_principal_id, created_at DESC);

CREATE INDEX ix_requests_pending_requester
    ON requests (requester_principal_id)
    WHERE status = 'pending';

CREATE INDEX ix_requests_executing_started_at
    ON requests (execution_started_at)
    WHERE status = 'executing';

CREATE INDEX ix_requests_reviewer_created_at
    ON requests (reviewer_principal_id, created_at DESC);

CREATE INDEX ix_requests_completed_updated_at
    ON requests (updated_at DESC, created_at DESC, id DESC)
    WHERE status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed');

CREATE INDEX ix_requests_requester_history_updated_at
    ON requests (requester_principal_id, updated_at DESC, created_at DESC, id DESC)
    WHERE status IN ('approved', 'executing', 'denied', 'executed', 'execution_failed');

CREATE TABLE request_events (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    event_kind          request_event_kind NOT NULL,
    actor_principal_id  UUID NULL REFERENCES principals(id) ON DELETE RESTRICT,
    from_status         request_status NULL,
    to_status           request_status NOT NULL,
    error_message       TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_request_events_request_id_created_at
    ON request_events (request_id, created_at ASC, id ASC);

CREATE TABLE inventory_requests (
    request_id          UUID PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    power_action        inventory_request_power_action NULL,
    snapshot_name       TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_requests_snapshot_name_not_blank
        CHECK (snapshot_name IS NULL OR length(trim(snapshot_name)) > 0)
);

CREATE INDEX ix_inventory_requests_inventory_item_id
    ON inventory_requests (inventory_item_id);

-- ----------------------------------------------------------------------------
-- Published pod catalog
-- ----------------------------------------------------------------------------
CREATE TABLE published_pods (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                   TEXT NOT NULL,
    slug                    TEXT NOT NULL,
    description             TEXT NOT NULL,
    image_url               TEXT NOT NULL,
    status                  published_pod_status NOT NULL DEFAULT 'listed',
    source_folder_id        UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    publisher_principal_id  UUID NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    clone_count             INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT published_pods_title_not_empty
        CHECK (length(trim(title)) > 0 AND length(title) <= 32),
    CONSTRAINT published_pods_description_not_empty
        CHECK (length(trim(description)) > 0 AND length(description) <= 128),
    CONSTRAINT published_pods_image_url_not_empty
        CHECK (length(trim(image_url)) > 0),
    CONSTRAINT published_pods_slug_format
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT published_pods_clone_count_non_negative
        CHECK (clone_count >= 0)
);

CREATE UNIQUE INDEX ux_published_pods_slug
    ON published_pods (slug);

CREATE INDEX ix_published_pods_status_created_at
    ON published_pods (status, created_at DESC);

CREATE INDEX ix_published_pods_source_folder_id
    ON published_pods (source_folder_id);

CREATE TABLE published_pod_creators (
    pod_id        UUID NOT NULL REFERENCES published_pods(id) ON DELETE CASCADE,
    principal_id  UUID NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    sort_order    INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pod_id, principal_id)
);

CREATE UNIQUE INDEX ux_published_pod_creators_order
    ON published_pod_creators (pod_id, sort_order);

CREATE TABLE published_pod_audience (
    pod_id        UUID NOT NULL REFERENCES published_pods(id) ON DELETE CASCADE,
    principal_id  UUID NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    sort_order    INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pod_id, principal_id)
);

CREATE UNIQUE INDEX ux_published_pod_audience_order
    ON published_pod_audience (pod_id, sort_order);

CREATE INDEX ix_published_pod_audience_principal
    ON published_pod_audience (principal_id);

CREATE TABLE published_pod_vms (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id                    UUID NOT NULL REFERENCES published_pods(id) ON DELETE CASCADE,
    source_inventory_item_id  UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    name                      TEXT NOT NULL,
    cpu_count                 INTEGER NOT NULL CHECK (cpu_count > 0),
    memory_mb                 INTEGER NOT NULL CHECK (memory_mb > 0),
    disk_gb                   NUMERIC(12,2) NOT NULL CHECK (disk_gb > 0),
    allow_mask                BIGINT NOT NULL CHECK (allow_mask >= 0),
    deny_mask                 BIGINT NOT NULL CHECK (deny_mask >= 0),
    sort_order                INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT published_pod_vms_name_not_empty
        CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX ux_published_pod_vms_source
    ON published_pod_vms (pod_id, source_inventory_item_id);

CREATE UNIQUE INDEX ux_published_pod_vms_order
    ON published_pod_vms (pod_id, sort_order);

CREATE TABLE published_pod_tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id      UUID NOT NULL REFERENCES published_pods(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    sort_order  INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT published_pod_tasks_title_not_empty
        CHECK (length(trim(title)) > 0 AND length(title) <= 64),
    CONSTRAINT published_pod_tasks_content_not_empty
        CHECK (length(trim(content)) > 0 AND length(content) <= 4096)
);

CREATE UNIQUE INDEX ux_published_pod_tasks_order
    ON published_pod_tasks (pod_id, sort_order);

CREATE TABLE published_pod_task_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES published_pod_tasks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    answer_outline  TEXT NOT NULL,
    description     TEXT NULL,
    hint            TEXT NULL,
    sort_order      INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT published_pod_task_questions_title_not_empty
        CHECK (length(trim(title)) > 0 AND length(title) <= 256),
    CONSTRAINT published_pod_task_questions_answer_not_empty
        CHECK (length(trim(answer_outline)) > 0 AND length(answer_outline) <= 256),
    CONSTRAINT published_pod_task_questions_hint_length
        CHECK (hint IS NULL OR length(hint) <= 256)
);

CREATE UNIQUE INDEX ux_published_pod_task_questions_order
    ON published_pod_task_questions (task_id, sort_order);

-- ----------------------------------------------------------------------------
-- User pod clones and task progress
-- ----------------------------------------------------------------------------
CREATE TABLE cloned_pods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id              UUID NOT NULL REFERENCES published_pods(id) ON DELETE CASCADE,
    user_principal_id   UUID NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    folder_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    network_number      INTEGER NOT NULL CHECK (network_number BETWEEN 1 AND 254),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pod_id, user_principal_id),
    UNIQUE (folder_id),
    UNIQUE (network_number)
);

CREATE INDEX ix_cloned_pods_user_created_at
    ON cloned_pods (user_principal_id, created_at DESC);

CREATE INDEX ix_cloned_pods_pod_created_at
    ON cloned_pods (pod_id, created_at DESC);

CREATE TABLE pod_dev_network_allocations (
    pod_folder_id  UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
    network_number INTEGER NOT NULL CHECK (network_number BETWEEN 1 AND 254),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network_number)
);

CREATE OR REPLACE FUNCTION published_pods_update_clone_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE published_pods
           SET clone_count = clone_count + 1
         WHERE id = NEW.pod_id;
        RETURN NEW;
    END IF;

    UPDATE published_pods
       SET clone_count = GREATEST(clone_count - 1, 0)
     WHERE id = OLD.pod_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cloned_pods_update_clone_count_insert
AFTER INSERT ON cloned_pods
FOR EACH ROW
EXECUTE FUNCTION published_pods_update_clone_count();

CREATE TRIGGER trg_cloned_pods_update_clone_count_delete
AFTER DELETE ON cloned_pods
FOR EACH ROW
EXECUTE FUNCTION published_pods_update_clone_count();

CREATE TABLE cloned_pod_vms (
    cloned_pod_id       UUID NOT NULL REFERENCES cloned_pods(id) ON DELETE CASCADE,
    published_pod_vm_id UUID NOT NULL REFERENCES published_pod_vms(id) ON DELETE RESTRICT,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    sort_order          INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cloned_pod_id, published_pod_vm_id),
    UNIQUE (inventory_item_id),
    UNIQUE (cloned_pod_id, sort_order)
);

CREATE TABLE cloned_pod_task_states (
    cloned_pod_id   UUID NOT NULL REFERENCES cloned_pods(id) ON DELETE CASCADE,
    task_id         UUID NOT NULL REFERENCES published_pod_tasks(id) ON DELETE CASCADE,
    completed       BOOLEAN NOT NULL DEFAULT false,
    completed_at    TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cloned_pod_id, task_id),
    CONSTRAINT cloned_pod_task_states_completed_at_matches_state
        CHECK ((completed AND completed_at IS NOT NULL) OR (NOT completed AND completed_at IS NULL))
);

CREATE TABLE cloned_pod_question_answers (
    cloned_pod_id   UUID NOT NULL REFERENCES cloned_pods(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES published_pod_task_questions(id) ON DELETE CASCADE,
    answer          TEXT NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT false,
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cloned_pod_id, question_id),
    CONSTRAINT cloned_pod_question_answers_answer_not_empty
        CHECK (length(trim(answer)) > 0 AND length(answer) <= 256)
);

CREATE TABLE principal_pod_question_answers (
    principal_id        UUID NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    source_pod_id       UUID NOT NULL,
    source_task_id      UUID NOT NULL,
    source_question_id  UUID NOT NULL,
    last_cloned_pod_id  UUID NULL,
    pod_slug            TEXT NOT NULL,
    pod_title           TEXT NOT NULL,
    task_title          TEXT NOT NULL,
    question_title      TEXT NOT NULL,
    answer              TEXT NOT NULL,
    is_correct          BOOLEAN NOT NULL DEFAULT false,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (principal_id, source_pod_id, source_question_id),
    CONSTRAINT principal_pod_question_answers_answer_not_empty
        CHECK (length(trim(answer)) > 0 AND length(answer) <= 256),
    CONSTRAINT principal_pod_question_answers_labels_not_empty
        CHECK (
            length(trim(pod_slug)) > 0
            AND length(trim(pod_title)) > 0
            AND length(trim(task_title)) > 0
            AND length(trim(question_title)) > 0
        )
);

CREATE INDEX ix_principal_pod_question_answers_activity
    ON principal_pod_question_answers (principal_id, answered_at DESC)
    WHERE is_correct;

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

CREATE TRIGGER trg_requests_set_updated_at
BEFORE UPDATE ON requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_published_pods_set_updated_at
BEFORE UPDATE ON published_pods
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cloned_pods_set_updated_at
BEFORE UPDATE ON cloned_pods
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cloned_pod_task_states_set_updated_at
BEFORE UPDATE ON cloned_pod_task_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_principal_pod_question_answers_set_updated_at
BEFORE UPDATE ON principal_pod_question_answers
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
-- Folder VM/template limits
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_folder_effective_vm_limit(folder_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, vm_limit, 0 AS depth
        FROM inventory_items
        WHERE id = folder_id
          AND kind = 'folder'

        UNION ALL

        SELECT parent.id, parent.parent_id, parent.vm_limit, ancestors.depth + 1
        FROM inventory_items parent
        JOIN ancestors
          ON ancestors.parent_id = parent.id
    )
    SELECT vm_limit
    FROM ancestors
    WHERE vm_limit IS NOT NULL
    ORDER BY depth ASC
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION inventory_folder_vm_count(
    folder_id UUID,
    excluded_item_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)::INTEGER
    FROM inventory_items
    WHERE parent_id = folder_id
      AND kind = 'vm'
      AND (excluded_item_id IS NULL OR id <> excluded_item_id);
$$;

CREATE OR REPLACE FUNCTION inventory_enforce_folder_vm_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    current_vm_count INTEGER;
    effective_vm_limit INTEGER;
    excluded_id UUID;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.kind <> 'vm' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
            RETURN NEW;
        END IF;
        excluded_id := OLD.id;
    ELSE
        excluded_id := NULL;
    END IF;

    effective_vm_limit := inventory_folder_effective_vm_limit(NEW.parent_id);
    IF effective_vm_limit IS NULL THEN
        RETURN NEW;
    END IF;

    current_vm_count := inventory_folder_vm_count(NEW.parent_id, excluded_id);
    IF current_vm_count + 1 > effective_vm_limit THEN
        RAISE EXCEPTION 'Folder limit exceeded';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_enforce_folder_vm_limit
BEFORE INSERT OR UPDATE OF parent_id
ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION inventory_enforce_folder_vm_limit();

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
-- Ensure published pod inventory references keep their expected item kinds
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION published_pods_validate_source_folder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item_kind inventory_item_kind;
BEGIN
    SELECT kind
      INTO item_kind
      FROM inventory_items
     WHERE id = NEW.source_folder_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Published Pod Folder does not exist';
    END IF;

    IF item_kind <> 'folder' THEN
        RAISE EXCEPTION 'Published pod source must be a folder';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_published_pods_validate_source_folder
BEFORE INSERT OR UPDATE OF source_folder_id
ON published_pods
FOR EACH ROW
EXECUTE FUNCTION published_pods_validate_source_folder();

CREATE OR REPLACE FUNCTION published_pod_vms_validate_source_vm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item_kind inventory_item_kind;
BEGIN
    SELECT kind
      INTO item_kind
      FROM inventory_items
     WHERE id = NEW.source_inventory_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Published pod VM source does not exist';
    END IF;

    IF item_kind <> 'vm' THEN
        RAISE EXCEPTION 'Published pod VM source must be a VM';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_published_pod_vms_validate_source_vm
BEFORE INSERT OR UPDATE OF source_inventory_item_id
ON published_pod_vms
FOR EACH ROW
EXECUTE FUNCTION published_pod_vms_validate_source_vm();

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
-- Ensure management permission grant rows point to group principals
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION management_permission_grants_validate_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_type principal_type;
BEGIN
    SELECT principal_type
      INTO target_type
      FROM principals
     WHERE id = NEW.group_principal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Management permission grant principal does not exist';
    END IF;

    IF target_type <> 'group' THEN
        RAISE EXCEPTION 'Management permission grants may only target group principals';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_management_permission_grants_validate_group
BEFORE INSERT OR UPDATE OF group_principal_id
ON management_permission_grants
FOR EACH ROW
EXECUTE FUNCTION management_permission_grants_validate_group();

-- ----------------------------------------------------------------------------
-- Ensure reserved principals point to system-backed group principals
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserved_principals_validate_principal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_type          principal_type;
    target_provider_type principal_provider_type;
BEGIN
    SELECT p.principal_type, pp.provider_type
      INTO target_type, target_provider_type
      FROM principals p
      JOIN principal_providers pp
        ON pp.id = p.provider_id
     WHERE p.id = NEW.principal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserved principal does not exist';
    END IF;

    IF target_type <> 'group' THEN
        RAISE EXCEPTION 'Reserved principals must reference group principals';
    END IF;

    IF target_provider_type <> 'system' THEN
        RAISE EXCEPTION 'Reserved principals must reference the system provider';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reserved_principals_validate_principal
BEFORE INSERT OR UPDATE OF principal_id
ON reserved_principals
FOR EACH ROW
EXECUTE FUNCTION reserved_principals_validate_principal();

-- ----------------------------------------------------------------------------
-- Restrict management permission grants to the supported application catalog
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION management_permission_grants_validate_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.permission_key NOT IN ('administrator', 'manager') THEN
        RAISE EXCEPTION 'Unsupported management permission key: %', NEW.permission_key;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_management_permission_grants_validate_key
BEFORE INSERT OR UPDATE OF permission_key
ON management_permission_grants
FOR EACH ROW
EXECUTE FUNCTION management_permission_grants_validate_key();

-- ----------------------------------------------------------------------------
-- Limit users to three pending requests
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION requests_enforce_pending_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    pending_count INTEGER;
BEGIN
    IF NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'pending'
       AND NEW.requester_principal_id = OLD.requester_principal_id THEN
        RETURN NEW;
    END IF;

    PERFORM 1
      FROM principals
     WHERE id = NEW.requester_principal_id
     FOR UPDATE;

    SELECT count(*)::INTEGER
      INTO pending_count
      FROM requests
     WHERE requester_principal_id = NEW.requester_principal_id
       AND status = 'pending'
       AND id <> NEW.id;

    IF pending_count >= 3 THEN
        RAISE EXCEPTION 'Users may only have 3 pending requests at a time';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_enforce_pending_limit
BEFORE INSERT OR UPDATE OF status, requester_principal_id
ON requests
FOR EACH ROW
EXECUTE FUNCTION requests_enforce_pending_limit();

-- ----------------------------------------------------------------------------
-- Prevent mutating immutable request payload columns after submission
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION requests_prevent_payload_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.family <> OLD.family THEN
        RAISE EXCEPTION 'Request family is immutable';
    END IF;

    IF NEW.kind <> OLD.kind THEN
        RAISE EXCEPTION 'Request kind is immutable';
    END IF;

    IF NEW.requester_principal_id <> OLD.requester_principal_id THEN
        RAISE EXCEPTION 'Request requester is immutable';
    END IF;

    IF NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Request creation timestamp is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_prevent_payload_mutation
BEFORE UPDATE ON requests
FOR EACH ROW
EXECUTE FUNCTION requests_prevent_payload_mutation();

CREATE OR REPLACE FUNCTION inventory_requests_validate_parent_and_payload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    request_family_value request_family;
    request_kind_value   TEXT;
    item_kind_value      inventory_item_kind;
BEGIN
    SELECT family, kind
      INTO request_family_value, request_kind_value
      FROM requests
     WHERE id = NEW.request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory request parent row does not exist';
    END IF;

    IF request_family_value <> 'inventory' THEN
        RAISE EXCEPTION 'Inventory request rows require an inventory request parent';
    END IF;

    SELECT kind
      INTO item_kind_value
      FROM inventory_items
     WHERE id = NEW.inventory_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory request target does not exist';
    END IF;

    IF item_kind_value <> 'vm' THEN
        RAISE EXCEPTION 'Inventory requests currently only support VM or template targets';
    END IF;

    CASE request_kind_value
        WHEN 'inventory.vm.power' THEN
            IF NEW.power_action IS NULL OR NEW.snapshot_name IS NOT NULL THEN
                RAISE EXCEPTION 'Power requests require only a power action payload';
            END IF;
        WHEN 'inventory.vm.snapshot.create' THEN
            IF NEW.power_action IS NOT NULL OR NEW.snapshot_name IS NULL THEN
                RAISE EXCEPTION 'Snapshot create requests require only an immutable snapshot name';
            END IF;
        WHEN 'inventory.vm.snapshot.rollback' THEN
            IF NEW.power_action IS NOT NULL OR NEW.snapshot_name IS NULL THEN
                RAISE EXCEPTION 'Snapshot rollback requests require only a target snapshot name';
            END IF;
        ELSE
            RAISE EXCEPTION 'Unsupported inventory request kind: %', request_kind_value;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_requests_validate_parent_and_payload
BEFORE INSERT ON inventory_requests
FOR EACH ROW
EXECUTE FUNCTION inventory_requests_validate_parent_and_payload();

CREATE OR REPLACE FUNCTION inventory_requests_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Inventory request payloads are immutable';
    END IF;

    RAISE EXCEPTION 'Inventory request payloads are immutable';
END;
$$;

CREATE TRIGGER trg_inventory_requests_prevent_update
BEFORE UPDATE OR DELETE ON inventory_requests
FOR EACH ROW
EXECUTE FUNCTION inventory_requests_prevent_mutation();

CREATE OR REPLACE FUNCTION request_events_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Request events are append-only';
END;
$$;

CREATE TRIGGER trg_request_events_prevent_update
BEFORE UPDATE OR DELETE ON request_events
FOR EACH ROW
EXECUTE FUNCTION request_events_prevent_mutation();

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
    ),
    reserved_groups AS (
        SELECT rp.principal_id
        FROM reserved_principals rp
        WHERE rp.reserved_key = 'all-users'
    )
    SELECT p_user_principal_id
    UNION
    SELECT eg.group_id
    FROM effective_groups eg
    UNION
    SELECT rg.principal_id
    FROM reserved_groups rg;
$$;

-- ----------------------------------------------------------------------------
-- Core helper: effective permissions for management/non-inventory surfaces
--
-- Semantics:
--   - Applies grants for the current user and all transitive groups
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_effective_management_permissions(p_user_principal_id UUID)
RETURNS TABLE (permission_key TEXT)
LANGUAGE sql
STABLE
AS $$
    WITH principal_set AS (
        SELECT principal_id
        FROM get_user_effective_principals(p_user_principal_id)
    ),
    applicable_grants AS (
        SELECT
            mpg.permission_key
        FROM management_permission_grants mpg
        JOIN principal_set ps
          ON ps.principal_id = mpg.group_principal_id
    )
    SELECT
        DISTINCT applicable_grants.permission_key
    FROM applicable_grants
    ORDER BY applicable_grants.permission_key;
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
--   - Always traverses the full ancestor chain to the root
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
        WITH RECURSIVE c AS (
            SELECT
                ii.id,
                ii.parent_id,
                0::INTEGER AS depth
            FROM inventory_items ii
            WHERE ii.id = p_inventory_item_id

            UNION ALL

            SELECT
                parent.id,
                parent.parent_id,
                c.depth + 1
            FROM inventory_items parent
            JOIN c
              ON parent.id = c.parent_id
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
-- Core helper: effective permissions for a user on an inventory item, given
-- a precomputed principal set.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_effective_permissions_for_set(
    p_user_principal_id UUID,
    p_principal_ids UUID[],
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
        SELECT up.principal_id
        FROM UNNEST(p_principal_ids) AS up(principal_id)
    ),
    chain AS (
        WITH RECURSIVE c AS (
            SELECT
                ii.id,
                ii.parent_id,
                0::INTEGER AS depth
            FROM inventory_items ii
            WHERE ii.id = p_inventory_item_id

            UNION ALL

            SELECT
                parent.id,
                parent.parent_id,
                c.depth + 1
            FROM inventory_items parent
            JOIN c
              ON parent.id = c.parent_id
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
    SELECT COALESCE(string_agg(name, '/' ORDER BY depth DESC), '')
    FROM chain;
$$;

-- ----------------------------------------------------------------------------
-- Direct action audit ledger
-- Append-only log of high-risk direct VM and pod actions performed outside
-- the request workflow (power, delete, clone, snapshot, template, pod ops).
-- Actor and inventory IDs are historical references, not foreign keys: FK
-- ON DELETE actions would mutate append-only rows when targets are deleted.
-- ----------------------------------------------------------------------------
CREATE TABLE action_events (
    id                  BIGSERIAL PRIMARY KEY,
    actor_principal_id  UUID NULL,
    action_kind         TEXT NOT NULL,
    target_kind         TEXT NOT NULL,
    inventory_item_id   UUID NULL,
    pod_id              UUID NULL,
    status              TEXT NOT NULL,
    error_message       TEXT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT action_events_action_kind_not_empty
        CHECK (length(trim(action_kind)) > 0),
    CONSTRAINT action_events_target_kind_not_empty
        CHECK (length(trim(target_kind)) > 0),
    CONSTRAINT action_events_status_valid
        CHECK (status IN ('started', 'succeeded', 'failed'))
);

CREATE INDEX ix_action_events_created_at
    ON action_events (created_at DESC, id DESC);

CREATE INDEX ix_action_events_actor_created_at
    ON action_events (actor_principal_id, created_at DESC, id DESC)
    WHERE actor_principal_id IS NOT NULL;

CREATE INDEX ix_action_events_inventory_item_created_at
    ON action_events (inventory_item_id, created_at DESC, id DESC)
    WHERE inventory_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION action_events_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Action events are append-only';
END;
$$;

CREATE TRIGGER trg_action_events_prevent_update
BEFORE UPDATE OR DELETE ON action_events
FOR EACH ROW
EXECUTE FUNCTION action_events_prevent_mutation();

-- ----------------------------------------------------------------------------
-- Seed reserved system principals
-- ----------------------------------------------------------------------------
INSERT INTO principal_providers (provider_type, name)
VALUES ('system', 'System')
ON CONFLICT (provider_type) DO NOTHING;

WITH system_provider AS (
    SELECT id
    FROM principal_providers
    WHERE provider_type = 'system'
),
all_users_group AS (
    INSERT INTO principals (provider_id, principal_type, external_id, name, description)
    SELECT
        sp.id,
        'group',
        'system:all-users',
        'All Users',
        'Reserved system group automatically applied to every authenticated user.'
    FROM system_provider sp
    ON CONFLICT (provider_id, external_id)
    DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
    RETURNING id
)
INSERT INTO reserved_principals (principal_id, reserved_key)
SELECT aug.id, 'all-users'
FROM all_users_group aug
ON CONFLICT (reserved_key) DO NOTHING;

COMMIT;
