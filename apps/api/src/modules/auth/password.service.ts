import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AUTH, ErrorCode } from 'shared';
import { AppException } from '../../common/app.exception';

// NFR-14: Argon2id, m=19MiB, t=2, p=1 — параметры из OWASP-минимума.
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly weakPasswords: Set<string>;

  constructor() {
    this.weakPasswords = this.loadWeakList();
  }

  /**
   * Список утёкших паролей — локальный файл (NFR-14): наружу, в HIBP и подобные,
   * пароли и их хеши не уходят.
   */
  private loadWeakList(): Set<string> {
    const candidates = [
      join(__dirname, 'data', 'weak-passwords.txt'),
      join(process.cwd(), 'src', 'modules', 'auth', 'data', 'weak-passwords.txt'),
    ];
    for (const path of candidates) {
      try {
        const content = readFileSync(path, 'utf8');
        const set = new Set(
          content
            .split('\n')
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l && !l.startsWith('#')),
        );
        this.logger.log(`Список слабких паролів завантажено: ${set.size} записів`);
        return set;
      } catch {
        continue;
      }
    }
    this.logger.warn('Список слабких паролів не знайдено — перевірка вимкнена');
    return new Set();
  }

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON_OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Бросает AppException с украинским текстом — он показывается под полем. */
  assertStrong(plain: string): void {
    if (plain.length < AUTH.PASSWORD_MIN_LENGTH) {
      throw new AppException(
        400,
        ErrorCode.PASSWORD_TOO_WEAK,
        `Пароль має містити щонайменше ${AUTH.PASSWORD_MIN_LENGTH} символів`,
      );
    }
    if (this.weakPasswords.has(plain.toLowerCase())) {
      throw new AppException(
        400,
        ErrorCode.PASSWORD_TOO_WEAK,
        'Цей пароль є у списку скомпрометованих. Оберіть інший',
      );
    }
  }

  /** Одноразовый пароль для bootstrap и сброса: печатается в лог один раз (FR-1.6). */
  static generate(length = 16): string {
    // Без похожих символов: пароль диктуют голосом и переписывают руками
    const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[bytes[i]! % alphabet.length];
    }
    return out;
  }
}
