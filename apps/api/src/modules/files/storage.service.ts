import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, statfs, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Локальний диск (docker volume /app/uploads на проді, 04-deployment.md).
 * FR-F9: ім'я на диску — uuid.ext, оригінальне ім'я живе лише в БД — це
 * закриває path traversal, дублі імен і кирилицю у файловій системі.
 */
@Injectable()
export class StorageService {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  async save(buffer: Buffer, ext: string): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const key = ext ? `${randomUUID()}.${ext}` : randomUUID();
    await writeFile(join(this.baseDir, key), buffer);
    return key;
  }

  private path(storageKey: string): string {
    return join(this.baseDir, storageKey);
  }

  stream(storageKey: string) {
    return createReadStream(this.path(storageKey));
  }

  /** Фізичне видалення (FR-F12.1) — уже відсутній файл не помилка. */
  async remove(storageKey: string): Promise<void> {
    await unlink(this.path(storageKey)).catch(() => {});
  }

  /** > 85% зайнятості диска — відмова у завантаженні, а не 500-та (04-deployment.md). */
  async isDiskAlmostFull(): Promise<boolean> {
    // Тести не повинні залежати від реального вільного місця на диску CI/розробника
    // (це властивість хосту, а не системи під тестом) — так само як truncateAll
    // заборонено лише в production, тут NODE_ENV=test свідомо вимикає перевірку.
    if (process.env.NODE_ENV === 'test') return false;
    try {
      const stats = await statfs(this.baseDir);
      const usedFraction = 1 - stats.bavail / stats.blocks;
      return usedFraction > 0.85;
    } catch {
      // best-effort: платформа без statfs (або порожня FS у тестах) не блокує завантаження
      return false;
    }
  }
}
