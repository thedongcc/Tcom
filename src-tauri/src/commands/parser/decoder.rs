/**
 * decoder.rs
 * 无状态解码器（多方案版）— 将一帧字节流转化为命名物理量字典。
 *
 * 变更：
 * - 越界字段现在静默跳过（continue），不再 Err 传播
 * - 签名从 Result<HashMap, String> 改为 HashMap<String, f64>（不会失败）
 * - 参数从 &ProtocolSchema 改为 &ParserScheme
 */
use std::collections::HashMap;
use super::schema::{DataType, ParserScheme};

/// 将一帧字节数据按方案解码为物理量字典（越界字段自动跳过）。
pub fn decode_frame(frame: &[u8], scheme: &ParserScheme) -> HashMap<String, f64> {
    let mut result = HashMap::new();

    for field in &scheme.fields {
        let byte_count = field.data_type.byte_size();
        let start = field.offset;
        let end = start + byte_count;

        // 越界：静默跳过，不中断整帧解码
        let Some(bytes) = frame.get(start..end) else {
            log::debug!(
                "[Decoder] 字段 '{}' 越界跳过: offset={}+{}B, 帧长={}B",
                field.name, start, byte_count, frame.len()
            );
            continue;
        };

        if let Ok(raw) = extract_value(bytes, &field.data_type) {
            result.insert(field.name.clone(), raw * field.multiplier);
        }
    }

    result
}

/// 根据 DataType 从字节切片中提取数值，转为 f64。
fn extract_value(bytes: &[u8], data_type: &DataType) -> Result<f64, ()> {
    let val = match data_type {
        DataType::U8 => {
            let arr: [u8; 1] = bytes.try_into().map_err(|_| ())?;
            u8::from_le_bytes(arr) as f64
        }
        DataType::I8 => {
            let arr: [u8; 1] = bytes.try_into().map_err(|_| ())?;
            i8::from_le_bytes(arr) as f64
        }
        DataType::U16Le => {
            let arr: [u8; 2] = bytes.try_into().map_err(|_| ())?;
            u16::from_le_bytes(arr) as f64
        }
        DataType::U16Be => {
            let arr: [u8; 2] = bytes.try_into().map_err(|_| ())?;
            u16::from_be_bytes(arr) as f64
        }
        DataType::I16Le => {
            let arr: [u8; 2] = bytes.try_into().map_err(|_| ())?;
            i16::from_le_bytes(arr) as f64
        }
        DataType::I16Be => {
            let arr: [u8; 2] = bytes.try_into().map_err(|_| ())?;
            i16::from_be_bytes(arr) as f64
        }
        DataType::U32Le => {
            let arr: [u8; 4] = bytes.try_into().map_err(|_| ())?;
            u32::from_le_bytes(arr) as f64
        }
        DataType::U32Be => {
            let arr: [u8; 4] = bytes.try_into().map_err(|_| ())?;
            u32::from_be_bytes(arr) as f64
        }
        DataType::I32Le => {
            let arr: [u8; 4] = bytes.try_into().map_err(|_| ())?;
            i32::from_le_bytes(arr) as f64
        }
        DataType::I32Be => {
            let arr: [u8; 4] = bytes.try_into().map_err(|_| ())?;
            i32::from_be_bytes(arr) as f64
        }
        DataType::F32Le => {
            let arr: [u8; 4] = bytes.try_into().map_err(|_| ())?;
            f32::from_le_bytes(arr) as f64
        }
        DataType::F32Be => {
            let arr: [u8; 4] = bytes.try_into().map_err(|_| ())?;
            f32::from_be_bytes(arr) as f64
        }
    };
    Ok(val)
}

// ─── 单元测试 ──────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::parser::schema::{DataType, FieldDef, ParserScheme};

    fn make_scheme() -> ParserScheme {
        ParserScheme {
            id: "test".into(), name: "测试方案".into(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: Some(10),
            fields: vec![
                FieldDef { name: "pitch".into(), offset: 2, data_type: DataType::I16Be, multiplier: 0.1, color: None },
                FieldDef { name: "temp".into(),  offset: 4, data_type: DataType::F32Le, multiplier: 1.0, color: None },
                FieldDef { name: "pwm".into(),   offset: 8, data_type: DataType::U16Be, multiplier: 1.0, color: None },
            ],
        }
    }

    #[test]
    fn decode_standard_frame_exact_values() {
        let scheme = make_scheme();
        let frame: &[u8] = &[0xAA, 0x55, 0x00, 0x98, 0x00, 0x00, 0x34, 0x42, 0x05, 0xDC];
        let result = decode_frame(frame, &scheme);
        assert_eq!(result.len(), 3);
        assert!((result["pitch"] - 15.2).abs() < 1e-9, "pitch={}", result["pitch"]);
        assert!((result["temp"]  - 45.0).abs() < 1e-4,  "temp={}", result["temp"]);
        assert!((result["pwm"]   - 1500.0).abs() < 1e-9, "pwm={}", result["pwm"]);
    }

    #[test]
    fn out_of_bounds_field_skipped_not_err() {
        let scheme = ParserScheme {
            id: "x".into(), name: "t".into(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: Some(10),
            fields: vec![
                FieldDef { name: "good".into(),     offset: 2, data_type: DataType::U8,    multiplier: 1.0, color: None },
                FieldDef { name: "overflow".into(), offset: 9, data_type: DataType::U16Be, multiplier: 1.0, color: None },
            ],
        };
        let frame: &[u8] = &[0xAA, 0x55, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        let result = decode_frame(frame, &scheme);
        // 只有 good 字段被解码，overflow 越界跳过
        assert!(result.contains_key("good"), "good 字段应可解码");
        assert!(!result.contains_key("overflow"), "overflow 字段应被跳过");
        assert!((result["good"] - 0x42 as f64).abs() < 1e-9);
    }

    #[test]
    fn partial_frame_decodes_what_it_can() {
        let scheme = make_scheme();
        // 只传前 6 字节（pitch+temp 头部可解，pwm 越界）
        let frame: &[u8] = &[0xAA, 0x55, 0x00, 0x98, 0x00, 0x00];
        let result = decode_frame(frame, &scheme);
        assert!(result.contains_key("pitch"));
        assert!(!result.contains_key("temp")); // F32需4字节，偏移4开始，只有2字节剩余
        assert!(!result.contains_key("pwm"));
    }

    #[test]
    fn empty_fields_returns_empty_map() {
        let scheme = ParserScheme {
            id: "x".into(), name: "t".into(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: None, fields: vec![],
        };
        let frame = [0xAA_u8, 0x55, 0x01, 0x02];
        let r = decode_frame(&frame, &scheme);
        assert!(r.is_empty());
    }

    #[test]
    fn multiplier_scales_correctly() {
        let scheme = ParserScheme {
            id: "x".into(), name: "t".into(),
            frame_header: vec![],
            min_frame_len: Some(2),
            fields: vec![FieldDef { name: "rpm".into(), offset: 0, data_type: DataType::U16Be, multiplier: 0.01, color: None }],
        };
        let frame = [0x0B_u8, 0xB8]; // 3000 × 0.01 = 30.0
        let r = decode_frame(&frame, &scheme);
        assert!((r["rpm"] - 30.0).abs() < 1e-9);
    }
}
