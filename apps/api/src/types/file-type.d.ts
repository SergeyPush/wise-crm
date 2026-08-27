// file-type — чисто ESM-пакет; при moduleResolution: Node (CommonJS-проєкт)
// TS не резолвить його package.json#exports. Мінімальна власна декларація
// замість зміни moduleResolution для всього проєкту заради одного пакета.
declare module 'file-type' {
  export function fileTypeFromBuffer(
    buffer: Buffer | Uint8Array,
  ): Promise<{ ext: string; mime: string } | undefined>;
}
