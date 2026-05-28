-- Adiciona coluna active
ALTER TABLE sources ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Desativa as fontes com [DISABLED] no nome
UPDATE sources SET active = false WHERE name LIKE '%[DISABLED]%';

-- Opcional: limpa o [DISABLED] do nome
UPDATE sources SET name = REPLACE(name, ' [DISABLED]', '') WHERE name LIKE '%[DISABLED]%';
