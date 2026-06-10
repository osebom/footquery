"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { ShirtIcon, UserIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEventHandler,
  type FC,
  type KeyboardEventHandler,
  type RefObject,
} from "react";

type Entity = { id: string | number; name: string };
type MentionData = { players: Entity[]; teams: Entity[] };
type MentionEntity = Entity & { type: "player" | "team" };
type ActiveMention = { offset: number; query: string };

export type ResolvedMention = {
  name: string;
  type: "player" | "team";
  id: string | number;
};

const EMPTY_DATA: MentionData = { players: [], teams: [] };
const MAX_RESULTS = 8;

// Entities the user has inserted via the @ picker, keyed by the exact name we
// wrote into the composer. We already know each one's database id at pick time,
// so we stash it here and ship it alongside the message (see collectMentions).
// This lets the agent skip the resolve_entity round-trip for @-picked names.
const mentionRegistry = new Map<string, ResolvedMention>();

export function registerMention(mention: ResolvedMention): void {
  mentionRegistry.set(mention.name, mention);
}

// Returns the registered mentions whose name still appears in the given text,
// so deleting a mention before sending correctly drops its id.
export function collectMentions(text: string): ResolvedMention[] {
  const found: ResolvedMention[] = [];
  for (const mention of mentionRegistry.values()) {
    if (text.includes(mention.name)) found.push(mention);
  }
  return found;
}

export function clearMentions(): void {
  mentionRegistry.clear();
}

let cache: MentionData | null = null;
let inflight: Promise<MentionData> | null = null;

function loadMentions(): Promise<MentionData> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/mentions")
      .then((res) => (res.ok ? (res.json() as Promise<MentionData>) : EMPTY_DATA))
      .then((data) => {
        cache = data;
        return data;
      })
      .catch(() => EMPTY_DATA)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function useMentionData(): { data: MentionData; loaded: boolean } {
  const [data, setData] = useState<MentionData | null>(cache);

  useEffect(() => {
    let active = true;
    void loadMentions().then((loaded) => {
      if (active) setData(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return { data: data ?? EMPTY_DATA, loaded: data !== null };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findActiveMention(
  text: string,
  cursorPosition: number,
): ActiveMention | null {
  const textBeforeCursor = text.slice(0, cursorPosition);
  let tokenStart = textBeforeCursor.length - 1;

  while (tokenStart >= 0 && !/\s/.test(textBeforeCursor[tokenStart])) {
    tokenStart -= 1;
  }
  tokenStart += 1;

  if (textBeforeCursor[tokenStart] !== "@") return null;

  return {
    offset: tokenStart,
    query: textBeforeCursor.slice(tokenStart + 1),
  };
}

const rowClass =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors";

export type MentionAutocomplete = {
  inputHandlers: {
    onChange: ChangeEventHandler<HTMLTextAreaElement>;
    onSelect: ChangeEventHandler<HTMLTextAreaElement>;
    onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  };
  popover: {
    open: boolean;
    loaded: boolean;
    query: string;
    results: MentionEntity[];
    highlightedIndex: number;
    selectEntity: (entity: MentionEntity) => void;
    highlightIndex: (index: number) => void;
  };
};

export function useMentionAutocomplete(
  inputRef: RefObject<HTMLTextAreaElement | null>,
): MentionAutocomplete {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const { data, loaded } = useMentionData();
  const [cursorPosition, setCursorPosition] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const entities = useMemo<MentionEntity[]>(
    () => [
      ...data.players.map((player) => ({ ...player, type: "player" as const })),
      ...data.teams.map((team) => ({ ...team, type: "team" as const })),
    ],
    [data],
  );

  const activeMention = useMemo(
    () => findActiveMention(text, Math.min(cursorPosition, text.length)),
    [cursorPosition, text],
  );
  const activeKey = activeMention
    ? `${activeMention.offset}:${activeMention.query}`
    : null;
  const query = activeMention?.query ?? "";

  const results = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return [];

    return entities
      .filter((entity) => normalize(entity.name).includes(normalizedQuery))
      .slice(0, MAX_RESULTS);
  }, [entities, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [activeKey]);

  const selectEntity = useCallback(
    (entity: MentionEntity) => {
      if (!activeMention) return;

      const before = text.slice(0, activeMention.offset);
      const after = text.slice(
        activeMention.offset + activeMention.query.length + 1,
      );
      const separator = after.length === 0 || !after.startsWith(" ") ? " " : "";
      const nextText = `${before}${entity.name}${separator}${after}`;
      const nextCursor = before.length + entity.name.length + separator.length;

      registerMention({ name: entity.name, type: entity.type, id: entity.id });
      aui.composer().setText(nextText);
      setCursorPosition(nextCursor);
      setDismissedKey(null);

      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [activeMention, aui, inputRef, text],
  );

  const updateCursor: ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      setCursorPosition(event.currentTarget.selectionStart ?? text.length);
      setDismissedKey(null);
    },
    [text.length],
  );

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      const isOpen = activeMention !== null && activeKey !== dismissedKey;

      if (!isOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedKey(activeKey);
        return;
      }

      if (results.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((index) => (index + 1) % results.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex(
          (index) => (index - 1 + results.length) % results.length,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectEntity(results[highlightedIndex] ?? results[0]);
      }
    },
    [
      activeKey,
      activeMention,
      dismissedKey,
      highlightedIndex,
      results,
      selectEntity,
    ],
  );

  return {
    inputHandlers: {
      onChange: updateCursor,
      onSelect: updateCursor,
      onKeyDown,
    },
    popover: {
      open: activeMention !== null && activeKey !== dismissedKey,
      loaded,
      query,
      results,
      highlightedIndex,
      selectEntity,
      highlightIndex: setHighlightedIndex,
    },
  };
}

const TypeIcon: FC<{ type: string }> = ({ type }) => {
  const Icon = type === "team" ? ShirtIcon : UserIcon;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
};

export const MentionPopover: FC<MentionAutocomplete["popover"]> = ({
  open,
  loaded,
  query,
  results,
  highlightedIndex,
  selectEntity,
  highlightIndex,
}) => {
  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Players and teams"
      className="bg-popover text-popover-foreground absolute right-0 bottom-full left-0 z-50 mb-2 max-h-72 overflow-y-auto rounded-2xl border p-1 shadow-lg"
    >
      <div className="text-muted-foreground px-2.5 pt-1.5 pb-1 text-xs font-medium">
        Mention a player or team
      </div>

      {query.trim() === "" ? (
        <div className="text-muted-foreground px-2.5 py-2 text-sm">
          Type a player or team name to search.
        </div>
      ) : results.length === 0 ? (
        <div className="text-muted-foreground px-2.5 py-2 text-sm">
          {loaded ? `No matches for "${query}"` : "Loading..."}
        </div>
      ) : (
        results.map((entity, index) => (
          <button
            key={`${entity.type}:${entity.id}`}
            type="button"
            role="option"
            aria-selected={index === highlightedIndex}
            className={`${rowClass} ${
              index === highlightedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
            onMouseMove={() => highlightIndex(index)}
            onClick={() => selectEntity(entity)}
          >
            <TypeIcon type={entity.type} />
            <span className="truncate">{entity.name}</span>
            <span className="text-muted-foreground ml-auto text-xs capitalize">
              {entity.type}
            </span>
          </button>
        ))
      )}
    </div>
  );
};
