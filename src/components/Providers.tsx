"use client";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";

/** Motion follows the OS preference; toasts dock bottom-left, clear of the shelf and of the phone's sticky actions. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        position="bottom-left"
        offset={16}
        mobileOffset={{ bottom: 96, left: 16, right: 16 }}
        duration={3500}
        toastOptions={{ className: "no-print", style: { background: "var(--card-stock)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 4, fontFamily: "var(--ff-body)", fontSize: 15, boxShadow: "var(--shadow-raised)" } }}
      />
    </MotionConfig>
  );
}
