import { useCommandContext } from '../context/CommandContext';

export const useCommandManager = () => {
    return useCommandContext();
};
