"use client";

import { MoreHorizontal } from "lucide-react";
import { ReactNode, useState } from "react";

export function ItineraryActionMenu({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="itinerary-action-menu">
      <button
        type="button"
        className="itinerary-action-menu-trigger"
        aria-label={`Mais ações de ${label}`}
        aria-expanded={open}
        title="Mais ações"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div className="itinerary-action-menu-popover" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}
