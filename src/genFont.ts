/*
 * Copyright 2023 Comcast Cable Communications Management, LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url'
import generateBMFont from 'msdf-bmfont-xml';

let fontSrcDir: string = '';
let fontDstDir: string = '';
let dataUriDstDir: string = '';
let overridesPath = '';
let charsetPath = '';

interface PresetsData {
  [key: string]: string | undefined
}

let presets: PresetsData

/**
 * Set the paths for the font source and destination directories.
 *
 * @param srcDir
 * @param dstDir
 * @param charsetFilePath
 * @param dataUriDir - Optional directory for data URI TypeScript files
 */
export function setGeneratePaths(srcDir: string, dstDir: string, charsetFilePath?: string, dataUriDir?: string) {
  fontSrcDir = srcDir;
  fontDstDir = dstDir;
  dataUriDstDir = dataUriDir || path.join(dstDir, 'data-uri');
  overridesPath = path.join(fontSrcDir, 'overrides.json');
  charsetPath = charsetFilePath ? charsetFilePath : path.join(fontSrcDir, 'charset.config.json');
  presets = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'presets.json'), 'utf8'))
}

export interface SdfFontInfo {
  fontName: string;
  fieldType: 'ssdf' | 'msdf';
  fontPath: string;
  jsonPath: string;
  pngPath: string;
  dstDir: string;
}

type FontOptions = {
  fieldType: string;
  outputType: 'json';
  roundDecimal: number;
  smartSize: boolean;
  pot: boolean;
  fontSize: number;
  distanceRange: number;
  charset?: string;
}

interface CharsetConfig {
  charset: string,
  presets: string[]
}

/**
 * Generates a font file in the specified field type.
 * @param fontFileName - The name of the font.
 * @param fieldType - The type of the font field (msdf or ssdf).
 * @returns {Promise<void>} - A promise that resolves when the font generation is complete.
 */
export async function genFont(fontFileName: string, fieldType: 'msdf'): Promise<SdfFontInfo | null> {
  console.log(chalk.blue(`Generating ${fieldType} font from ${chalk.bold(fontFileName)}...`));
  if (fieldType !== 'msdf') {
    console.log(`Invalid field type ${fieldType}`);
    return null
  }
  const fontPath = path.join(fontSrcDir, fontFileName);
  if (!fs.existsSync(fontPath)) {
    console.log(`Font ${fontFileName} does not exist`);
    return null
  }

  let bmfont_field_type: string = fieldType;

  const fontNameNoExt = fontFileName.split('.')[0]!;
  const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
  const font_size = overrides[fontNameNoExt]?.[fieldType]?.fontSize || 42;
  const distance_range =
    overrides[fontNameNoExt]?.[fieldType]?.distanceRange || 4;

  let options: FontOptions = {
    fieldType: bmfont_field_type,
    outputType: 'json',
    roundDecimal: 6,
    smartSize: true,
    pot: true,
    fontSize: font_size,
    distanceRange: distance_range,
  }

  if (fs.existsSync(charsetPath)) {
    const config: CharsetConfig = JSON.parse(fs.readFileSync(charsetPath, 'utf8'))
    let charset = config.charset
    const presetsToApply = config.presets ? config.presets : []
    for (let i = 0; i < presetsToApply.length; i++) {
      const key = presetsToApply[i]
      if (key && key in presets) {
        charset += presets[key]
      } else {
        console.warn(`preset, '${key}' is not available in msdf-generator presets`)
      }
    }
    options['charset'] = charset
  }

  await generateFont(fontPath, fontDstDir, fontNameNoExt, fieldType, options)

  const info: SdfFontInfo = {
    fontName: fontNameNoExt,
    fieldType,
    jsonPath: path.join(fontDstDir, `${fontNameNoExt}.${fieldType}.json`),
    pngPath: path.join(fontDstDir, `${fontNameNoExt}.${fieldType}.png`),
    fontPath,
    dstDir: fontDstDir,
  };

  return info;
}

const generateFont = (fontSrcPath: string, fontDestPath: string, fontName: string, fieldType: string, options: FontOptions): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(fontDestPath)) {
      fs.mkdirSync(fontDestPath, { recursive: true })
    }
    generateBMFont(
      fontSrcPath,
      options,
      (err, textures, font) => {
        if (err) {
          console.error(err)
          reject(err)
        } else {
          textures.forEach((texture: any) => {
            try {
              fs.writeFileSync(path.resolve(fontDestPath, `${fontName}.${fieldType}.png`), texture.texture)
            } catch (e) {
              console.error(e)
              reject(e)
            }
          })
          try {
            fs.writeFileSync(path.resolve(fontDestPath, `${fontName}.${fieldType}.json`), font.data)
            resolve()
          } catch (e) {
            console.error(err)
            reject(e)
          }
        }
      }
    )
  })
}

/**
 * Convert filename to camelCase export name
 */
function toCamelCase(str: string, suffix: string): string {
  return str
    .replace(/\./g, '-')
    .split('-')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('') + suffix;
}

/**
 * Generate data URI from PNG file
 */
function pngToDataUri(pngPath: string): string {
  const pngBuffer = fs.readFileSync(pngPath);
  const base64 = pngBuffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

/**
 * Generate data URI from JSON file
 */
function jsonToDataUri(jsonPath: string): string {
  const jsonContent = fs.readFileSync(jsonPath, 'utf8');
  const jsonData = JSON.parse(jsonContent);
  const jsonString = JSON.stringify(jsonData);
  const base64 = Buffer.from(jsonString).toString('base64');
  return `data:application/json;base64,${base64}`;
}

/**
 * Extract data URI from a TypeScript export file
 */
function extractDataUri(tsContent: string): string | null {
  const match = tsContent.match(/= '(data:[^']+)'/);
  return match && match[1] ? match[1] : null;
}

export interface DataUriResult {
  jsonTsPath: string;
  pngTsPath: string;
}

/**
 * Generate data URI TypeScript files from the font files.
 * 
 * @param fontInfo - Font info from genFont()
 * @returns Paths to generated TypeScript files
 */
export async function generateDataUriFiles(fontInfo: SdfFontInfo): Promise<DataUriResult> {
  console.log(chalk.cyan(`Generating data URI files for ${chalk.bold(fontInfo.fontName)}...`));

  await fs.ensureDir(dataUriDstDir);

  const baseName = `${fontInfo.fontName}.${fontInfo.fieldType}`;
  const jsonTsFileName = `${baseName}.ts`;
  const pngTsFileName = `${baseName}.png.ts`;
  const jsonExportName = toCamelCase(baseName, '');
  const pngExportName = toCamelCase(baseName, 'Png');

  const jsonTsPath = path.join(dataUriDstDir, jsonTsFileName);
  const pngTsPath = path.join(dataUriDstDir, pngTsFileName);

  // Generate JSON data URI TypeScript file
  const jsonDataUri = jsonToDataUri(fontInfo.jsonPath);
  const jsonTsContent = `export const ${jsonExportName} = '${jsonDataUri}';\n`;
  await fs.writeFile(jsonTsPath, jsonTsContent);
  console.log(chalk.green(`  ✅ ${jsonTsFileName}`));

  // Generate PNG data URI TypeScript file
  const pngDataUri = pngToDataUri(fontInfo.pngPath);
  const pngTsContent = `export const ${pngExportName} = '${pngDataUri}';\n`;
  await fs.writeFile(pngTsPath, pngTsContent);
  console.log(chalk.green(`  ✅ ${pngTsFileName}`));

  return { jsonTsPath, pngTsPath };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that generated data URI files match the original source files.
 * 
 * @param fontInfo - Font info from genFont()
 * @param dataUriResult - Paths from generateDataUriFiles()
 * @returns Validation result
 */
export async function validateDataUris(fontInfo: SdfFontInfo, dataUriResult: DataUriResult): Promise<ValidationResult> {
  console.log(chalk.yellow(`Validating data URIs for ${chalk.bold(fontInfo.fontName)}...`));

  const errors: string[] = [];

  // Validate JSON data URI
  try {
    const expectedJsonDataUri = jsonToDataUri(fontInfo.jsonPath);
    const jsonTsContent = await fs.readFile(dataUriResult.jsonTsPath, 'utf8');
    const actualJsonDataUri = extractDataUri(jsonTsContent);

    if (!actualJsonDataUri) {
      errors.push(`Could not extract data URI from ${path.basename(dataUriResult.jsonTsPath)}`);
    } else if (expectedJsonDataUri !== actualJsonDataUri) {
      // Deep compare JSON content
      const expectedBase64 = expectedJsonDataUri.split(',')[1]!;
      const actualBase64 = actualJsonDataUri.split(',')[1]!;
      const expectedJson = JSON.parse(Buffer.from(expectedBase64, 'base64').toString('utf8'));
      const actualJson = JSON.parse(Buffer.from(actualBase64, 'base64').toString('utf8'));

      if (JSON.stringify(expectedJson) !== JSON.stringify(actualJson)) {
        errors.push(`JSON content mismatch in ${path.basename(dataUriResult.jsonTsPath)}`);
      }
    }

    if (errors.length === 0) {
      console.log(chalk.green(`  ✅ ${path.basename(dataUriResult.jsonTsPath)}: OK`));
    }
  } catch (err) {
    errors.push(`Error validating JSON data URI: ${(err as Error).message}`);
  }

  // Validate PNG data URI
  try {
    const expectedPngDataUri = pngToDataUri(fontInfo.pngPath);
    const pngTsContent = await fs.readFile(dataUriResult.pngTsPath, 'utf8');
    const actualPngDataUri = extractDataUri(pngTsContent);

    if (!actualPngDataUri) {
      errors.push(`Could not extract data URI from ${path.basename(dataUriResult.pngTsPath)}`);
    } else if (expectedPngDataUri !== actualPngDataUri) {
      // Compare binary content via base64 strings (already normalized)
      const expectedBase64 = expectedPngDataUri.split(',')[1]!;
      const actualBase64 = actualPngDataUri.split(',')[1]!;

      if (expectedBase64 !== actualBase64) {
        const expectedLen = Buffer.from(expectedBase64, 'base64').length;
        const actualLen = Buffer.from(actualBase64, 'base64').length;
        errors.push(`PNG binary content mismatch in ${path.basename(dataUriResult.pngTsPath)} (expected ${expectedLen} bytes, got ${actualLen} bytes)`);
      }
    }

    if (errors.filter(e => e.includes('PNG')).length === 0) {
      console.log(chalk.green(`  ✅ ${path.basename(dataUriResult.pngTsPath)}: OK`));
    }
  } catch (err) {
    errors.push(`Error validating PNG data URI: ${(err as Error).message}`);
  }

  if (errors.length > 0) {
    errors.forEach(e => console.log(chalk.red(`  ❌ ${e}`)));
  }

  return { valid: errors.length === 0, errors };
}
