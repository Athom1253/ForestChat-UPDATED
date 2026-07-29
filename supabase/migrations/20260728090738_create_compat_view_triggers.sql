-- Create INSTEAD OF triggers for views that need INSERT/UPDATE/DELETE support

-- profiles view: INSERT -> app_users, UPDATE -> app_users
CREATE OR REPLACE FUNCTION profiles_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO app_users (id, username, display_name, bio, avatar_url, banner_url, status_message, status, is_admin)
  VALUES (NEW.id, NEW.username, NEW.display_name, NEW.bio, NEW.avatar_url, NEW.banner_url, NEW.status_message, NEW.status, NEW.is_admin);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER profiles_instead_insert INSTEAD OF INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION profiles_insert_fn();

CREATE OR REPLACE FUNCTION profiles_update_fn() RETURNS trigger AS $$
BEGIN
  UPDATE app_users SET
    username = NEW.username,
    display_name = NEW.display_name,
    bio = NEW.bio,
    avatar_url = NEW.avatar_url,
    banner_url = NEW.banner_url,
    status_message = NEW.status_message,
    status = NEW.status,
    is_admin = NEW.is_admin,
    last_seen = NEW.updated_at
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER profiles_instead_update INSTEAD OF UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION profiles_update_fn();

-- channels view: INSERT -> chats, UPDATE -> chats
CREATE OR REPLACE FUNCTION channels_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO chats (id, type, name, description, avatar_url, created_by, invite_code)
  VALUES (
    NEW.id,
    NEW.type,
    NEW.name,
    NEW.description,
    NEW.icon_url,
    COALESCE(NEW.owner_id, auth.uid()),
    NEW.invite_code
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER channels_instead_insert INSTEAD OF INSERT ON channels
FOR EACH ROW EXECUTE FUNCTION channels_insert_fn();

CREATE OR REPLACE FUNCTION channels_update_fn() RETURNS trigger AS $$
BEGIN
  UPDATE chats SET
    name = NEW.name,
    description = NEW.description,
    avatar_url = NEW.icon_url,
    invite_code = NEW.invite_code
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER channels_instead_update INSTEAD OF UPDATE ON channels
FOR EACH ROW EXECUTE FUNCTION channels_update_fn();

-- channel_members view: INSERT -> chat_memberships, UPDATE -> chat_memberships
CREATE OR REPLACE FUNCTION channel_members_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO chat_memberships (chat_id, user_id, role, is_pinned, is_archived, is_muted)
  VALUES (NEW.channel_id, NEW.user_id, NEW.role, NEW.is_pinned, NEW.is_archived, NEW.muted);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER channel_members_instead_insert INSTEAD OF INSERT ON channel_members
FOR EACH ROW EXECUTE FUNCTION channel_members_insert_fn();

CREATE OR REPLACE FUNCTION channel_members_update_fn() RETURNS trigger AS $$
BEGIN
  UPDATE chat_memberships SET
    is_pinned = NEW.is_pinned,
    is_archived = NEW.is_archived,
    is_muted = NEW.muted
  WHERE chat_id = NEW.channel_id AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER channel_members_instead_update INSTEAD OF UPDATE ON channel_members
FOR EACH ROW EXECUTE FUNCTION channel_members_update_fn();

-- pets view: INSERT -> user_pets, UPDATE -> user_pets
CREATE OR REPLACE FUNCTION pets_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO user_pets (user_id, name, species, color_variant, level, xp, happiness, energy, hunger)
  VALUES (NEW.owner_id, NEW.name, NEW.species, NEW.color, NEW.level, NEW.xp, NEW.happiness, NEW.energy, NEW.hunger);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER pets_instead_insert INSTEAD OF INSERT ON pets
FOR EACH ROW EXECUTE FUNCTION pets_insert_fn();

CREATE OR REPLACE FUNCTION pets_update_fn() RETURNS trigger AS $$
BEGIN
  UPDATE user_pets SET
    name = NEW.name,
    species = NEW.species,
    color_variant = NEW.color,
    level = NEW.level,
    xp = NEW.xp,
    happiness = NEW.happiness,
    energy = NEW.energy,
    hunger = NEW.hunger,
    last_fed_at = NEW.last_fed,
    last_played_at = NEW.last_played,
    updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER pets_instead_update INSTEAD OF UPDATE ON pets
FOR EACH ROW EXECUTE FUNCTION pets_update_fn();

-- reactions view: INSERT -> message_reactions
CREATE OR REPLACE FUNCTION reactions_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO message_reactions (message_id, user_id, emoji)
  VALUES (NEW.message_id, NEW.user_id, NEW.emoji);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER reactions_instead_insert INSTEAD OF INSERT ON reactions
FOR EACH ROW EXECUTE FUNCTION reactions_insert_fn();

-- master_invites view: INSERT -> invite_codes, UPDATE -> invite_codes
CREATE OR REPLACE FUNCTION master_invites_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO invite_codes (code, note, max_uses, is_active, expires_at, created_by, is_master)
  VALUES (NEW.code, NEW.label, NEW.max_uses, NEW.is_active, NEW.expires_at, NEW.created_by, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER master_invites_instead_insert INSTEAD OF INSERT ON master_invites
FOR EACH ROW EXECUTE FUNCTION master_invites_insert_fn();

CREATE OR REPLACE FUNCTION master_invites_update_fn() RETURNS trigger AS $$
BEGIN
  UPDATE invite_codes SET
    is_active = NEW.is_active,
    note = NEW.label,
    max_uses = NEW.max_uses
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER master_invites_instead_update INSTEAD OF UPDATE ON master_invites
FOR EACH ROW EXECUTE FUNCTION master_invites_update_fn();

-- message_reads view: upsert -> read_receipts
CREATE OR REPLACE FUNCTION message_reads_insert_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO read_receipts (chat_id, user_id, last_read_message_id, last_read_at)
  VALUES (NEW.channel_id, NEW.user_id, NEW.last_read_message_id, NEW.last_read_at)
  ON CONFLICT (chat_id, user_id) DO UPDATE SET
    last_read_message_id = NEW.last_read_message_id,
    last_read_at = NEW.last_read_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER message_reads_instead_insert INSTEAD OF INSERT ON message_reads
FOR EACH ROW EXECUTE FUNCTION message_reads_insert_fn();

-- user_settings view: UPDATE -> app_users.animation_prefs
CREATE OR REPLACE FUNCTION user_settings_update_fn() RETURNS trigger AS $$
BEGIN
  UPDATE app_users SET
    animation_prefs = NEW.custom_data,
    last_seen = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER user_settings_instead_update INSTEAD OF UPDATE ON user_settings
FOR EACH ROW EXECUTE FUNCTION user_settings_update_fn();
