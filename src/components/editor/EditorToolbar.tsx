"use client";

import { ArrowLeftRight, MousePointer2, Pencil, Plus, Scissors, Undo2, X } from "lucide-react";
import type { RouteResult } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ErrorBanner, Spinner } from "@/components/ui/Feedback";
import { useRouteStore } from "@/store/route-store";

/**
 * Manual editing controls. Waypoints are dragged directly on the map; this
 * toolbar switches tools (move / add / cut), reverses, undoes and shows the
 * recalculation state.
 */
export function EditorToolbar({ route }: { route: RouteResult }) {
  const editing = useRouteStore((s) => s.editing);
  const setEditing = useRouteStore((s) => s.setEditing);
  const tool = useRouteStore((s) => s.tool);
  const setTool = useRouteStore((s) => s.setTool);
  const cutBuffer = useRouteStore((s) => s.cutBuffer);
  const undo = useRouteStore((s) => s.undo);
  const undoStack = useRouteStore((s) => s.undoStack);
  const reverse = useRouteStore((s) => s.reverseRoute);
  const recalcStatus = useRouteStore((s) => s.recalcStatus);
  const recalcError = useRouteStore((s) => s.recalcError);
  const applyWaypoints = useRouteStore((s) => s.applyWaypoints);

  if (!editing) {
    return (
      <Button block onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" />} data-testid="edit-button">
        Modifier le parcours
      </Button>
    );
  }

  const toolButton = (id: typeof tool, label: string, Icon: typeof Plus, hint: string) => (
    <button
      type="button"
      onClick={() => setTool(id)}
      aria-pressed={tool === id}
      title={hint}
      className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium ${tool === id ? "bg-ink-900 text-white" : "bg-white text-ink-700 hover:bg-ink-100"}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50 p-2" data-testid="editor-toolbar">
      <div className="flex gap-1">
        {toolButton("move", "Déplacer", MousePointer2, "Glissez les points sur la carte")}
        {toolButton("add", "Ajouter", Plus, "Cliquez sur le tracé pour ajouter un point de passage")}
        {toolButton("cut", "Couper", Scissors, "Cliquez deux points du tracé pour raccourcir entre eux")}
      </div>
      <p className="px-1 text-[11px] text-ink-500">
        {tool === "move"
          ? "Glissez les points sur la carte. Cliquez un point de passage pour le supprimer."
          : tool === "add"
            ? "Cliquez sur le tracé (ou à côté) pour ajouter un détour."
            : cutBuffer.length === 0
              ? "Cliquez le début de la section à couper."
              : "Cliquez la fin de la section à couper."}
      </p>
      <div className="flex gap-1">
        <Button size="sm" block onClick={reverse} icon={<ArrowLeftRight className="h-3.5 w-3.5" />} disabled={recalcStatus === "loading"}>
          Inverser
        </Button>
        <Button size="sm" block onClick={undo} disabled={undoStack.length === 0} icon={<Undo2 className="h-3.5 w-3.5" />}>
          Annuler
        </Button>
        <Button size="sm" block onClick={() => applyWaypoints(route.waypoints)} disabled={recalcStatus === "loading"}>
          Recalculer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Quitter l'édition">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {recalcStatus === "loading" ? <Spinner label="Recalcul du parcours…" /> : null}
      {recalcStatus === "error" && recalcError ? <ErrorBanner message={recalcError} /> : null}
    </div>
  );
}
