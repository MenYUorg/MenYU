-- Búsqueda de Discovery sin distinguir acentos: "cafe" encuentra "Café" y "nandu" encuentra "Ñandú".
-- Se crea solo si falta: en Supabase la extensión puede estar ya habilitada (suele vivir en el esquema
-- `extensions`, que está en el search_path de los roles de la base, así que `unaccent()` resuelve igual).
CREATE EXTENSION IF NOT EXISTS unaccent;
