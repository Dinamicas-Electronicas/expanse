/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import sharp from 'sharp';
import path from 'path';

/**
 * Remove yellow background from PNG and make it transparent using sharp
 * @param pngBuffer - PNG buffer with yellow background
 * @returns PNG buffer with transparent background
 */
async function removeYellowBackground(pngBuffer: Buffer): Promise<Buffer> {
    // Convert PNG to raw RGBA data for pixel manipulation
    const { data, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Process pixels to remove yellow and make transparent
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is close to yellow (#FFFF00)
        // Yellow is R=255, G=255, B=0 with tolerance
        if (
            r > 240 &&
            g > 240 &&
            b < 15
        ) {
            // Make it fully transparent
            data[i + 3] = 0;
        }
    }

    // Convert back to PNG
    let result = await sharp(data, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4,
        },
    }).png().toBuffer();

    // Add watermark in top right corner
    try {
        const watermarkPath = path.join(process.cwd(), 'assets', 'watermark.png');

        // Resize watermark to small size (100px wide)
        const watermarkBuffer = await sharp(watermarkPath)
            .resize(300, 300, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .toBuffer();

        // Get the dimensions of the main image
        const metadata = await sharp(result).metadata();
        const imgWidth = metadata.width || 0;

        // Position: top-right with 10px padding
        const watermarkX = imgWidth - 300 - 10;
        const watermarkY = 10;

        // Composite the watermark onto the main image
        result = await sharp(result)
            .composite([
                {
                    input: watermarkBuffer,
                    left: watermarkX,
                    top: watermarkY,
                    blend: 'over',
                },
            ])
            .png()
            .toBuffer();
    } catch (error) {
        console.warn('Failed to add watermark:', error);
        // Continue without watermark if it fails
    }

    return result;
}

/**
 * Save an exported image from the client
 * @param composeId - The ID of the compose
 * @param imageBase64 - The base64 string of the image (PNG)
 * @returns PNG image as buffer after processing
 */
export async function processAndSaveClientExport(
    composeId: string,
    imageBase64: string
): Promise<Buffer> {
    // Remove the data:image/png;base64, prefix if it exists
    const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
    let buffer = Buffer.from(base64Data, 'base64');

    // Remove yellow background and make it transparent (if needed, 
    // though the client might already handle transparency)
    buffer = await removeYellowBackground(buffer) as any;

    return buffer;
}
