import { extname } from 'node:path';
import { ErrorCode } from 'shared';
import { AppException } from '../../common/app.exception';

// FR-F8: чорний список одиночних файлів — блокується завжди, незалежно від вмісту.
const EXTENSION_BLACKLIST = new Set(['exe', 'msi', 'bat', 'cmd', 'scr', 'js', 'vbs', 'lnk', 'ps1']);

type Rule = {
  /** Очікувані mime за сигнатурою (file-type). Відсутність — тип без надійних magic bytes. */
  mimes?: string[];
  /** true — сигнатура обов'язкова (pdf, office, зображення, архіви); false — текстові формати. */
  requiresSignature: boolean;
};

// FR-F8: whitelist типів, перевірка по magic bytes, а не по розширенню.
// docx/xlsx/xlsm — ZIP-контейнери: file-type інколи розпізнає конкретний
// OOXML-мім, інколи лише 'application/zip' — приймаємо обидва варіанти.
const WHITELIST: Record<string, Rule> = {
  pdf: { mimes: ['application/pdf'], requiresSignature: true },
  doc: { mimes: ['application/x-cfb'], requiresSignature: true },
  docx: {
    mimes: ['application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    requiresSignature: true,
  },
  xls: { mimes: ['application/x-cfb'], requiresSignature: true },
  xlsx: {
    mimes: ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    requiresSignature: true,
  },
  xlsm: {
    mimes: [
      'application/zip',
      'application/vnd.ms-excel.sheet.macroenabled.12',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    requiresSignature: true,
  },
  csv: { requiresSignature: false },
  txt: { requiresSignature: false },
  xml: { requiresSignature: false }, // звіти M.E.Doc — звичайний текстовий XML без magic bytes
  p7s: { requiresSignature: false }, // підпис: DER або base64 PEM, надійної сигнатури немає
  jpg: { mimes: ['image/jpeg'], requiresSignature: true },
  jpeg: { mimes: ['image/jpeg'], requiresSignature: true },
  png: { mimes: ['image/png'], requiresSignature: true },
  heic: { mimes: ['image/heic', 'image/heif'], requiresSignature: true },
  // SVG не в переліку FR-F8, але FR-F11 і обов'язковий чек-лист розділу 5.2
  // прямо описують його поведінку при відданні — додано за фактичною потребою.
  svg: { mimes: ['image/svg+xml'], requiresSignature: false },
  zip: { mimes: ['application/zip'], requiresSignature: true },
  rar: { mimes: ['application/x-rar-compressed', 'application/x-rar'], requiresSignature: true },
  '7z': { mimes: ['application/x-7z-compressed'], requiresSignature: true },
};

const FALLBACK_MIME: Record<string, string> = {
  csv: 'text/csv',
  txt: 'text/plain',
  xml: 'application/xml',
  p7s: 'application/pkcs7-signature',
  svg: 'image/svg+xml',
};

/**
 * NFR-19: перевірка типу по magic bytes. Чесно про межі (FR-F8): zip/rar/7z —
 * непрозорий blob, вміст архіву не аналізується; текстові формати без
 * сигнатури приймаються по розширенню — далі за них відповідає антивірус
 * робочої машини співробітника, до появи ClamAV (FR-F13, після зміни тарифу).
 */
export async function assertSafeFile(originalName: string, buffer: Buffer): Promise<{ ext: string; mime: string }> {
  const ext = extname(originalName).slice(1).toLowerCase();
  if (EXTENSION_BLACKLIST.has(ext)) {
    throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Цей тип файлу заборонено');
  }
  const rule = WHITELIST[ext];
  if (!rule) {
    throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Непідтримуваний тип файлу');
  }

  // file-type — ESM-пакет у CommonJS-проєкті (module: CommonJS), тому лише динамічний import
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    // Сигнатура визначилась — вона мусить збігатись з очікуваною для розширення.
    // Це ловить замасковані виконувані файли незалежно від того, чи розширення
    // взагалі в переліку з обов'язковою сигнатурою (наприклад, evil.exe → evil.txt).
    if (!rule.mimes?.includes(detected.mime)) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вміст файлу не відповідає його розширенню');
    }
    return { ext, mime: detected.mime };
  }

  if (rule.requiresSignature) {
    throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Не вдалося розпізнати вміст файлу');
  }
  return { ext, mime: FALLBACK_MIME[ext] ?? 'application/octet-stream' };
}
