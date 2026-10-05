import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { goBack } from "../navigation.js";

interface NavBarProps {
  /** Shown small in the bar once the page's big title has scrolled away. */
  title: string;
  back: { to: string; label: string };
}

/**
 * An iOS-style navigation bar: "‹ Back" on the left, sticky at the top. Clear while the page's big
 * title is in view; frosted, with the title, once you scroll. Back pops the history stack when the
 * previous screen is the parent (so it slides back and restores your scroll), otherwise goes there.
 */
export function NavBar({ title, back }: NavBarProps) {
  const [, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 44);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`nav-bar${scrolled ? " is-scrolled" : ""}`} aria-label="Back">
      <div className="nav-bar-inner">
        <a
          href={back.to}
          className="nav-back"
          onClick={(e) => {
            e.preventDefault();
            goBack(back.to, navigate);
          }}
        >
          <svg viewBox="0 0 12 20" aria-hidden className="h-[1.1em] w-auto">
            <path
              d="M10 2 2 10l8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {back.label}
        </a>
        <div className="nav-title" aria-hidden>
          {title}
        </div>
        <span />
      </div>
    </nav>
  );
}
