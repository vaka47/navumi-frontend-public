'use client';

import { getBrowserApiBase } from '@/lib/apiBase';

const resolveApiBase = () => getBrowserApiBase().replace(/\/+$/, '');

export async function uploadFilesToGcs(
  files: File[],
  csrfToken: string | null,
  kind: 'camp' | 'post' | 'profile' | string,
  onProgress?: (info: {
    percent: number;
    loadedBytes: number;
    totalBytes: number;
    fileIndex: number;
    fileCount: number;
  }) => void,
): Promise<string[]> {
  if (!files.length) return [];
  const API_BASE = resolveApiBase();
  const objectNames: string[] = [];
  const totalBytesRaw = files.reduce((sum, file) => sum + (file?.size || 0), 0);
  const totalBytes = totalBytesRaw > 0 ? totalBytesRaw : 1;
  let uploadedBytes = 0;

  const uploadViaXhr = (
    uploadUrl: string,
    file: File,
    contentType: string,
    onChunk?: (loadedBytes: number) => void,
  ) =>
    new Promise<void>((resolve, reject) => {
      if (typeof XMLHttpRequest === 'undefined') {
        fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: file,
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Ошибка загрузки фото в хранилище (код ${res.status}).`);
            resolve();
          })
          .catch(reject);
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (event) => {
        if (onChunk) {
          const loaded = event.lengthComputable ? event.loaded : Math.min(event.loaded, file.size || event.loaded);
          onChunk(loaded);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Ошибка загрузки фото в хранилище (код ${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Ошибка сети при загрузке фото.'));
      xhr.send(file);
    });

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const uploadMetaUrl = API_BASE.startsWith('/')
      ? `${API_BASE}/api/upload-url`
      : `${API_BASE}/api/upload-url/`;
    const metaRes = await fetch(uploadMetaUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken || '',
      },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        kind,
      }),
    });

    if (!metaRes.ok) {
      throw new Error(`Не удалось подготовить загрузку файла (код ${metaRes.status})`);
    }

    const meta = (await metaRes.json().catch(() => ({}))) as Record<string, unknown>;
    const uploadUrl = String(meta['upload_url'] || '');
    const objectName = String(meta['object_name'] || '');
    const maxSizeMb = Number(meta['max_size_mb'] ?? 25) || 25;

    if (!uploadUrl || !objectName) {
      throw new Error('Ответ сервера не содержит данных для загрузки файла');
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      throw new Error(`Файл слишком большой для загрузки (лимит ~${maxSizeMb} МБ на фото).`);
    }

    const fileIndex = index + 1;
    const contentType = file.type || 'application/octet-stream';
    await uploadViaXhr(uploadUrl, file, contentType, (loadedBytes) => {
      const totalLoaded = uploadedBytes + loadedBytes;
      const percent = Math.min(99, Math.round((totalLoaded / totalBytes) * 100));
      onProgress?.({
        percent,
        loadedBytes: totalLoaded,
        totalBytes,
        fileIndex,
        fileCount: files.length,
      });
    });
    uploadedBytes += file.size;
    onProgress?.({
      percent: Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)),
      loadedBytes: uploadedBytes,
      totalBytes,
      fileIndex,
      fileCount: files.length,
    });

    objectNames.push(objectName);
  }

  onProgress?.({
    percent: 100,
    loadedBytes: totalBytes,
    totalBytes,
    fileIndex: files.length,
    fileCount: files.length,
  });
  return objectNames;
}
