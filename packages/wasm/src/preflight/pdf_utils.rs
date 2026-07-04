use crate::preflight::matrix::Matrix;
use lopdf::content::Content;
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PdfPageBox {
    MediaBox,
    CropBox,
    BleedBox,
    TrimBox,
    ArtBox,
}

impl PdfPageBox {
    pub const fn key(self) -> &'static [u8] {
        match self {
            Self::MediaBox => b"MediaBox",
            Self::CropBox => b"CropBox",
            Self::BleedBox => b"BleedBox",
            Self::TrimBox => b"TrimBox",
            Self::ArtBox => b"ArtBox",
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::MediaBox => "MediaBox",
            Self::CropBox => "CropBox",
            Self::BleedBox => "BleedBox",
            Self::TrimBox => "TrimBox",
            Self::ArtBox => "ArtBox",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ResolvedPageBounds {
    pub left: f64,
    pub bottom: f64,
    pub width: f64,
    pub height: f64,
}

impl ResolvedPageBounds {
    pub fn right(&self) -> f64 {
        self.left + self.width
    }

    pub fn top(&self) -> f64 {
        self.bottom + self.height
    }

    pub fn center_x(&self) -> f64 {
        self.left + self.width / 2.0
    }

    pub fn center_y(&self) -> f64 {
        self.bottom + self.height / 2.0
    }
}

pub fn resolve_page_bounds(
    document: &Document,
    page_id: ObjectId,
    box_order: &[PdfPageBox],
) -> Result<(PdfPageBox, ResolvedPageBounds), String> {
    let page_object = document
        .get_object(page_id)
        .map_err(|error| format!("Failed to read page object: {error}"))?;
    let page_dict = get_dict_from_object(document, page_object)
        .ok_or_else(|| "Page object is not a dictionary".to_string())?;

    for page_box in box_order {
        if let Some(bounds) = inherited_page_array(document, &page_dict, page_box.key()) {
            let resolved = parse_page_bounds(&bounds, *page_box)?;
            return Ok((*page_box, resolved));
        }
    }

    let supported_boxes = box_order
        .iter()
        .map(|page_box| page_box.label())
        .collect::<Vec<_>>()
        .join("/");
    Err(format!("Page is missing {supported_boxes}"))
}

fn parse_page_bounds(
    bounds: &[Object],
    page_box: PdfPageBox,
) -> Result<ResolvedPageBounds, String> {
    if bounds.len() < 4 {
        return Err(format!(
            "{} does not contain four coordinates",
            page_box.label()
        ));
    }

    let x0 = as_f64(&bounds[0]).ok_or_else(|| format!("Invalid {} x0", page_box.label()))?;
    let y0 = as_f64(&bounds[1]).ok_or_else(|| format!("Invalid {} y0", page_box.label()))?;
    let x1 = as_f64(&bounds[2]).ok_or_else(|| format!("Invalid {} x1", page_box.label()))?;
    let y1 = as_f64(&bounds[3]).ok_or_else(|| format!("Invalid {} y1", page_box.label()))?;

    let left = x0.min(x1);
    let right = x0.max(x1);
    let bottom = y0.min(y1);
    let top = y0.max(y1);
    let width = right - left;
    let height = top - bottom;

    if width <= 0.0 || height <= 0.0 {
        return Err(format!(
            "{} must have non-zero width and height",
            page_box.label()
        ));
    }

    Ok(ResolvedPageBounds {
        left,
        bottom,
        width,
        height,
    })
}

pub fn as_name_string(object: &Object) -> Option<String> {
    match object {
        Object::Name(name) => Some(
            String::from_utf8_lossy(name)
                .trim_start_matches('/')
                .to_string(),
        ),
        Object::String(value, _) => Some(
            String::from_utf8_lossy(value)
                .trim_start_matches('/')
                .to_string(),
        ),
        _ => None,
    }
}

pub fn as_f64(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some((*value).into()),
        _ => None,
    }
}

pub fn as_i64(object: &Object) -> Option<i64> {
    match object {
        Object::Integer(value) => Some(*value),
        _ => None,
    }
}

pub fn deref_object(document: &Document, object: &Object) -> Option<Object> {
    match object {
        Object::Reference(object_id) => document.get_object(*object_id).ok().cloned(),
        _ => Some(object.clone()),
    }
}

pub fn get_dict_from_object(document: &Document, object: &Object) -> Option<Dictionary> {
    match deref_object(document, object)? {
        Object::Dictionary(dict) => Some(dict),
        Object::Stream(stream) => Some(stream.dict),
        _ => None,
    }
}

pub fn get_stream_from_object(document: &Document, object: &Object) -> Option<Stream> {
    match deref_object(document, object)? {
        Object::Stream(stream) => Some(stream),
        _ => None,
    }
}

pub fn page_ids(document: &Document) -> Vec<ObjectId> {
    top_level_flat_page_ids(document)
        .unwrap_or_else(|| document.get_pages().into_values().collect())
}

pub fn page_count(document: &Document) -> usize {
    catalog_page_count(document).unwrap_or_else(|| document.get_pages().len())
}

fn catalog_page_count(document: &Document) -> Option<usize> {
    let root_object = document.trailer.get(b"Root").ok()?;
    let catalog = get_dict_from_object(document, root_object)?;
    let pages_object = dict_get(&catalog, b"Pages")?;
    let pages_dict = get_dict_from_object(document, pages_object)?;
    let count = dict_get(&pages_dict, b"Count")?.as_i64().ok()?;

    usize::try_from(count).ok().filter(|count| *count > 0)
}

fn top_level_flat_page_ids(document: &Document) -> Option<Vec<ObjectId>> {
    let root_object = document.trailer.get(b"Root").ok()?;
    let catalog = get_dict_from_object(document, root_object)?;
    let pages_object = dict_get(&catalog, b"Pages")?;
    let pages_dict = get_dict_from_object(document, pages_object)?;
    let kids = dict_get(&pages_dict, b"Kids")?.as_array().ok()?;
    let count = dict_get(&pages_dict, b"Count")?.as_i64().ok()? as usize;

    if kids.len() != count {
        return None;
    }

    let mut page_ids = Vec::with_capacity(kids.len());
    for kid in kids {
        page_ids.push(kid.as_reference().ok()?);
    }

    Some(page_ids)
}

pub fn inherited_page_dict(
    document: &Document,
    page_dict: &Dictionary,
    key: &[u8],
) -> Option<Dictionary> {
    if let Some(object) = dict_get(page_dict, key) {
        return get_dict_from_object(document, object);
    }

    let mut parent = dict_get(page_dict, b"Parent").and_then(|obj| deref_object(document, obj));
    while let Some(Object::Dictionary(parent_dict)) = parent {
        if let Some(object) = dict_get(&parent_dict, key) {
            return get_dict_from_object(document, object);
        }
        parent = dict_get(&parent_dict, b"Parent").and_then(|obj| deref_object(document, obj));
    }

    None
}

pub fn inherited_page_array(
    document: &Document,
    page_dict: &Dictionary,
    key: &[u8],
) -> Option<Vec<Object>> {
    if let Some(object) = dict_get(page_dict, key) {
        return match deref_object(document, object)? {
            Object::Array(items) => Some(items),
            _ => None,
        };
    }

    let mut parent = dict_get(page_dict, b"Parent").and_then(|obj| deref_object(document, obj));
    while let Some(Object::Dictionary(parent_dict)) = parent {
        if let Some(object) = dict_get(&parent_dict, key) {
            return match deref_object(document, object)? {
                Object::Array(items) => Some(items),
                _ => None,
            };
        }
        parent = dict_get(&parent_dict, b"Parent").and_then(|obj| deref_object(document, obj));
    }

    None
}

pub fn dict_get<'a>(dict: &'a Dictionary, key: &[u8]) -> Option<&'a Object> {
    dict.get(key).ok()
}

pub fn dict_get_name_key<'a>(dict: &'a Dictionary, key: &str) -> Option<&'a Object> {
    dict.get(key.as_bytes())
        .ok()
        .or_else(|| dict.get(format!("/{key}").as_bytes()).ok())
}

pub fn is_rgb_colorspace(document: &Document, object: &Object) -> bool {
    let resolved = match deref_object(document, object) {
        Some(value) => value,
        None => return false,
    };

    match resolved {
        Object::Name(name) => name.as_slice() == b"DeviceRGB",
        Object::Array(items) => {
            if let Some(Object::Name(kind)) = items.first() {
                if kind.as_slice() == b"DeviceRGB" {
                    return true;
                }
                if kind.as_slice() == b"Indexed" {
                    if let Some(base) = items.get(1) {
                        return is_rgb_colorspace(document, base);
                    }
                }
                if kind.as_slice() == b"Separation" {
                    if let Some(alternate) = items.get(2) {
                        return is_rgb_colorspace(document, alternate);
                    }
                }
            }
            false
        }
        _ => false,
    }
}

pub fn lookup_xobject_stream_from_resources(
    document: &Document,
    resources: &Dictionary,
    label: &str,
) -> Option<Stream> {
    let xobjects =
        dict_get(resources, b"XObject").and_then(|obj| get_dict_from_object(document, obj))?;
    dict_get_name_key(&xobjects, label).and_then(|obj| get_stream_from_object(document, obj))
}

/// Validates that a page box is finite, has positive area, and (when a
/// `container` box is provided) is contained within it allowing `tolerance`
/// points of slack. Canva and similar exporters frequently emit boxes that poke
/// outside the MediaBox or are degenerate; such boxes must not be trusted to
/// crop or anchor imposed artwork.
pub fn is_box_geometrically_valid(
    bounds: &ResolvedPageBounds,
    container: Option<&ResolvedPageBounds>,
    tolerance: f64,
) -> bool {
    if ![bounds.left, bounds.bottom, bounds.width, bounds.height]
        .iter()
        .all(|value| value.is_finite())
    {
        return false;
    }
    if bounds.width <= 0.0 || bounds.height <= 0.0 {
        return false;
    }

    if let Some(container) = container {
        if bounds.left < container.left - tolerance
            || bounds.bottom < container.bottom - tolerance
            || bounds.right() > container.right() + tolerance
            || bounds.top() > container.top() + tolerance
        {
            return false;
        }
    }

    true
}

const MAX_CONTENT_FORM_RECURSION_DEPTH: usize = 8;

#[derive(Default)]
struct ContentExtent {
    min_x: Option<f64>,
    min_y: Option<f64>,
    max_x: Option<f64>,
    max_y: Option<f64>,
}

impl ContentExtent {
    fn add_point(&mut self, x: f64, y: f64) {
        if !x.is_finite() || !y.is_finite() {
            return;
        }
        self.min_x = Some(self.min_x.map_or(x, |value| value.min(x)));
        self.min_y = Some(self.min_y.map_or(y, |value| value.min(y)));
        self.max_x = Some(self.max_x.map_or(x, |value| value.max(x)));
        self.max_y = Some(self.max_y.map_or(y, |value| value.max(y)));
    }

    fn add_unit_square(&mut self, ctm: Matrix) {
        for (x, y) in [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)] {
            let (px, py) = ctm.transform(x, y);
            self.add_point(px, py);
        }
    }

    fn into_bounds(self) -> Option<ResolvedPageBounds> {
        let (min_x, min_y, max_x, max_y) = (self.min_x?, self.min_y?, self.max_x?, self.max_y?);
        let width = max_x - min_x;
        let height = max_y - min_y;
        if width <= 0.0 || height <= 0.0 {
            return None;
        }
        Some(ResolvedPageBounds {
            left: min_x,
            bottom: min_y,
            width,
            height,
        })
    }
}

fn content_matrix_from_operands(operands: &[Object]) -> Option<Matrix> {
    Some(Matrix {
        a: as_f64(operands.first()?)?,
        b: as_f64(operands.get(1)?)?,
        c: as_f64(operands.get(2)?)?,
        d: as_f64(operands.get(3)?)?,
        e: as_f64(operands.get(4)?)?,
        f: as_f64(operands.get(5)?)?,
    })
}

fn bbox_corners(object: &Object) -> Option<[(f64, f64); 4]> {
    let Object::Array(items) = object else {
        return None;
    };
    if items.len() < 4 {
        return None;
    }
    let x0 = as_f64(&items[0])?;
    let y0 = as_f64(&items[1])?;
    let x1 = as_f64(&items[2])?;
    let y1 = as_f64(&items[3])?;
    Some([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
}

fn accumulate_content_extent(
    document: &Document,
    content: &Content,
    resources: &Dictionary,
    start_ctm: Matrix,
    depth: usize,
    extent: &mut ContentExtent,
) {
    let mut ctm = start_ctm;
    let mut state_stack: Vec<Matrix> = Vec::new();

    for operation in &content.operations {
        match operation.operator.as_str() {
            "q" => state_stack.push(ctm),
            "Q" => {
                if let Some(previous) = state_stack.pop() {
                    ctm = previous;
                }
            }
            "cm" => {
                if let Some(transform) = content_matrix_from_operands(&operation.operands) {
                    ctm = ctm.multiply(transform);
                }
            }
            "Do" => {
                let Some(label) = operation.operands.first().and_then(as_name_string) else {
                    continue;
                };
                let Some(stream) =
                    lookup_xobject_stream_from_resources(document, resources, &label)
                else {
                    continue;
                };
                match dict_get(&stream.dict, b"Subtype")
                    .and_then(as_name_string)
                    .as_deref()
                {
                    Some("Image") => extent.add_unit_square(ctm),
                    Some("Form") => {
                        let form_matrix = dict_get(&stream.dict, b"Matrix")
                            .and_then(|object| deref_object(document, object))
                            .and_then(|object| match object {
                                Object::Array(items) => content_matrix_from_operands(&items),
                                _ => None,
                            })
                            .unwrap_or_else(Matrix::identity);
                        let effective_ctm = ctm.multiply(form_matrix);

                        if let Some(corners) = dict_get(&stream.dict, b"BBox")
                            .and_then(|object| deref_object(document, object))
                            .and_then(|object| bbox_corners(&object))
                        {
                            for (x, y) in corners {
                                let (px, py) = effective_ctm.transform(x, y);
                                extent.add_point(px, py);
                            }
                        } else if depth < MAX_CONTENT_FORM_RECURSION_DEPTH {
                            let form_resources = dict_get(&stream.dict, b"Resources")
                                .and_then(|object| get_dict_from_object(document, object))
                                .unwrap_or_else(|| resources.clone());
                            let form_data = stream
                                .decompressed_content()
                                .unwrap_or_else(|_| stream.content.clone());
                            if let Ok(form_content) = Content::decode(&form_data) {
                                accumulate_content_extent(
                                    document,
                                    &form_content,
                                    &form_resources,
                                    effective_ctm,
                                    depth + 1,
                                    extent,
                                );
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
}

/// Computes the bounding box of painted image and form XObjects on a page, in
/// unrotated page user space (boxes are also resolved in this space). Returns
/// `None` for pages without image/form content (e.g. vector- or text-only
/// pages) so callers can safely fall back to declared boxes. This is intended as
/// a conservative "where is the artwork actually drawn" signal, not as an exact
/// trim detector.
pub fn page_content_bounds(document: &Document, page_id: ObjectId) -> Option<ResolvedPageBounds> {
    let page_object = document.get_object(page_id).ok()?;
    let page_dict = get_dict_from_object(document, page_object)?;
    let resources = inherited_page_dict(document, &page_dict, b"Resources").unwrap_or_default();
    let content_bytes = document.get_page_content(page_id).ok()?;
    let content = Content::decode(&content_bytes).ok()?;

    let mut extent = ContentExtent::default();
    accumulate_content_extent(
        document,
        &content,
        &resources,
        Matrix::identity(),
        0,
        &mut extent,
    );
    extent.into_bounds()
}

/// Slack (points) allowed when checking that a page box is nested within the
/// MediaBox.
pub const BOX_VALIDITY_TOLERANCE_PT: f64 = 1.0;

/// How far (points) the artwork center may sit from a declared box center before
/// the box is treated as mis-positioned.
pub const SOURCE_BOX_CENTER_TOLERANCE_PT: f64 = 3.0;

/// How far (points) the artwork must spill past a declared box edge before that
/// box is treated as clipping real content.
pub const SOURCE_BOX_OVERFLOW_TOLERANCE_PT: f64 = 1.0;

/// Returns true when the declared `box_bounds` is likely mis-positioned relative
/// to the page's actual drawn content: the artwork is both significantly
/// off-center AND extends past the box on the side it is shifted toward (so the
/// box is clipping real artwork). This is the signature of the Canva
/// wrong-page-box bug. Conservative: returns false when content cannot be
/// measured, so well-formed and vector-only pages are never affected.
pub fn box_misaligned_with_content(
    document: &Document,
    page_id: ObjectId,
    box_bounds: &ResolvedPageBounds,
) -> bool {
    let Some(content) = page_content_bounds(document, page_id) else {
        return false;
    };

    let center_dx = content.center_x() - box_bounds.center_x();
    let center_dy = content.center_y() - box_bounds.center_y();
    let overflow_x = (box_bounds.left - content.left).max(content.right() - box_bounds.right());
    let overflow_y = (box_bounds.bottom - content.bottom).max(content.top() - box_bounds.top());

    let suspicious_x = center_dx.abs() > SOURCE_BOX_CENTER_TOLERANCE_PT
        && overflow_x > SOURCE_BOX_OVERFLOW_TOLERANCE_PT;
    let suspicious_y = center_dy.abs() > SOURCE_BOX_CENTER_TOLERANCE_PT
        && overflow_y > SOURCE_BOX_OVERFLOW_TOLERANCE_PT;

    suspicious_x || suspicious_y
}
