/**
 * framer.rs
 * 流式切帧器（多方案版）— 解决串口"粘包"和"半包"问题。
 */
use super::schema::ParserScheme;

/// 流式切帧器
pub struct Framer {
    buffer: Vec<u8>,
}

impl Framer {
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// 将串口最新数据追加进缓冲区
    pub fn append(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
    }

    /// 从缓冲区提取所有完整帧。
    ///
    /// 切帧策略：
    /// 1. 找帧头起始位置，丢弃帧头前脏数据
    /// 2. 等待缓冲区累积到 `min_frame_len` 字节
    /// 3. 切出完整帧并做帧头二次校验（双重保险）
    /// 4. 循环直到缓冲区字节不足
    pub fn extract_frames(&mut self, scheme: &ParserScheme) -> Vec<Vec<u8>> {
        let mut frames = Vec::new();
        let header = &scheme.frame_header;
        let frame_len = scheme.min_frame_len.unwrap_or(10);

        if header.is_empty() || frame_len == 0 {
            return frames;
        }

        // 防护：如果缓冲区已累积到帧长 16 倍以上却始终找不到帧头，
        // 说明该方案与当前数据流完全不匹配，直接清空以防内存无限堆积。
        let max_buffer = frame_len * 16;

        loop {
            // 缓冲区超大保护
            if self.buffer.len() > max_buffer {
                let retain = header.len().saturating_sub(1);
                let drain_end = self.buffer.len().saturating_sub(retain);
                self.buffer.drain(..drain_end);
            }

            let Some(header_pos) = find_subsequence(&self.buffer, header) else {
                // 未找到帧头：保留尾部 (header.len()-1) 字节防止跨 append 拆帧
                let retain = header.len().saturating_sub(1);
                let drain_end = self.buffer.len().saturating_sub(retain);
                self.buffer.drain(..drain_end);
                break;
            };

            // 丢弃帧头前的脏数据
            if header_pos > 0 {
                self.buffer.drain(..header_pos);
            }

            // 等待足够字节
            if self.buffer.len() < frame_len {
                break;
            }

            // 切出完整帧，并做最终帧头校验（双重保险）
            if let Some(frame_bytes) = self.buffer.get(..frame_len) {
                if frame_bytes.starts_with(header) {
                    frames.push(frame_bytes.to_vec());
                } else {
                    // 帧头字节意外不符（缓冲状态异常），跳过 1 字节重新搜索
                    self.buffer.drain(..1);
                    continue;
                }
            }

            self.buffer.drain(..frame_len);
        }

        frames
    }

    #[allow(dead_code)]
    pub fn buffer_len(&self) -> usize { self.buffer.len() }

    #[allow(dead_code)]
    pub fn clear(&mut self) { self.buffer.clear() }
}

impl Default for Framer {
    fn default() -> Self { Self::new() }
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() { return None; }
    haystack.windows(needle.len()).position(|w| w == needle)
}

// ─── 单元测试 ──────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::parser::schema::{DataType, FieldDef, ParserScheme};

    fn make_scheme() -> ParserScheme {
        ParserScheme {
            id: "test".into(), name: "测试".into(),
            frame_header: vec![0xAA, 0x55],
            min_frame_len: Some(10),
            fields: vec![
                FieldDef { name: "pitch".into(), offset: 2, data_type: DataType::I16Be, multiplier: 0.1, color: None },
                FieldDef { name: "temp".into(),  offset: 4, data_type: DataType::F32Le, multiplier: 1.0, color: None },
                FieldDef { name: "pwm".into(),   offset: 8, data_type: DataType::U16Be, multiplier: 1.0, color: None },
            ],
        }
    }

    fn make_frame() -> Vec<u8> {
        vec![0xAA, 0x55, 0x00, 0x98, 0x00, 0x00, 0x34, 0x42, 0x05, 0xDC]
    }

    #[test]
    fn complete_frame_in_one_append() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        framer.append(&make_frame());
        let frames = framer.extract_frames(&scheme);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], make_frame());
    }

    #[test]
    fn frame_split_into_three_chunks() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        let frame = make_frame();
        framer.append(&frame[..3]);
        assert!(framer.extract_frames(&scheme).is_empty());
        framer.append(&frame[3..8]);
        assert!(framer.extract_frames(&scheme).is_empty());
        framer.append(&frame[8..]);
        let frames = framer.extract_frames(&scheme);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], frame);
    }

    #[test]
    fn two_frames_back_to_back() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        let mut data = make_frame();
        data.extend(make_frame());
        framer.append(&data);
        let frames = framer.extract_frames(&scheme);
        assert_eq!(frames.len(), 2);
    }

    #[test]
    fn dirty_bytes_before_frame_header() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        let mut data = vec![0x01, 0xFF, 0xBE, 0xEF, 0x00];
        data.extend(make_frame());
        framer.append(&data);
        let frames = framer.extract_frames(&scheme);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], make_frame());
    }

    #[test]
    fn header_spanning_two_appends() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        let frame = make_frame();
        framer.append(&[0xAA]);
        assert!(framer.extract_frames(&scheme).is_empty());
        assert_eq!(framer.buffer_len(), 1);
        framer.append(&frame[1..]);
        let frames = framer.extract_frames(&scheme);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], frame);
    }

    #[test]
    fn min_frame_len_none_defaults_to_10() {
        let scheme = ParserScheme {
            id: "x".into(), name: "t".into(),
            frame_header: vec![0xAA],
            min_frame_len: None,
            fields: vec![],
        };
        let mut framer = Framer::new();
        framer.append(&[0xAA, 0x42]);
        assert!(framer.extract_frames(&scheme).is_empty());
        let mut bytes = vec![0xAA_u8];
        bytes.extend_from_slice(&[0x00; 9]);
        let mut framer2 = Framer::new();
        framer2.append(&bytes);
        let frames = framer2.extract_frames(&scheme);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].len(), 10);
    }

    #[test]
    fn empty_append_is_safe() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        framer.append(&[]);
        assert!(framer.extract_frames(&scheme).is_empty());
    }

    #[test]
    fn clear_resets_buffer() {
        let scheme = make_scheme();
        let mut framer = Framer::new();
        framer.append(&make_frame()[..5]);
        framer.clear();
        assert_eq!(framer.buffer_len(), 0);
        assert!(framer.extract_frames(&scheme).is_empty());
    }
}
