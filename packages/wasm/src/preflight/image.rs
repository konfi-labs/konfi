use crate::common::DEFAULT_IMAGE_DPI;
use crate::preflight::issue::{Issue, make_issue};
use image::{ColorType, DynamicImage, GenericImageView, ImageFormat};
use serde_json::json;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RasterColorSpace {
    DeviceGray,
    DeviceRgb,
}

#[derive(Debug, Clone)]
pub enum RasterImageEncoding {
    Raw(Vec<u8>),
    Jpeg(Vec<u8>),
}

#[derive(Debug, Clone)]
pub struct DecodedRasterImage {
    pub encoding: RasterImageEncoding,
    pub color_space: RasterColorSpace,
    pub bits_per_component: u8,
    pub width_px: u32,
    pub height_px: u32,
    pub width_points: f64,
    pub height_points: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImageColorMode {
    Cmyk,
    Rgb,
    Rgba,
    Greyscale,
    Palettenized,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
struct ParsedImageMetadata {
    width_px: u32,
    height_px: u32,
    horizontal_dpi: f64,
    vertical_dpi: f64,
    color_mode: ImageColorMode,
}

pub fn collect_image_issues_from_bytes(
    bytes: &[u8],
    content_type: &str,
) -> Result<Vec<Issue>, String> {
    let metadata = parse_image_metadata(bytes, content_type)?;
    let mut issues = Vec::new();

    match metadata.color_mode {
        ImageColorMode::Cmyk => {}
        ImageColorMode::Rgb => issues.push(make_issue(
            "RGB color detected",
            "Preflight::Rules::NoRgb",
            json!({}),
        )),
        ImageColorMode::Rgba => issues.push(make_issue(
            "RGB with alpha channel detected",
            "Preflight::Rules::NoRgb",
            json!({}),
        )),
        ImageColorMode::Greyscale => issues.push(make_issue(
            "Greyscale color detected",
            "Preflight::Rules::NoGreyscale",
            json!({}),
        )),
        ImageColorMode::Palettenized => issues.push(make_issue(
            "Palettenized color detected",
            "Preflight::Rules::NoPalettenized",
            json!({}),
        )),
        ImageColorMode::Unknown => issues.push(make_issue(
            "No color detected",
            "Preflight::Rules::NoColor",
            json!({}),
        )),
    }

    if metadata.horizontal_dpi < 300.0 || metadata.vertical_dpi < 300.0 {
        issues.push(make_issue(
            "Image with low PPI/DPI",
            "Preflight::Rules::MinPpi",
            json!({
                "horizontal_ppi": metadata.horizontal_dpi,
                "vertical_ppi": metadata.vertical_dpi,
            }),
        ));
    }

    Ok(issues)
}

pub fn decode_raster_image(
    bytes: &[u8],
    content_type: &str,
    assumed_dpi: Option<f64>,
) -> Result<DecodedRasterImage, String> {
    let dpi = assumed_dpi.unwrap_or(DEFAULT_IMAGE_DPI);
    match content_type {
        "image/jpeg" | "image/jpg" => decode_jpeg_raster(bytes, dpi),
        "image/png" => decode_dynamic_raster(bytes, Some(ImageFormat::Png), dpi),
        "image/tiff" | "image/tif" => decode_dynamic_raster(bytes, Some(ImageFormat::Tiff), dpi),
        "image/webp" => decode_dynamic_raster(bytes, Some(ImageFormat::WebP), dpi),
        other => Err(format!("Unsupported image content type: {other}")),
    }
}

pub fn decode_raster_image_as_raw(
    bytes: &[u8],
    content_type: &str,
    assumed_dpi: Option<f64>,
) -> Result<DecodedRasterImage, String> {
    let dpi = assumed_dpi.unwrap_or(DEFAULT_IMAGE_DPI);

    match content_type {
        "image/jpeg" | "image/jpg" => decode_dynamic_raster(bytes, Some(ImageFormat::Jpeg), dpi),
        _ => decode_raster_image(bytes, content_type, assumed_dpi),
    }
}

fn decode_jpeg_raster(bytes: &[u8], assumed_dpi: f64) -> Result<DecodedRasterImage, String> {
    let metadata = parse_jpeg_metadata(bytes)?;
    if metadata.color_mode == ImageColorMode::Cmyk {
        return decode_dynamic_raster(bytes, Some(ImageFormat::Jpeg), assumed_dpi);
    }

    let color_space = match metadata.color_mode {
        ImageColorMode::Greyscale => RasterColorSpace::DeviceGray,
        _ => RasterColorSpace::DeviceRgb,
    };

    Ok(DecodedRasterImage {
        encoding: RasterImageEncoding::Jpeg(bytes.to_vec()),
        color_space,
        bits_per_component: 8,
        width_px: metadata.width_px,
        height_px: metadata.height_px,
        width_points: pixels_to_points(metadata.width_px, assumed_dpi),
        height_points: pixels_to_points(metadata.height_px, assumed_dpi),
    })
}

fn decode_dynamic_raster(
    bytes: &[u8],
    format: Option<ImageFormat>,
    assumed_dpi: f64,
) -> Result<DecodedRasterImage, String> {
    let image = match format {
        Some(format) => image::load_from_memory_with_format(bytes, format),
        None => image::load_from_memory(bytes),
    }
    .map_err(|error| format!("Failed to decode image: {error}"))?;

    let (width_px, height_px) = image.dimensions();
    let color_mode = dynamic_image_color_mode(&image);

    let (encoding, color_space) = match color_mode {
        ImageColorMode::Greyscale => {
            let data = if image_has_alpha(&image) {
                composite_luma_over_white(image)
            } else {
                image.into_luma8().into_raw()
            };
            (RasterImageEncoding::Raw(data), RasterColorSpace::DeviceGray)
        }
        _ => {
            let data = if image_has_alpha(&image) {
                composite_rgba_over_white(image)
            } else {
                image.into_rgb8().into_raw()
            };
            (RasterImageEncoding::Raw(data), RasterColorSpace::DeviceRgb)
        }
    };

    Ok(DecodedRasterImage {
        encoding,
        color_space,
        bits_per_component: 8,
        width_px,
        height_px,
        width_points: pixels_to_points(width_px, assumed_dpi),
        height_points: pixels_to_points(height_px, assumed_dpi),
    })
}

fn parse_image_metadata(bytes: &[u8], content_type: &str) -> Result<ParsedImageMetadata, String> {
    match content_type {
        "image/jpeg" | "image/jpg" => parse_jpeg_metadata(bytes),
        "image/png" => parse_png_metadata(bytes),
        "image/tiff" | "image/tif" => parse_tiff_metadata(bytes),
        "image/webp" => parse_dynamic_image_metadata(bytes, ImageFormat::WebP),
        other => Err(format!("Unsupported image content type: {other}")),
    }
}

fn parse_dynamic_image_metadata(
    bytes: &[u8],
    format: ImageFormat,
) -> Result<ParsedImageMetadata, String> {
    let image = image::load_from_memory_with_format(bytes, format)
        .map_err(|error| format!("Failed to decode image: {error}"))?;
    let (width_px, height_px) = image.dimensions();

    Ok(ParsedImageMetadata {
        width_px,
        height_px,
        horizontal_dpi: 0.0,
        vertical_dpi: 0.0,
        color_mode: dynamic_image_color_mode(&image),
    })
}

fn parse_tiff_metadata(bytes: &[u8]) -> Result<ParsedImageMetadata, String> {
    let image = image::load_from_memory_with_format(bytes, ImageFormat::Tiff)
        .map_err(|error| format!("Failed to decode TIFF image: {error}"))?;
    let (width_px, height_px) = image.dimensions();
    let (horizontal_dpi, vertical_dpi) = parse_tiff_resolution(bytes).unwrap_or((0.0, 0.0));

    Ok(ParsedImageMetadata {
        width_px,
        height_px,
        horizontal_dpi,
        vertical_dpi,
        color_mode: dynamic_image_color_mode(&image),
    })
}

fn parse_tiff_resolution(bytes: &[u8]) -> Option<(f64, f64)> {
    if bytes.len() < 8 {
        return None;
    }

    let is_little_endian = match &bytes[..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };

    let read_u16 = |offset: usize| -> Option<u16> {
        if offset + 2 > bytes.len() {
            return None;
        }
        Some(if is_little_endian {
            u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
        } else {
            u16::from_be_bytes([bytes[offset], bytes[offset + 1]])
        })
    };

    let read_u32 = |offset: usize| -> Option<u32> {
        if offset + 4 > bytes.len() {
            return None;
        }
        Some(if is_little_endian {
            u32::from_le_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
            ])
        } else {
            u32::from_be_bytes([
                bytes[offset],
                bytes[offset + 1],
                bytes[offset + 2],
                bytes[offset + 3],
            ])
        })
    };

    let read_rational = |offset: usize| -> Option<f64> {
        let numerator = read_u32(offset)? as f64;
        let denominator = read_u32(offset + 4)? as f64;
        if denominator == 0.0 {
            return None;
        }
        Some(numerator / denominator)
    };

    let ifd_offset = read_u32(4)? as usize;
    let entry_count = read_u16(ifd_offset)? as usize;

    let mut resolution_unit: u16 = 2; // default: inches
    let mut x_resolution_offset: Option<usize> = None;
    let mut y_resolution_offset: Option<usize> = None;

    for i in 0..entry_count {
        let entry_start = ifd_offset + 2 + i * 12;
        if entry_start + 12 > bytes.len() {
            break;
        }
        let tag = read_u16(entry_start)?;
        match tag {
            // ResolutionUnit (tag 296)
            296 => {
                resolution_unit = read_u16(entry_start + 8)?;
            }
            // XResolution (tag 282)
            282 => {
                x_resolution_offset = Some(read_u32(entry_start + 8)? as usize);
            }
            // YResolution (tag 283)
            283 => {
                y_resolution_offset = Some(read_u32(entry_start + 8)? as usize);
            }
            _ => {}
        }
    }

    let x_res = x_resolution_offset.and_then(|off| read_rational(off))?;
    let y_res = y_resolution_offset.and_then(|off| read_rational(off))?;

    let (horizontal_dpi, vertical_dpi) = match resolution_unit {
        2 => (x_res, y_res),               // inches
        3 => (x_res * 2.54, y_res * 2.54), // centimeters → inches
        _ => return None,                  // no unit / unknown
    };

    Some((horizontal_dpi, vertical_dpi))
}

fn dynamic_image_color_mode(image: &DynamicImage) -> ImageColorMode {
    match image.color() {
        ColorType::L8 | ColorType::L16 | ColorType::La8 | ColorType::La16 => {
            ImageColorMode::Greyscale
        }
        ColorType::Rgb8 | ColorType::Rgb16 | ColorType::Rgb32F => ImageColorMode::Rgb,
        ColorType::Rgba8 | ColorType::Rgba16 | ColorType::Rgba32F => ImageColorMode::Rgba,
        _ => ImageColorMode::Unknown,
    }
}

fn image_has_alpha(image: &DynamicImage) -> bool {
    matches!(
        image.color(),
        ColorType::La8
            | ColorType::La16
            | ColorType::Rgba8
            | ColorType::Rgba16
            | ColorType::Rgba32F
    )
}

fn composite_luma_over_white(image: DynamicImage) -> Vec<u8> {
    image
        .into_luma_alpha8()
        .pixels()
        .map(|pixel| composite_channel_over_white(pixel.0[0], pixel.0[1]))
        .collect()
}

fn composite_rgba_over_white(image: DynamicImage) -> Vec<u8> {
    image
        .into_rgba8()
        .pixels()
        .flat_map(|pixel| {
            let [red, green, blue, alpha] = pixel.0;
            [
                composite_channel_over_white(red, alpha),
                composite_channel_over_white(green, alpha),
                composite_channel_over_white(blue, alpha),
            ]
        })
        .collect()
}

fn composite_channel_over_white(channel: u8, alpha: u8) -> u8 {
    let alpha = alpha as u16;
    (((channel as u16 * alpha) + (255 * (255 - alpha)) + 127) / 255) as u8
}

fn pixels_to_points(pixels: u32, dpi: f64) -> f64 {
    pixels as f64 * 72.0 / dpi
}

fn parse_png_metadata(bytes: &[u8]) -> Result<ParsedImageMetadata, String> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 8 || &bytes[..8] != PNG_SIGNATURE {
        return Err("Invalid PNG signature".to_string());
    }

    let mut width_px = 0_u32;
    let mut height_px = 0_u32;
    let mut horizontal_dpi = 0.0;
    let mut vertical_dpi = 0.0;
    let mut color_mode = ImageColorMode::Unknown;
    let mut offset = 8_usize;

    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ]) as usize;
        let chunk_type = &bytes[offset + 4..offset + 8];
        let data_start = offset + 8;
        let data_end = data_start + length;
        let crc_end = data_end + 4;

        if crc_end > bytes.len() {
            break;
        }

        let chunk_data = &bytes[data_start..data_end];
        match chunk_type {
            b"IHDR" if chunk_data.len() >= 13 => {
                width_px = u32::from_be_bytes([
                    chunk_data[0],
                    chunk_data[1],
                    chunk_data[2],
                    chunk_data[3],
                ]);
                height_px = u32::from_be_bytes([
                    chunk_data[4],
                    chunk_data[5],
                    chunk_data[6],
                    chunk_data[7],
                ]);
                color_mode = match chunk_data[9] {
                    0 | 4 => ImageColorMode::Greyscale,
                    2 | 6 => ImageColorMode::Rgb,
                    3 => ImageColorMode::Palettenized,
                    _ => ImageColorMode::Unknown,
                };
            }
            b"pHYs" if chunk_data.len() >= 9 => {
                let x_ppu = u32::from_be_bytes([
                    chunk_data[0],
                    chunk_data[1],
                    chunk_data[2],
                    chunk_data[3],
                ]);
                let y_ppu = u32::from_be_bytes([
                    chunk_data[4],
                    chunk_data[5],
                    chunk_data[6],
                    chunk_data[7],
                ]);
                let unit = chunk_data[8];
                if unit == 1 {
                    horizontal_dpi = x_ppu as f64 * 0.0254;
                    vertical_dpi = y_ppu as f64 * 0.0254;
                }
            }
            b"IEND" => break,
            _ => {}
        }

        offset = crc_end;
    }

    if width_px == 0 || height_px == 0 {
        return Err("PNG metadata is missing image dimensions".to_string());
    }

    Ok(ParsedImageMetadata {
        width_px,
        height_px,
        horizontal_dpi,
        vertical_dpi,
        color_mode,
    })
}

fn parse_jpeg_metadata(bytes: &[u8]) -> Result<ParsedImageMetadata, String> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return Err("Invalid JPEG signature".to_string());
    }

    let mut width_px = 0_u32;
    let mut height_px = 0_u32;
    let mut horizontal_dpi = 0.0;
    let mut vertical_dpi = 0.0;
    let mut color_mode = ImageColorMode::Unknown;
    let mut offset = 2_usize;

    while offset + 3 < bytes.len() {
        if bytes[offset] != 0xFF {
            offset += 1;
            continue;
        }

        while offset < bytes.len() && bytes[offset] == 0xFF {
            offset += 1;
        }
        if offset >= bytes.len() {
            break;
        }

        let marker = bytes[offset];
        offset += 1;

        if marker == 0xD9 || marker == 0xDA {
            break;
        }
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            continue;
        }
        if offset + 1 >= bytes.len() {
            break;
        }

        let segment_length = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        if segment_length < 2 || offset + segment_length > bytes.len() {
            break;
        }

        let data_start = offset + 2;
        let data_end = offset + segment_length;
        let segment = &bytes[data_start..data_end];

        if marker == 0xE0 && segment.len() >= 12 && &segment[..5] == b"JFIF\0" {
            let unit = segment[7];
            let x_density = u16::from_be_bytes([segment[8], segment[9]]) as f64;
            let y_density = u16::from_be_bytes([segment[10], segment[11]]) as f64;
            match unit {
                1 => {
                    horizontal_dpi = x_density;
                    vertical_dpi = y_density;
                }
                2 => {
                    horizontal_dpi = x_density * 2.54;
                    vertical_dpi = y_density * 2.54;
                }
                _ => {}
            }
        }

        let is_sof_marker = matches!(
            marker,
            0xC0 | 0xC1
                | 0xC2
                | 0xC3
                | 0xC5
                | 0xC6
                | 0xC7
                | 0xC9
                | 0xCA
                | 0xCB
                | 0xCD
                | 0xCE
                | 0xCF
        );
        if is_sof_marker && segment.len() >= 6 {
            height_px = u16::from_be_bytes([segment[1], segment[2]]) as u32;
            width_px = u16::from_be_bytes([segment[3], segment[4]]) as u32;
            color_mode = match segment[5] {
                1 => ImageColorMode::Greyscale,
                3 => ImageColorMode::Rgb,
                4 => ImageColorMode::Cmyk,
                _ => ImageColorMode::Unknown,
            };
        }

        offset = data_end;
    }

    if width_px == 0 || height_px == 0 {
        return Err("JPEG metadata is missing image dimensions".to_string());
    }

    Ok(ParsedImageMetadata {
        width_px,
        height_px,
        horizontal_dpi,
        vertical_dpi,
        color_mode,
    })
}
