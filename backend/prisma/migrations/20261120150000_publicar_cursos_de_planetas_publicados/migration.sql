-- Só dados. Planetas PUBLICADOS sem nenhum curso publicado apareciam "Em breve" para o aluno:
-- a importação cria os cursos em rascunho e publicar o planeta não publicava os cursos.
-- Aqui, nesses planetas (e só neles), os cursos em rascunho que já têm unidades passam a publicados,
-- que é o que o MASTER pretendia ao publicar. Daqui em diante, publicar o planeta já faz isso (ContentService.updatePlanet).
UPDATE "courses" c
SET "status" = 'PUBLISHED', "updated_at" = NOW()
WHERE c."status" = 'DRAFT'
  AND EXISTS (SELECT 1 FROM "units" u WHERE u."course_id" = c."id")
  AND c."planet_id" IN (
    SELECT p."id" FROM "planets" p
    WHERE p."status" = 'PUBLISHED'
      AND NOT EXISTS (SELECT 1 FROM "courses" pc WHERE pc."planet_id" = p."id" AND pc."status" = 'PUBLISHED')
  );
