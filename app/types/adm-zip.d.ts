// Minimal type declaration for adm-zip (no @types/adm-zip installed).
// We only use a small subset: read a zip file, iterate entries, get entry data,
// and build a zip buffer.
declare module "adm-zip" {
  interface IZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(filePath?: string | Buffer);
    getEntries(): IZipEntry[];
    addFile(fileName: string, content: Buffer | string): void;
    toBuffer(): Buffer;
  }

  export = AdmZip;
}
