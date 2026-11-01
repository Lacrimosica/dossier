-- Languages as codes (.scratch/language-codes): "English" and "Inglese" are
-- the same `en`. A language without a code keeps its name, unique ignoring
-- case in code, not here: two rows may share a name until they're converted.
DROP INDEX "Language_name_key";

ALTER TABLE "Language" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");
