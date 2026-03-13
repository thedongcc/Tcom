/**
 * High Resolution Timer (Windows Only)
 * 通过 winmm.dll 设置 Windows 的系统全局定时器精度。
 * 从而使 setTimeout / setInterval 的精度逼近 1ms。
 */

export function enableHighResTimer() {
    if (process.platform === 'win32') {
        try {
            const koffi = require('koffi');
            const winmm = koffi.load('winmm');
            const timeBeginPeriod = winmm.func('uint __stdcall timeBeginPeriod(uint uPeriod)');

            const result = timeBeginPeriod(1);
            if (result === 0) {
                console.log('[Timer] High-resolution timer enabled (1ms).');
            } else {
                console.warn('[Timer] timeBeginPeriod(1) returned:', result);
            }
        } catch (e) {
            console.warn('[Timer] Could not enable high-resolution timer:', e);
        }
    }
}
