"use client";

import { memo, useCallback, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  DatabaseIcon,
  GlobeIcon,
  SearchIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import {
  useScrollLock,
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SoccerBallSpinner } from "@/components/assistant-ui/soccer-ball-spinner";
import { cn } from "@/lib/utils";

const ANIMATION_DURATION = 200;

function getToolIcon(toolName: string): React.ElementType {
  const n = toolName.toLowerCase();
  if (n.includes("web") || n.includes("search") || n.includes("browse"))
    return GlobeIcon;
  if (
    n.includes("sql") ||
    n.includes("query") ||
    n.includes("execute") ||
    n.includes("db")
  )
    return DatabaseIcon;
  if (n.includes("resolve") || n.includes("entity") || n.includes("lookup"))
    return SearchIcon;
  return WrenchIcon;
}

function getResultMeta(result: unknown): string | null {
  if (Array.isArray(result)) {
    return `${result.length} ${result.length === 1 ? "result" : "results"}`;
  }
  if (result && typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return `${rows.length} ${rows.length === 1 ? "row" : "rows"}`;
    }
  }
  return null;
}

export type ToolFallbackRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        lockScroll();
      }
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-fallback-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-tool-fallback-root group/tool-fallback-root w-full",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

type ToolStatus = ToolCallMessagePartStatus["type"];

const statusIconMap: Record<ToolStatus, React.ElementType> = {
  running: SoccerBallSpinner,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  "requires-action": AlertCircleIcon,
};

function ToolFallbackTrigger({
  toolName,
  status,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  status?: ToolCallMessagePartStatus;
}) {
  const statusType = status?.type ?? "complete";
  const isRunning = statusType === "running";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  const Icon = isRunning ? SoccerBallSpinner : getToolIcon(toolName);

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "aui-tool-fallback-trigger group/trigger text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors",
        className,
      )}
      {...props}
    >
      <Icon
        data-slot="tool-fallback-trigger-icon"
        className={cn(
          "aui-tool-fallback-trigger-icon size-3.5 shrink-0",
          isCancelled && "opacity-60",
        )}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={cn(
          "aui-tool-fallback-trigger-label-wrapper relative inline-block text-start leading-none",
          isCancelled && "line-through",
        )}
      >
        <span>{toolName}</span>
        {isRunning && (
          <span
            aria-hidden
            data-slot="tool-fallback-trigger-shimmer"
            className="aui-tool-fallback-trigger-shimmer shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            {toolName}
          </span>
        )}
      </span>
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "aui-tool-fallback-trigger-chevron size-3.5 shrink-0",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "aui-tool-fallback-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      {...props}
    >
      <div className="mt-2">{children}</div>
    </CollapsibleContent>
  );
}

function ToolFallbackHeader({
  toolName,
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  toolName: string;
  result?: unknown;
}) {
  const Icon = getToolIcon(toolName);
  const meta = getResultMeta(result);

  return (
    <div
      data-slot="tool-fallback-header"
      className={cn(
        "aui-tool-fallback-header bg-muted/40 flex items-center gap-2 border-b px-3 py-2",
        className,
      )}
      {...props}
    >
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="aui-tool-fallback-header-title truncate font-medium">
        {toolName}
      </span>
      {meta && (
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {meta}
        </span>
      )}
    </div>
  );
}

function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  argsText?: string;
}) {
  if (!argsText) return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn("aui-tool-fallback-args px-3 py-2", className)}
      {...props}
    >
      <p className="aui-tool-fallback-args-header text-muted-foreground mb-1.5 text-xs font-medium">
        Input
      </p>
      <pre className="aui-tool-fallback-args-value bg-muted/60 overflow-x-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
        {argsText}
      </pre>
    </div>
  );
}

function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  result?: unknown;
}) {
  if (result === undefined) return null;

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn(
        "aui-tool-fallback-result border-t px-3 py-2",
        className,
      )}
      {...props}
    >
      <p className="aui-tool-fallback-result-header text-muted-foreground mb-1.5 text-xs font-medium">
        Result
      </p>
      <pre className="aui-tool-fallback-result-content bg-muted/60 max-h-72 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
        {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus;
}) {
  if (status?.type !== "incomplete") return null;

  const error = status.error;
  const errorText = error
    ? typeof error === "string"
      ? error
      : JSON.stringify(error)
    : null;

  if (!errorText) return null;

  const isCancelled = status.reason === "cancelled";
  const headerText = isCancelled ? "Cancelled reason" : "Error";

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn("aui-tool-fallback-error px-3 py-2", className)}
      {...props}
    >
      <p className="aui-tool-fallback-error-header text-muted-foreground mb-1.5 text-xs font-medium">
        {headerText}
      </p>
      <p className="aui-tool-fallback-error-reason text-destructive text-xs">
        {errorText}
      </p>
    </div>
  );
}

function ToolFallbackStatus({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus;
}) {
  const statusType = status?.type ?? "complete";

  if (statusType === "running") {
    return (
      <div
        data-slot="tool-fallback-status"
        className={cn(
          "aui-tool-fallback-status text-muted-foreground mt-2 flex items-center gap-1.5 text-xs",
          className,
        )}
        {...props}
      >
        <SoccerBallSpinner className="size-3.5" />
        Running
      </div>
    );
  }

  if (statusType === "incomplete") {
    const isCancelled =
      status?.type === "incomplete" && status.reason === "cancelled";
    return (
      <div
        data-slot="tool-fallback-status"
        className={cn(
          "aui-tool-fallback-status text-muted-foreground mt-2 flex items-center gap-1.5 text-xs",
          className,
        )}
        {...props}
      >
        <XCircleIcon className="size-3.5" />
        {isCancelled ? "Cancelled" : "Failed"}
      </div>
    );
  }

  return (
    <div
      data-slot="tool-fallback-status"
      className={cn(
        "aui-tool-fallback-status text-muted-foreground mt-2 flex items-center gap-1.5 text-xs",
        className,
      )}
      {...props}
    >
      <CheckIcon className="size-3.5" />
      Done
    </div>
  );
}

const ToolFallbackImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  return (
    <ToolFallbackRoot>
      <ToolFallbackTrigger toolName={toolName} status={status} />
      <ToolFallbackContent>
        <div
          className={cn(
            "aui-tool-fallback-card bg-card text-card-foreground overflow-hidden rounded-xl border",
            isCancelled && "opacity-70",
          )}
        >
          <ToolFallbackHeader toolName={toolName} result={result} />
          <ToolFallbackError status={status} />
          <ToolFallbackArgs argsText={argsText} />
          {!isCancelled && <ToolFallbackResult result={result} />}
        </div>
        <ToolFallbackStatus status={status} />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as ToolCallMessagePartComponent & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Header: typeof ToolFallbackHeader;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
  Status: typeof ToolFallbackStatus;
};

ToolFallback.displayName = "ToolFallback";
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Header = ToolFallbackHeader;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;
ToolFallback.Status = ToolFallbackStatus;

export {
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackHeader,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
  ToolFallbackStatus,
};
