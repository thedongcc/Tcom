import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CommandEntity, CommandItem } from '../../types/command';
import { CommandItemComponent } from './CommandItemComponent';
import { CommandGroupComponent } from './CommandGroupComponent';

interface CommandListProps {
    items: CommandEntity[];
    onEdit: (item: CommandEntity) => void;
    onSend: (item: CommandEntity) => void;
    onContextMenu: (e: React.MouseEvent, item: CommandEntity) => void;
    dropIndicator?: any;
    canSend: boolean;
    selectedIds: Set<string>;
    onSelect: (e: React.MouseEvent, item: CommandEntity) => void;
}

export const CommandList = ({ items, onEdit, onSend, onContextMenu, canSend, selectedIds, onSelect }: CommandListProps) => {
    return (
        <SortableContext
            items={items.map(i => i.id)}
            strategy={verticalListSortingStrategy}
        >
            <div className="flex flex-col gap-0.5 min-h-[5px]">
                {items.map((item) => (
                    item.type === 'group' ? (
                        <CommandGroupComponent
                            key={item.id}
                            group={item}
                            onEdit={onEdit}
                            onSend={(i) => onSend(i as CommandEntity)}
                            onContextMenu={onContextMenu}
                            canSend={canSend}
                            selectedIds={selectedIds}
                            onSelect={onSelect}
                        />
                    ) : (
                        <CommandItemComponent
                            key={item.id}
                            item={item as CommandItem}
                            onEdit={(i) => onEdit(i)}
                            onSend={(i) => onSend(i)}
                            onContextMenu={onContextMenu}
                            disabled={!canSend}
                            selected={selectedIds.has(item.id)}
                            onSelect={(e) => onSelect(e, item)}
                        />
                    )
                ))}
            </div>
        </SortableContext>
    );
};
