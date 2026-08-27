import { describe, expect, it } from 'vitest';
import { assertSafeFile } from './file-type.util';

// Мінімальні валідні сигнатури — рівно стільки байт, скільки треба file-type
// для детекту; повний файл тут не потрібен (розділ 5.1 плану). PNG — справжній
// валідний 1×1 піксель: file-type перевіряє не лише перші 8 байт заголовка.
const PNG_HEADER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const PDF_HEADER = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
const EXE_HEADER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, ...Array(58).fill(0)]);

describe('assertSafeFile (FR-F8, NFR-19)', () => {
  it('приймає PNG з коректною сигнатурою', async () => {
    const res = await assertSafeFile('скан.png', PNG_HEADER);
    expect(res.mime).toBe('image/png');
  });

  it('приймає PDF з коректною сигнатурою', async () => {
    const res = await assertSafeFile('договір.pdf', PDF_HEADER);
    expect(res.mime).toBe('application/pdf');
  });

  it('приймає txt без сигнатури (звичайний текст)', async () => {
    const res = await assertSafeFile('нотатка.txt', Buffer.from('просто текст'));
    expect(res.mime).toBe('text/plain');
  });

  it('.exe відхиляється завжди — чорний список за розширенням', async () => {
    await expect(assertSafeFile('setup.exe', PNG_HEADER)).rejects.toMatchObject({ status: 400 });
  });

  it('.js відхиляється чорним списком, навіть якщо вміст — просто текст', async () => {
    await expect(assertSafeFile('script.js', Buffer.from('const a = 1;'))).rejects.toMatchObject({ status: 400 });
  });

  it('exe, перейменований у .pdf, відхиляється по сигнатурі', async () => {
    await expect(assertSafeFile('installer.pdf', EXE_HEADER)).rejects.toMatchObject({ status: 400 });
  });

  it('exe, перейменований у .txt (без обов\'язкової сигнатури для txt), теж відхиляється', async () => {
    await expect(assertSafeFile('installer.txt', EXE_HEADER)).rejects.toMatchObject({ status: 400 });
  });

  it('pdf без розпізнаваної сигнатури (порожній буфер) — відхиляється', async () => {
    await expect(assertSafeFile('порожній.pdf', Buffer.from('щось не те'))).rejects.toMatchObject({ status: 400 });
  });

  it('невідоме розширення — відхиляється', async () => {
    await expect(assertSafeFile('дані.dat', Buffer.from('щось'))).rejects.toMatchObject({ status: 400 });
  });
});
