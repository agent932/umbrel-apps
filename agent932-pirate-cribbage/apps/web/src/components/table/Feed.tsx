import { motion } from "motion/react";
import type { FeedItem } from "../../game/types.js";

/** The game log: the newest line bright, older ones fading. */
export function Feed({ items, className = "" }: { items: FeedItem[]; className?: string }) {
  return (
    <ol
      className={`flex flex-col gap-0.5 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
      aria-label="Game log"
    >
      {/* New lines slide in; old ones just drop off the end (animating them out overlapped new lines). */}

      {items.map((item, i) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: i === 0 ? 1 : 0.6 - i * 0.1, x: 0 }}
          className="flex items-center justify-center gap-2"
        >
          <span className="truncate">{item.text}</span>
          {item.points !== 0 && (
            <span
              className={`shrink-0 rounded-full px-2 text-xs font-bold ${
                item.points > 0 ? "bg-gold/25 text-gold" : "bg-red-500/25 text-red-300"
              }`}
            >
              {item.points > 0 ? `+${item.points}` : item.points}
            </span>
          )}
        </motion.li>
      ))}
    </ol>
  );
}
