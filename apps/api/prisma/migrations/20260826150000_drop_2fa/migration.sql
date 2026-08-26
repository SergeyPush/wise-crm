-- 2FA (TOTP) убрана из MVP (решение от 26.08.2026, 01-functional-requirements.md,
-- раздел 9): трение при входе и точка отказа не окупались на масштабе
-- в одного-двух админов.

DROP TABLE IF EXISTS "TotpBackupCode";

ALTER TABLE "User" DROP COLUMN IF EXISTS "totpSecret";
ALTER TABLE "User" DROP COLUMN IF EXISTS "totpEnabledAt";
