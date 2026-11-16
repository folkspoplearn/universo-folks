import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

/**
 * Armazenamento de arquivos (pacotes SCORM/xAPI, PDFs). Driver local por
 * enquanto; em produção trocar por S3/R2/GCS mantendo a mesma interface
 * (servir o conteúdo via CDN com URL assinada).
 */
@Injectable()
export class StorageService {
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get('STORAGE_LOCAL_PATH', './storage'));
  }

  /** Caminho absoluto seguro (impede path traversal / zip-slip). */
  safePath(...parts: string[]): string {
    const p = resolve(this.root, ...parts);
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error('Caminho inválido');
    return p;
  }

  async write(relPath: string, data: Buffer) {
    const p = this.safePath(relPath);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return p;
  }

  async removeDir(relPath: string) {
    await rm(this.safePath(relPath), { recursive: true, force: true });
  }

  join(...p: string[]) {
    return join(...p);
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
