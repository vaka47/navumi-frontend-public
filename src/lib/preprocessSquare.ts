export async function resizeImageToSquare(imageSrc: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const size = Math.max(img.width, img.height);
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#ffffff"; // или прозрачный фон: "rgba(0,0,0,0)"
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(
                img,
                (size - img.width) / 2,
                (size - img.height) / 2,
                img.width,
                img.height
            );
            resolve(canvas.toDataURL("image/jpeg", 1.0));
        };
        img.src = imageSrc;
    });
}
