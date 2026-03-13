import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronDown, Palette, Save, RotateCcw, Search, Copy, Check, Crosshair, MapPin } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { componentTokenMap } from '../../themes/componentTokenMap';
import { ColorPickerTrigger } from './ColorPickerShared';
import { useI18n } from '../../context/I18nContext';
import { Tooltip } from '../common/Tooltip';
import { REGION_GROUPS, findGroupForComp, findFirstTokenOfComp } from './themeColorGroups';
import { TokenRow, throttledIpcSync } from './ThemeTokenRow';


// GlobalWindow definition merged into vite-env.d.ts
interface Props {
    isOpen: boolean;
    onClose: () => void;
}


export const ThemeColorEditor: React.FC<Props> = ({ isOpen, onClose }) => {
    const { t } = useI18n();
    const { availableThemes, config, loadThemes } = useSettings();
    const [allEdits, setAllEdits] = useState<Record<string, Record<string, string>>>({});
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // 妫€鏌ュ櫒妯″紡鏄惁寮€鍚?
    const [isInspecting, setIsInspecting] = useState(false);

    // 鐩戝惉閿洏浜嬩欢 (淇濆簳 ESC 鍙栨秷)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isInspecting) {
                    setIsInspecting(false);
                    window.themeAPI.stopInspector();
                } else {
                    onClose();
                }
            }
        };
        const unInspectorStop = window.themeAPI.onInspectorStopped(() => {
            setIsInspecting(false);
        });

        const unInspectorStart = window.themeAPI.onInspectorStarted(() => {
            setIsInspecting(true);
        });

        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            unInspectorStart?.();
            unInspectorStop?.();
        };
    }, [isInspecting, onClose]);

    // 鍒濆鍖栵細涓€娆℃€у苟琛岃幏鍙?expandedGroups + pendingEdits锛堝湪绐楀彛棰勭儹闃舵鏃╅┍鍔紝蹇夐€熷紩瀵兼覆鏌擄級
    useEffect(() => {
        const api = (window as any).themeAPI;
        if (!api?.initData) {
            // 灏忛儴鍒嗘棫鐗?preload 娌℃湁姝ゆ帴鍙ｆ椂鐨勫崌绾у伐灞辫矾寰?
            api?.getExpandedGroups?.().then((groups: Record<string, boolean>) => {
                if (groups && Object.keys(groups).length > 0) setExpandedGroups(groups);
            });
            return;
        }
        api.initData().then(({ pendingEdits, expandedGroups: savedGroups }: { pendingEdits: Record<string, Record<string, string>>, expandedGroups: Record<string, boolean> }) => {
            // 杩樺師鎶樺彔鐘舵€?
            if (savedGroups && Object.keys(savedGroups).length > 0) {
                setExpandedGroups(savedGroups);
            }
            // 杩樺師寰呯紪杈戞暟鎹?
            if (pendingEdits && Object.keys(pendingEdits).length > 0) {
                setAllEdits(pendingEdits);
                const currentId = localStorage.getItem('tcom-theme') || 'dark';
                const themeEdits = pendingEdits[currentId] || {};
                lastAppliedEditsRef.current = { ...themeEdits };
                Object.entries(themeEdits).forEach(([varName, color]) => {
                    document.documentElement.style.setProperty(varName, color);
                });
                if (Object.keys(themeEdits).length > 0) {
                    api?.applyPreview?.(themeEdits);
                }
            }
        });
    }, []);

    // 鍙樺姩鏃跺嵆鏃跺悓姝ュ埌涓昏繘绋?
    useEffect(() => {
        if (Object.keys(expandedGroups).length > 0) {
            (window as any).themeAPI?.setExpandedGroups(expandedGroups);
        }
    }, [expandedGroups]);
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedVar, setCopiedVar] = useState<string | null>(null);
    const [lastPickedVars, setLastPickedVars] = useState<string[]>([]);
    const [cdpDebugData, setCdpDebugData] = useState<{ compKey: string | null, className: string, outerHTML: string } | null>(null);

    // Refs for performance
    const thumbRef = useRef<HTMLDivElement | null>(null);
    const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
    const tokenRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const lastAppliedEditsRef = useRef<Record<string, string>>({});
    const previousThemeId = useRef<string | null>(null);
    // 鐢?ref 杩借釜婊氬姩鏉＄殑褰撳墠楂樺害锛岄伩鍏嶉绻?setState
    const thumbHeightRef = useRef(40);

    // 鈹€鈹€ 娲剧敓鐘舵€侊紙蹇呴』鍦ㄦ墍鏈?useEffect 涔嬪墠澹版槑锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    // 褰撳墠婵€娲荤殑涓婚瀹氫箟瀵硅薄
    const currentThemeId = config.theme || localStorage.getItem('tcom-theme') || 'dark';
    const currentThemeDef = availableThemes.find(t => t.id === currentThemeId);
    // 褰撳墠涓婚鐨勫緟缂栬緫 map
    const edits: Record<string, string> = allEdits[currentThemeId] || {};
    // 鎵€鏈変富棰樼殑缂栬緫鎬绘暟
    const editCount = Object.values(allEdits).reduce((sum, m) => sum + Object.keys(m).length, 0);

    // 璁＄畻骞跺悓姝ユ粴鍔ㄦ粦鍧椾綅缃?(绾?DOM 鎿嶄綔锛岄浂 re-render)
    const syncScrollThumb = useCallback(() => {
        const target = scrollContainerRef.current;
        const thumb = thumbRef.current;
        if (!target || !thumb) return;

        const maxScroll = target.scrollHeight - target.clientHeight;
        if (maxScroll <= 0) {
            thumb.style.display = 'none';
            return;
        }

        const ratio = target.scrollTop / maxScroll;
        const h = Math.max(20, (target.clientHeight / target.scrollHeight) * target.clientHeight);
        const translateY = ratio * (target.clientHeight - h);

        // 浠呭湪楂樺害鍙樺寲瓒呰繃 1px 鏃舵墠鏇存柊锛岄伩鍏嶆诞鐐规暟鎶栧姩
        if (Math.abs(h - thumbHeightRef.current) > 1) {
            thumbHeightRef.current = h;
            thumb.style.height = `${h}px`;
        }

        thumb.style.transform = `translateY(${translateY}px)`;
        thumb.style.display = 'block';
    }, []);

    const handleScroll = useCallback(() => {
        syncScrollThumb();
        // 鐩存帴鎿嶄綔 DOM class锛屼笉瑙﹀彂 React re-render
        thumbRef.current?.classList.add('is-scrolling');
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
            thumbRef.current?.classList.remove('is-scrolling');
        }, 800);
    }, [syncScrollThumb]);

    // 鎼滅储鎴栨姌鍙犵姸鎬佸彉鍖栨椂锛屽悓姝ユ粴鍔ㄦ潯
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            syncScrollThumb();
        });
        return () => cancelAnimationFrame(raf);
    }, [searchTerm, expandedGroups, cdpDebugData, syncScrollThumb]);

    // 榛樿琛屼负浠呭湪棣栨涓旀棤鎸佷箙鍖栨暟鎹椂瑙﹀彂
    useEffect(() => {
        if (isOpen && Object.keys(expandedGroups).length === 0) {
            setExpandedGroups({ 'global-variables': true });
        }

        // 濡傛灉 availableThemes 涓虹┖锛屼富鍔ㄦ媺鍙栦竴娆?
        if (isOpen && availableThemes.length === 0) {
            loadThemes();
        }
    }, [isOpen]);

    // 涓婚鍒囨崲鏃堕噸鏂版帓甯冨唴鑱斿彉閲?
    useEffect(() => {
        if (!isOpen) {
            previousThemeId.current = null;
            return;
        }

        if (currentThemeDef) {
            if (previousThemeId.current !== null && previousThemeId.current !== currentThemeDef.id) {
                // 娓呯悊鏃т富棰樺彉閲?
                Object.keys(lastAppliedEditsRef.current).forEach(varName => {
                    document.documentElement.style.removeProperty(varName);
                });

                const themeEdits = allEdits[currentThemeDef.id] || {};
                lastAppliedEditsRef.current = { ...themeEdits };

                Object.entries(themeEdits).forEach(([varName, color]) => {
                    document.documentElement.style.setProperty(varName, color);
                });
                window.themeAPI?.applyPreview(themeEdits);
            }
            previousThemeId.current = currentThemeDef.id;
        }
    }, [isOpen, currentThemeDef?.id, allEdits]);


    // 鐪熸鐨勮烦杞畾浣嶉€昏緫
    const scrollToToken = (varName: string) => {
        const rowEl = tokenRowRefs.current[varName];
        if (rowEl && scrollContainerRef.current) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 闂儊鎻愮ず
            rowEl.style.backgroundColor = 'rgba(0,122,204,0.3)';
            rowEl.style.transition = 'background-color 0.2s';
            setTimeout(() => {
                rowEl.style.backgroundColor = '';
            }, 1000);
        }
    };

    // 鐩戝惉 CDP 妫€鏌ュ櫒鍥炰紶鐨勬暟鎹?
    useEffect(() => {
        const unsub = window.themeAPI?.onComponentPicked((data) => {
            // 灏嗚瘖鏂暟鎹繚瀛樹笅鏉ヤ緵鐢ㄦ埛姣斿
            setCdpDebugData(data);

            // 婊氬姩鍒伴《閮ㄥ尮閰嶉潰鏉夸互绀烘彁閱?
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            }

            // [V5.6] 瑙嗚澧炲己鎻愮ず锛氬湪鐘舵€佷腑鏍囪褰撳墠鏄€滄柊鎷惧彇鈥濈殑锛屼互渚挎覆鏌撴椂鏄剧ず楂樹寒鍔ㄧ敾
            setLastPickedVars(extractVars(data.outerHTML));
            setTimeout(() => setLastPickedVars([]), 2000); // 2绉掑悗娓呴櫎楂樹寒
        });
        return () => { unsub?.(); };
    }, []);

    // 鐩戝惉 CDP 妫€鏌ュ櫒缁撴潫浜嬩欢锛堢偣閫夋垚鍔?or ESC 鍙栨秷锛?
    useEffect(() => {
        const unsub = window.themeAPI?.onInspectorStopped(() => {
            setIsInspecting(false);
        });
        return () => { unsub?.(); };
    }, []);

    // 寮€鍚鏌ュ櫒妯″紡
    const startInspect = useCallback(() => {
        setIsInspecting(true);
        window.themeAPI?.startInspectorMode();
    }, []);

    // 鍏抽棴妫€鏌ュ櫒妯″紡
    const stopInspect = useCallback(() => {
        if (isInspecting) {
            setIsInspecting(false);
            window.themeAPI?.stopInspectorMode();
        }
    }, [isInspecting]);

    // 鍏抽棴鏃舵竻鐞嗘墍鏈夌姸鎬佸苟褰诲簳鎶涘純缂撳瓨锛堟棤璁哄叾濡備綍闅愯棌鍧囬噸缃級
    useEffect(() => {
        if (!isOpen) {
            stopInspect();

            // 鎭㈠涓荤獥鍙ｉ鑹?
            window.themeAPI?.applyPreview?.({});

            // 娓呯悊鏈湴 style 姹℃煋
            Object.keys(lastAppliedEditsRef.current).forEach(varName => {
                document.documentElement.style.removeProperty(varName);
            });

            setAllEdits({});
            lastAppliedEditsRef.current = {};
            window.themeAPI?.clearAllPendingEdits?.();
        }
    }, [isOpen, stopInspect]);


    // 鑾峰彇鏌愪釜鍙橀噺鐨勫綋鍓嶉鑹?
    const getColorValue = (varName: string) => {
        if (edits[varName]) return edits[varName];
        if (currentThemeDef?.colors?.[varName]) return currentThemeDef.colors[varName];
        if (typeof window !== 'undefined') {
            const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            // 杩囨护鎺変笉鍚堟硶鐨勬垨鑰呯┖鐨勯鑹?
            if (val && val !== 'transparent' && val !== 'rgba(0, 0, 0, 0)') return val;
        }
        return '#808080'; // 榛樿涓€х伆鏇夸唬閫忔槑锛岄槻姝㈡粦鍧楄烦鍥炲乏涓嬭
    };

    const handleColorChange = (varName: string, color: string) => {
        const themeId = currentThemeDef?.id || config.theme || 'dark';
        if (typeof varName !== 'string' || !varName.startsWith('--')) {
            return;
        }

        const colorStr = String(color);

        const newEditsForTheme = { ...(allEdits[themeId] || {}), [varName]: colorStr };

        setAllEdits(prev => ({ ...prev, [themeId]: newEditsForTheme }));

        lastAppliedEditsRef.current = { ...lastAppliedEditsRef.current, [varName]: colorStr };
        document.documentElement.style.setProperty(varName, colorStr);

        // 浣跨敤鑺傛祦鍣ㄥ彂閫佺粰涓荤獥鍙?
        throttledIpcSync(themeId, newEditsForTheme);
    };

    const handleSave = async () => {
        if (editCount === 0) return;
        if (!window.themeAPI) return;

        let hasError = false;
        for (const themeId of Object.keys(allEdits)) {
            const themeEdits = allEdits[themeId];
            if (Object.keys(themeEdits).length === 0) continue;

            const def = availableThemes.find(t => t.id === themeId);
            if (def) {
                const updatedThemeDef = {
                    ...def,
                    colors: { ...def.colors, ...themeEdits }
                };

                const res = await window.themeAPI.save(themeId, updatedThemeDef);
                if (!res.success) {
                    alert(`淇濆瓨涓婚 ${def.name} 澶辫触: ${res.error}`);
                    hasError = true;
                }
            }
        }

        if (!hasError) {
            // onClose() 浼氬皢 isOpen 鍙樹负 false锛屼粠鑰岃嚜鍔ㄨЕ鍙?useEffect 鐨勬竻鐞嗛€昏緫锛屽洜姝ゆ垜浠繖閲屼笉鐢ㄤ富鍔ㄥ鍐欎簡
            loadThemes();
            onClose();
        }
    };

    const handleCancel = () => {
        // [V5.6] 寮哄姏閲嶇疆锛氭樉寮忔竻绌轰富绐楀彛棰勮骞跺悓姝ュ緟鍔炵姸鎬?
        if (window.themeAPI) {
            window.themeAPI.applyPreview?.({});
            window.themeAPI.setPendingEdits?.(currentThemeDef?.id || config.theme || 'dark', null);
            window.themeAPI.clearAllPendingEdits?.();
        }
        // isOpen 鍙?false 鐨?useEffect 浼氬畬鎴愮粍浠跺唴鐘舵€佺殑鏈€鍚庢竻鐞?
        onClose();
    };

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedVar(text);
        setTimeout(() => setCopiedVar(null), 1500);
    };

    // 鍏ㄥ眬鏌ユ壘鏌愪釜鍙橀噺鐨勪腑鏂?Label
    const findTokenLabel = (varName: string) => {
        for (const meta of Object.values(componentTokenMap)) {
            const token = meta.tokens.find(t => t.var === varName);
            if (token) return token.label;
        }
        return varName; // 鎵句笉鍒板垯杩斿洖鍘熷鍙橀噺鍚?
    };

    // 鎻愬彇 extractVars 鍒板唴閮?
    const extractVars = useCallback((html: string) => {
        const regex = /var\((--[^)]+)\)/g;
        const vars = new Set<string>();
        let match;
        while ((match = regex.exec(html)) !== null) {
            vars.add(match[1]);
        }
        return Array.from(vars);
    }, []);


    // 鎵ц鎼滅储杩囨护
    const lowerSearch = searchTerm.toLowerCase();
    const filteredGroups = useMemo(() => {
        if (!lowerSearch) return REGION_GROUPS;

        return REGION_GROUPS.map(group => {
            const filteredComps = group.components.map(compId => {
                const compMeta = componentTokenMap[compId];
                if (!compMeta) return null;

                if (compMeta.label.toLowerCase().includes(lowerSearch) || compId.toLowerCase().includes(lowerSearch)) {
                    return compId;
                }

                const hasMatchingToken = compMeta.tokens.some(t =>
                    t.var.toLowerCase().includes(lowerSearch) ||
                    t.label.toLowerCase().includes(lowerSearch)
                );

                return hasMatchingToken ? compId : null;
            }).filter(Boolean) as string[];

            if (filteredComps.length > 0) {
                return { ...group, components: filteredComps };
            }
            return null;
        }).filter(Boolean) as typeof REGION_GROUPS;
    }, [lowerSearch]);

    // 鎼滅储鏃惰嚜鍔ㄥ睍寮€鏈夌粨鏋滅殑缁?
    useEffect(() => {
        if (lowerSearch && filteredGroups.length > 0) {
            const newExpanded: Record<string, boolean> = {};
            filteredGroups.forEach(g => newExpanded[g.id] = true);
            setExpandedGroups(newExpanded);
        }
    }, [lowerSearch, filteredGroups]);

    return (
        <div
            className="flex flex-col h-screen w-full bg-[var(--app-background)] text-[var(--app-foreground)] overflow-hidden relative"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            <div className="flex-1 flex flex-col bg-[var(--theme-editor-bg)] overflow-hidden relative">

                {/* 头部区 - 紧凑单行 */}
                <div
                    className="px-3 py-2 border-b flex items-center justify-between shrink-0"
                    style={{ borderColor: 'var(--theme-editor-border)' }}
                >
                    <div className="flex items-center gap-2">
                        <Palette size={14} className="text-[var(--accent-color)] shrink-0" />
                        <span className="text-[12px] font-semibold tracking-tight select-none opacity-90">主题颜色编辑器</span>
                        {editCount > 0 && (
                            <span className="ml-2 bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/20 text-[10px] px-2 py-0.5 rounded-full font-bold select-none whitespace-nowrap">
                                {t('themeEditor.modifiedCount', { count: String(editCount) })}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
                        <Tooltip content={t('themeEditor.close')} position="bottom" offset={4}>
                            <button
                                onClick={onClose}
                                className="p-1 rounded transition-all"
                                style={{
                                    color: 'var(--app-foreground)',
                                    opacity: 0.5
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'var(--theme-editor-btn-hover)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <X size={15} />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {/* 搜索 + 选取区 - 紧凑 */}
                <div
                    className="px-3 py-2 border-b shrink-0 flex flex-col gap-1.5"
                    style={{
                        WebkitAppRegion: 'no-drag',
                        borderColor: 'var(--theme-editor-border)'
                    } as any}
                >
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" style={{ color: 'var(--app-foreground)' }} />
                        <input
                            type="text"
                            placeholder="搜索变量、组件名、CSS 名..."
                            className="w-full h-7 pl-7 pr-3 text-[11px] rounded-md outline-none transition-all placeholder:text-[var(--app-foreground)] placeholder:opacity-50"
                            style={{
                                backgroundColor: 'var(--theme-editor-input-bg)',
                                borderColor: 'var(--theme-editor-input-border)',
                                borderWidth: '1px',
                                color: 'var(--app-foreground)'
                            }}
                            onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-input-focus)'; e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                            onBlur={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-input-bg)'; e.currentTarget.style.borderColor = 'var(--theme-editor-input-border)'; }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={isInspecting ? () => (window as any).themeAPI?.stopInspector() : startInspect}
                        className={`w-full py-1.5 flex items-center justify-center gap-1.5 rounded-md border text-[11px] font-semibold transition-all shadow-sm`}
                        style={{
                            backgroundColor: isInspecting ? 'var(--theme-editor-inspect-bg)' : 'var(--theme-editor-btn-bg)',
                            borderColor: isInspecting ? 'var(--theme-editor-inspect-border)' : 'var(--theme-editor-input-border)',
                            color: isInspecting ? 'var(--theme-editor-inspect-text)' : 'var(--app-foreground)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = isInspecting ? 'var(--theme-editor-inspect-hover)' : 'var(--theme-editor-btn-hover)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = isInspecting ? 'var(--theme-editor-inspect-bg)' : 'var(--theme-editor-btn-bg)';
                        }}
                    >
                        {isInspecting ? (
                            <>
                                <X size={12} className="animate-pulse" />
                                <span>停止选取 (ESC)</span>
                            </>
                        ) : (
                            <>
                                <Crosshair size={12} />
                                <span className="tracking-wide">开启 UI 元素选取匹配</span>
                            </>
                        )}
                    </button>
                </div>

                {/* 内容区 */}
                <div className="flex-1 overflow-hidden relative group/scroll-container">
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="w-full h-full overflow-y-auto overflow-x-hidden px-2.5 py-2 flex flex-col gap-1.5 scrollbar-none"
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                    >

                        {/* CDP 诊断与精准匹配面板 */}
                        {cdpDebugData && (
                            <div className="mb-2 flex flex-col gap-1.5 shrink-0">
                                <div className="p-2.5 rounded-lg text-[11px] flex flex-col gap-2 relative shrink-0 border" style={{ backgroundColor: 'var(--theme-editor-inspect-bg)', borderColor: 'var(--theme-editor-inspect-border)' }}>
                                    <Tooltip content={t('themeEditor.closeInspect')} position="bottom" offset={4}>
                                        <button
                                            onClick={() => setCdpDebugData(null)}
                                            className="absolute right-2 top-2 transition-colors hover:opacity-100 opacity-60"
                                            style={{ color: 'var(--theme-editor-inspect-text)' }}
                                        >
                                            <X size={13} />
                                        </button>
                                    </Tooltip>
                                    <div className="font-medium pb-1 flex items-center gap-1.5 border-b" style={{ color: 'var(--theme-editor-inspect-text)', borderColor: 'var(--theme-editor-inspect-border)' }}>
                                        <Crosshair size={12} />
                                        选取元素 outerHTML
                                    </div>
                                    <pre className="p-1.5 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all select-all font-mono max-h-28 overflow-y-auto" style={{ backgroundColor: 'var(--theme-editor-input-bg)', color: 'var(--app-foreground)', opacity: 0.8 }}>
                                        {cdpDebugData.outerHTML || '无信息'}
                                    </pre>
                                </div>

                                <div className="p-2.5 rounded-lg shrink-0 border" style={{ backgroundColor: 'var(--theme-editor-match-bg)', borderColor: 'var(--theme-editor-match-border)' }}>
                                    <div className="font-medium pb-1 mb-2 flex items-center gap-1.5 text-[11px] border-b" style={{ color: 'var(--theme-editor-match-text)', borderColor: 'var(--theme-editor-match-border)' }}>
                                        <MapPin size={12} />
                                        匹配到的颜色变量
                                    </div>
                                    {extractVars(cdpDebugData.outerHTML).length > 0 ? (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {extractVars(cdpDebugData.outerHTML).map(v => (
                                                <div key={`matched-${v}`}>
                                                    <TokenRow
                                                        varName={v}
                                                        label={findTokenLabel(v)}
                                                        value={getColorValue(v)}
                                                        isCopied={copiedVar === v}
                                                        idPrefix="matched-"
                                                        onColorChange={handleColorChange}
                                                        onCopy={handleCopy}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-3 text-[10px] italic opacity-60" style={{ color: 'var(--theme-editor-match-text)' }}>
                                            该元素未解析到 var(--) 颜色变量
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {filteredGroups.length === 0 ? (
                            <div className="text-center py-10 text-[var(--app-foreground)]/40 text-[11px]">
                                未查找到匹配的颜色变量
                            </div>
                        ) : (
                            filteredGroups.map(group => {
                                const isExpanded = expandedGroups[group.id];
                                return (
                                    <div
                                        key={group.id}
                                        className="border rounded-xl overflow-hidden shrink-0 shadow-sm"
                                        style={{
                                            backgroundColor: 'var(--theme-editor-card-bg)',
                                            borderColor: 'var(--theme-editor-card-border)'
                                        }}
                                    >
                                        <button
                                            onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !isExpanded }))}
                                            className="w-full px-3 py-2 flex items-center justify-between transition-colors cursor-pointer"
                                            style={{ backgroundColor: isExpanded ? 'var(--theme-editor-card-hover)' : 'transparent' }}
                                            onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'var(--theme-editor-card-hover)'; }}
                                            onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                                                    <ChevronDown size={12} className={isExpanded ? 'text-[var(--accent-color)]' : 'opacity-40'} style={{ color: isExpanded ? undefined : 'var(--app-foreground)' }} />
                                                </div>
                                                <span
                                                    className="text-[11px] font-semibold transition-colors"
                                                    style={{ color: 'var(--app-foreground)', opacity: isExpanded ? 1 : 0.7 }}
                                                >
                                                    {group.label}
                                                </span>
                                            </div>
                                            <div
                                                className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center font-mono tabular-nums"
                                                style={{
                                                    color: 'var(--app-foreground)',
                                                    opacity: 0.6,
                                                    backgroundColor: 'var(--theme-editor-input-bg)'
                                                }}
                                            >
                                                {group.components.length}
                                            </div>
                                        </button>

                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.15, ease: "easeInOut" }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="px-2.5 py-2 flex flex-col gap-4 border-t" style={{ borderColor: 'var(--theme-editor-card-border)' }}>
                                                        {group.components.map(compId => {
                                                            const compMeta = componentTokenMap[compId];
                                                            if (!compMeta) return null;

                                                            const tokens = compMeta.tokens.filter(t =>
                                                                !lowerSearch ||
                                                                t.var.toLowerCase().includes(lowerSearch) ||
                                                                t.label.toLowerCase().includes(lowerSearch) ||
                                                                compMeta.label.toLowerCase().includes(lowerSearch)
                                                            );

                                                            if (tokens.length === 0) return null;

                                                            return (
                                                                <div key={compId} className="flex flex-col gap-1.5 shrink-0">
                                                                    <div className="text-[10px] font-bold uppercase tracking-widest pb-0.5 border-b" style={{ color: 'var(--app-foreground)', opacity: 0.5, borderColor: 'var(--theme-editor-card-border)' }}>
                                                                        {compMeta.label}
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-x-1 gap-y-1">
                                                                        {tokens.map(token => (
                                                                            <div key={token.var} className="min-w-0">
                                                                                <TokenRow
                                                                                    varName={token.var}
                                                                                    label={token.label}
                                                                                    value={getColorValue(token.var)}
                                                                                    isCopied={copiedVar === token.var}
                                                                                    onColorChange={handleColorChange}
                                                                                    onCopy={handleCopy}
                                                                                    setRef={el => { tokenRowRefs.current[token.var] = el; }}
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* 悬浮滑块 - 纯 DOM 控制，零 React 状态 */}
                    <div
                        ref={thumbRef}
                        className="floating-scrollbar-thumb absolute right-[3px] pointer-events-none z-50"
                        style={{
                            top: 0,
                            height: `${thumbHeightRef.current}px`,
                            width: '3px',
                            backgroundColor: 'var(--scrollbar-slider-hover-color)',
                            borderRadius: '3px',
                            marginTop: '4px',
                            marginBottom: '4px',
                            willChange: 'transform',
                            display: 'none',
                            opacity: 0,
                            transition: 'opacity 0.3s'
                        }}
                    />
                </div>

                {/* 底部操作区 - 紧凑 */}
                <div
                    className="px-3 py-2 border-t flex justify-end gap-2 shrink-0"
                    style={{ WebkitAppRegion: 'no-drag', borderColor: 'var(--theme-editor-border)', backgroundColor: 'var(--theme-editor-card-bg)' } as any}
                >
                    <button
                        onClick={handleCancel}
                        className="px-2.5 py-1 text-[11px] rounded-md border text-[var(--app-foreground)] hover:text-[var(--app-foreground)] transition-all flex items-center gap-1 font-medium"
                        style={{ borderColor: 'var(--theme-editor-input-border)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--theme-editor-btn-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <RotateCcw size={12} />
                        放弃更改
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={editCount === 0}
                        className="px-3 py-1 text-[11px] rounded-md bg-[var(--accent-color)]/90 hover:opacity-90 text-white transition-all disabled:opacity-90 disabled:grayscale-[0.5] disabled:cursor-not-allowed flex items-center gap-1 font-semibold shadow-sm"
                    >
                        <Save size={12} />
                        保存更改
                    </button>
                </div>
            </div>
        </div>
    );
};

