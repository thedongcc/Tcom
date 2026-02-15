import { useState, useCallback, useMemo } from 'react';

export interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

export const useHistory = <T>(initialState: T) => {
    const [state, setState] = useState<HistoryState<T>>({
        past: [],
        present: initialState,
        future: []
    });

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => {
        setState(currentState => {
            if (currentState.past.length === 0) return currentState;

            const previous = currentState.past[currentState.past.length - 1];
            const newPast = currentState.past.slice(0, currentState.past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [currentState.present, ...currentState.future]
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState(currentState => {
            if (currentState.future.length === 0) return currentState;

            const next = currentState.future[0];
            const newFuture = currentState.future.slice(1);

            return {
                past: [...currentState.past, currentState.present],
                present: next,
                future: newFuture
            };
        });
    }, []);

    // Set new state (clears future)
    const set = useCallback((newState: T | ((current: T) => T)) => {
        setState(currentState => {
            const nextPresent = typeof newState === 'function'
                ? (newState as (current: T) => T)(currentState.present)
                : newState;

            if (nextPresent === currentState.present) return currentState;

            return {
                past: [...currentState.past, currentState.present],
                present: nextPresent,
                future: []
            };
        });
    }, []);

    // Initializer (reset history)
    const reset = useCallback((newState: T) => {
        setState({
            past: [],
            present: newState,
            future: []
        });
    }, []);

    return {
        state: state.present,
        set,
        undo,
        redo,
        canUndo,
        canRedo,
        reset,
        historyState: state
    };
};
