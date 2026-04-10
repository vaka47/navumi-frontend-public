export async function downscaleToSquare(
    file: File,
    size = 512,
    preferType: 'image/webp' | 'image/jpeg' = 'image/webp',
    quality = 0.82,
): Promise<File> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const el = new Image();
        el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
        el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // подложка — чтобы не было прозрачности (круглый аватар всё равно поверх)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);

    // вписываем изображение целиком (contain)
    const scale = Math.min(size / img.width, size / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const x = Math.floor((size - w) / 2);
    const y = Math.floor((size - h) / 2);
    ctx.drawImage(img, x, y, w, h);

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, preferType, quality));
    if (blob) return new File([blob], renameExt(file.name, preferType), { type: preferType });

    // fallback, если браузер не дал webp
    const blob2 = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    return new File([blob2!], renameExt(file.name, 'image/jpeg'), { type: 'image/jpeg' });

    function renameExt(name: string, mime: string) {
        const base = name.replace(/\.[^.]+$/,'');
        return mime === 'image/webp' ? `${base}.webp` : `${base}.jpg`;
    }
}


type BlobWithArrayBuffer = Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    const maybe = blob as BlobWithArrayBuffer;
    if (typeof maybe.arrayBuffer === 'function') {
        return maybe.arrayBuffer();
    }
    return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
        reader.onabort = () => reject(new Error('Blob reading aborted'));
        reader.readAsArrayBuffer(blob);
    });
}


async function readJpegOrientation(file: File): Promise<number | null> {
    try {
        const blob = file.slice(0, 128 * 1024);
        const buf = await readBlobAsArrayBuffer(blob);
        const view = new DataView(buf);

        if (view.byteLength < 4) return null;
        if (view.getUint16(0, false) !== 0xffd8) return null; // not JPEG

        let offset = 2;
        const len = view.byteLength;

        while (offset + 4 <= len) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            // APP1
            if (marker === 0xffe1) {
                const size = view.getUint16(offset, false);
                offset += 2;
                if (offset + size - 2 > len) break;

                // "Exif\0\0"
                if (
                    view.getUint32(offset, false) !== 0x45786966 || // "Exif"
                    view.getUint16(offset + 4, false) !== 0x0000
                ) {
                    offset += size - 2;
                    continue;
                }

                const tiffOffset = offset + 6;
                const endian = view.getUint16(tiffOffset, false);
                const little = endian === 0x4949;
                const firstIfdOffset = view.getUint32(tiffOffset + 4, little);
                let ifdOffset = tiffOffset + firstIfdOffset;
                if (ifdOffset + 2 > len) break;

                const entries = view.getUint16(ifdOffset, little);
                ifdOffset += 2;

                for (let i = 0; i < entries; i++) {
                    const entry = ifdOffset + i * 12;
                    if (entry + 12 > len) break;
                    const tag = view.getUint16(entry, little);
                    if (tag === 0x0112) { // Orientation
                        const val = view.getUint16(entry + 8, little);
                        return val || null;
                    }
                }
                break;
            } else if ((marker & 0xff00) === 0xff00) {
                const size = view.getUint16(offset, false);
                offset += size;
            } else {
                break;
            }
        }
        return null;
    } catch {
        return null;
    }
}


export async function fixImageOrientation(file: File): Promise<File> {
    if (!file || !file.type.startsWith('image/')) return file;

    const mime = (file.type || '').toLowerCase();
    const nameLower = (file.name || '').toLowerCase();
    const isJpeg =
      mime.includes('jpeg') ||
      mime.includes('jpg') ||
      nameLower.endsWith('.jpg') ||
      nameLower.endsWith('.jpeg');

    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const el = new Image();
            el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
            el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            el.src = url;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;

        const w = img.naturalWidth;
        const h = img.naturalHeight;

        let targetMime = mime || 'image/jpeg';

        if (isJpeg) {
            const orientation = await readJpegOrientation(file);
            if (!orientation || orientation === 1) {
                // уже нормальная ориентация — ничего не делаем
                return file;
            }

            // 5–8: портрет, меняем местами w/h
            if (orientation >= 5 && orientation <= 8) {
                canvas.width = h;
                canvas.height = w;
            } else {
                canvas.width = w;
                canvas.height = h;
            }

            switch (orientation) {
                case 2: // flip X
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                    break;
                case 3: // 180°
                    ctx.translate(canvas.width, canvas.height);
                    ctx.rotate(Math.PI);
                    break;
                case 4: // flip Y
                    ctx.translate(0, canvas.height);
                    ctx.scale(1, -1);
                    break;
                case 5: // 90° CW + flip X
                    ctx.rotate(0.5 * Math.PI);
                    ctx.translate(0, -canvas.width);
                    ctx.scale(1, -1);
                    break;
                case 6: // 90° CW
                    ctx.rotate(0.5 * Math.PI);
                    ctx.translate(0, -canvas.width);
                    break;
                case 7: // 90° CCW + flip X
                    ctx.rotate(-0.5 * Math.PI);
                    ctx.translate(-canvas.height, 0);
                    ctx.scale(1, -1);
                    break;
                case 8: // 90° CCW
                    ctx.rotate(-0.5 * Math.PI);
                    ctx.translate(-canvas.height, 0);
                    break;
                default:
                    break;
            }
        } else {
            // Не-JPEG: просто рисуем как браузер его интерпретирует,
            // чтобы сбросить любые контейнерные метаданные.
            canvas.width = w;
            canvas.height = h;

            // Ограничимся форматами, которые наверняка понимает canvas
            if (!targetMime || !/^image\/(png|jpeg|webp)$/i.test(targetMime)) {
                targetMime = 'image/jpeg';
            }
        }

        ctx.drawImage(img, 0, 0);

        const outBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, targetMime, 0.9));
        if (!outBlob) return file;

        const base = file.name.replace(/\.[^.]+$/,'') || 'avatar';
        const ext =
          targetMime === 'image/png' ? 'png'
          : targetMime === 'image/webp' ? 'webp'
          : 'jpg';
        const fixedName = `${base}_oriented.${ext}`;
        return new File([outBlob], fixedName, { type: targetMime });
    } catch {
        return file;
    }
}
