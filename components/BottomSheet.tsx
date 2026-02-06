"use client";

import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type SheetState = "peek" | "full";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;

  // NEW (safe defaults)
  state?: SheetState; // default: "full"
  onToggleState?: (next: SheetState) => void;

  // Optional: tweak heights per your taste
  peekHeightClassName?: string; // default: "h-[28vh]"
  fullHeightClassName?: string; // default: "h-[82vh]"
};

export default function BottomSheet({
  open,
  title,
  onClose,
  children,
  state = "full",
  onToggleState,
  peekHeightClassName = "h-[28vh]",
  fullHeightClassName = "h-[82vh]",
}: Props) {
  const isPeek = state === "peek";
  const heightClass = isPeek ? peekHeightClassName : fullHeightClassName;

  const toggle = () => {
    if (!onToggleState) return;
    onToggleState(isPeek ? "full" : "peek");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          {/* Sheet container */}
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-2xl px-2 sm:px-0">
            <motion.div
              className={`rounded-t-3xl bg-white shadow-2xl ${heightClass} flex flex-col`}
              initial={{ y: 24, opacity: 0.98 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              layout
            >
              {/* Grab handle (tap to toggle peek/full) */}
              <button
                type="button"
                onClick={toggle}
                className="flex justify-center pt-3 active:opacity-80"
                aria-label={isPeek ? "Expand sheet" : "Collapse sheet"}
              >
                <div className="h-1.5 w-12 rounded-full bg-black/20" />
              </button>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3 pt-2">
                <div className="text-base font-semibold">
                  {title ?? "Events"}
                </div>

                <div className="flex items-center gap-2">
                  {/* Optional: show a chevron-like toggle without adding icons */}
                  {onToggleState && (
                    <button
                      type="button"
                      onClick={toggle}
                      className="rounded-full px-3 py-1 text-sm font-medium hover:bg-black/5 active:bg-black/10"
                    >
                      {isPeek ? "Expand" : "Peek"}
                    </button>
                  )}

                  <button
                    className="rounded-full px-3 py-1 text-sm font-medium hover:bg-black/5 active:bg-black/10"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Content area */}
<div className="min-h-0 flex-1 overflow-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">

                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
