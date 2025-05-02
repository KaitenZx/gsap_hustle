import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const imageDir = 'src/assets/full';
const outputMapFile = 'src/lqip-map.json';
const placeholderWidth = 20; // Ширина плейсхолдера в пикселях
const blurSigma = 1.5; // Степень размытия (можно подбирать)

async function findImageFiles(dir) {
	let files = [];
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				files = files.concat(await findImageFiles(fullPath));
			} else if (entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name)) {
				files.push(fullPath);
			}
		}
	} catch (err) {
		if (err.code !== 'ENOENT') {
			console.error(`Error reading directory ${dir}:`, err);
		}
		// Если директория не найдена, просто возвращаем пустой массив
	}
	return files;
}

async function generateLqip() {
	console.log(`Searching for images in ${imageDir}...`);
	const imageFiles = await findImageFiles(imageDir);
	console.log(`Found ${imageFiles.length} images.`);

	if (imageFiles.length === 0) {
		console.log('No images found, creating empty map file.');
		await fs.writeFile(outputMapFile, JSON.stringify({}, null, 2));
		return;
	}

	const lqipMap = {};

	console.log('Generating LQIP placeholders...');
	for (const filePath of imageFiles) {
		try {
			const imageBuffer = await fs.readFile(filePath);
			const placeholderBuffer = await sharp(imageBuffer)
				.resize({ width: placeholderWidth }) // Preserve aspect ratio
				.blur(blurSigma)
				.webp({ quality: 70 }) // Используем WebP для лучшего сжатия
				.toBuffer();

			const base64Placeholder = `data:image/webp;base64,${placeholderBuffer.toString('base64')}`;

			// Ключ - путь относительно src
			const relativePath = path.relative('src', filePath).replace(/\\/g, '/');
			lqipMap[`/${relativePath}`] = base64Placeholder;
			process.stdout.write('.'); // Индикатор прогресса
		} catch (error) {
			console.error(`\nFailed to process ${filePath}:`, error);
		}
	}

	await fs.writeFile(outputMapFile, JSON.stringify(lqipMap, null, 2));
	console.log(`\nLQIP map saved to ${outputMapFile}`);
}

generateLqip().catch(console.error); 