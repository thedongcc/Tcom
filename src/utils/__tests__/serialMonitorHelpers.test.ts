/**
 * serialMonitorHelpers.test.ts
 * 串口监视器纯工具函数单元测试。
 * 覆盖：isMonospacedFont / getInitialDisplayState / hasUIStateChanges / buildFontOptions
 */
import { describe, it, expect } from 'vitest';
import {
    isMonospacedFont,
    getInitialDisplayState,
    hasUIStateChanges,
    buildFontOptions,
} from '../../components/serial/serialMonitorHelpers';

// ─── isMonospacedFont ──────────────────────────────────────────────

describe('isMonospacedFont', () => {
    it('应识别含 mono 关键词的字体为等宽字体', () => {
        expect(isMonospacedFont('JetBrains Mono')).toBe(true);
        expect(isMonospacedFont('Roboto Mono')).toBe(true);
    });

    it('应识别含 console 关键词的字体为等宽字体', () => {
        expect(isMonospacedFont('Lucida Console')).toBe(true);
    });

    it('应识别含 code 关键词的字体为等宽字体', () => {
        expect(isMonospacedFont('Source Code Pro')).toBe(true);
        expect(isMonospacedFont('Fira Code')).toBe(true);
    });

    it('应识别含 courier 关键词的字体为等宽字体', () => {
        expect(isMonospacedFont('Courier New')).toBe(true);
    });

    it('应识别含 terminal 关键词的字体为等宽字体', () => {
        expect(isMonospacedFont('Windows Terminal')).toBe(true);
    });

    it('应将比例字体识别为非等宽字体', () => {
        expect(isMonospacedFont('Arial')).toBe(false);
        expect(isMonospacedFont('Inter')).toBe(false);
        expect(isMonospacedFont('Roboto')).toBe(false);
        expect(isMonospacedFont('Microsoft YaHei')).toBe(false);
    });

    it('关键词匹配不区分大小写', () => {
        expect(isMonospacedFont('COURIER')).toBe(true);
        expect(isMonospacedFont('JetBrainsMONO')).toBe(true);
    });
});

// ─── getInitialDisplayState ────────────────────────────────────────

describe('getInitialDisplayState', () => {
    it('空 uiState 时应返回所有默认值', () => {
        const defaults = getInitialDisplayState({});
        expect(defaults.viewMode).toBe('hex');
        expect(defaults.showTimestamp).toBe(true);
        expect(defaults.showPacketType).toBe(true);
        expect(defaults.showDataLength).toBe(false);
        expect(defaults.showControlChars).toBe(true);
        expect(defaults.mergeRepeats).toBe(false);
        expect(defaults.filterMode).toBe('all');
        expect(defaults.encoding).toBe('utf-8');
        expect(defaults.fontSize).toBe(15);
        expect(defaults.fontFamily).toBe('AppCoreFont');
        expect(defaults.autoScroll).toBe(true);
        expect(defaults.flashNewMessage).toBe(true);
        expect(defaults.searchOpen).toBe(false);
    });

    it('uiState 中有值时应使用保存的值', () => {
        const state = getInitialDisplayState({
            viewMode: 'text',
            showTimestamp: false,
            showDataLength: true,
            filterMode: 'rx',
            encoding: 'gbk',
            fontSize: 20,
            fontFamily: '"Courier New"',
            autoScroll: false,
            flashNewMessage: false,
            searchOpen: true,
        });
        expect(state.viewMode).toBe('text');
        expect(state.showTimestamp).toBe(false);
        expect(state.showDataLength).toBe(true);
        expect(state.filterMode).toBe('rx');
        expect(state.encoding).toBe('gbk');
        expect(state.fontSize).toBe(20);
        expect(state.fontFamily).toBe('"Courier New"');
        expect(state.autoScroll).toBe(false);
        expect(state.flashNewMessage).toBe(false);
        expect(state.searchOpen).toBe(true);
    });

    it('showTimestamp 明确为 false 时不应被默认值覆盖', () => {
        const state = getInitialDisplayState({ showTimestamp: false });
        expect(state.showTimestamp).toBe(false);
    });

    it('flashNewMessage 明确为 false 时不应被默认值覆盖', () => {
        const state = getInitialDisplayState({ flashNewMessage: false });
        expect(state.flashNewMessage).toBe(false);
    });
});

// ─── hasUIStateChanges ────────────────────────────────────────────

describe('hasUIStateChanges', () => {
    it('无变化时应返回 false', () => {
        const current = { viewMode: 'hex', fontSize: 15 };
        expect(hasUIStateChanges({ viewMode: 'hex', fontSize: 15 }, current)).toBe(false);
    });

    it('有字段变化时应返回 true', () => {
        const current = { viewMode: 'hex', fontSize: 15 };
        expect(hasUIStateChanges({ viewMode: 'text' }, current)).toBe(true);
    });

    it('新增字段时应返回 true', () => {
        const current = { viewMode: 'hex' };
        expect(hasUIStateChanges({ newField: 'value' }, current)).toBe(true);
    });

    it('对象类型的字段做深比较', () => {
        const current = { pos: { top: 10, right: 20 } };
        expect(hasUIStateChanges({ pos: { top: 10, right: 20 } }, current)).toBe(false);
        expect(hasUIStateChanges({ pos: { top: 99, right: 20 } }, current)).toBe(true);
    });
});

// ─── buildFontOptions ─────────────────────────────────────────────

describe('buildFontOptions', () => {
    it('空列表时只返回内置字体分组', () => {
        const opts = buildFontOptions([]);
        expect(opts).toHaveLength(2); // header + built-in
        expect(opts[0].value).toBe('header-built-in');
        expect(opts[1].value).toBe('AppCoreFont');
    });

    it('应将等宽字体和比例字体分类并加分组 header', () => {
        const opts = buildFontOptions(['Arial', 'JetBrains Mono', 'inter']);
        const values = opts.map(o => o.value);
        expect(values).toContain('header-built-in');
        expect(values).toContain('AppCoreFont');
        expect(values).toContain('header-mono');
        expect(values).toContain('"JetBrains Mono"');
        expect(values).toContain('header-prop');
        expect(values).toContain('"Arial"');
    });

    it('全是比例字体时不应出现 Monospaced header', () => {
        const opts = buildFontOptions(['Arial', 'Inter']);
        const values = opts.map(o => o.value);
        expect(values).not.toContain('header-mono');
        expect(values).toContain('header-prop');
    });

    it('全是等宽字体时不应出现 Proportional header', () => {
        const opts = buildFontOptions(['Courier New', 'Fira Code']);
        const values = opts.map(o => o.value);
        expect(values).toContain('header-mono');
        expect(values).not.toContain('header-prop');
    });

    it('分组 header 项应标记为 disabled', () => {
        const opts = buildFontOptions(['Arial']);
        const headers = opts.filter(o => o.disabled);
        expect(headers.every(h => h.disabled === true)).toBe(true);
    });
});
