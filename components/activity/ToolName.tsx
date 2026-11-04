"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { splitCanonical } from "../../lib/activity-format";

// The full tool name on one line, cut with … when it doesn't fit. Press and
// hold (touch) or click (mouse) scrolls the hidden part into view, holds,
// then slides back. A plain tap on touch, or a click on a name that isn't
// cut, opens `href` like the rest of the card.
export function ToolName({ name, href }: { name: string; href?: string }) {
  const [org, rest] = splitCanonical(name);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  const router = useRouter();

  function hidden() {
    const el = ref.current;
    if (!el) return 0;
    return (el.firstElementChild as HTMLElement).scrollWidth - el.clientWidth;
  }

  function reveal() {
    const el = ref.current;
    const px = hidden();
    if (!el || px <= 2 || el.classList.contains("is-scrolling")) return;
    const secs = Math.max(0.8, px / 60);
    el.style.setProperty("--shift", `${-px}px`);
    el.style.setProperty("--dur", `${secs}s`);
    el.classList.add("is-scrolling");
    setTimeout(() => {
      el.style.setProperty("--shift", "0px");
      setTimeout(() => el.classList.remove("is-scrolling"), secs * 1000 + 50);
    }, secs * 1000 + 1500);
  }

  return (
    <div
      ref={ref}
      className="zq-tn"
      title={name}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        pressed.current = false;
        timer.current = setTimeout(() => {
          pressed.current = true;
          reveal();
        }, 400);
      }}
      onPointerUp={() => timer.current && clearTimeout(timer.current)}
      onPointerCancel={() => timer.current && clearTimeout(timer.current)}
      onPointerLeave={() => timer.current && clearTimeout(timer.current)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        if (pressed.current) {
          pressed.current = false;
          return;
        }
        if (!coarse && hidden() > 2) {
          reveal();
          return;
        }
        if (href) router.push(href);
      }}
    >
      <span className="zq-tn-in">
        {org && <span className="zq-tn-org">{org}</span>}
        {rest}
      </span>
    </div>
  );
}
