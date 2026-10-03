import peggyUrl from "./peggy.svg";
import squawkUrl from "./peggy-squawk.svg";

interface PeggyProps {
  /** Beak open, mid-squawk. */
  squawk?: boolean;
  /** Gentle bobbing, as if on a ship's rail. */
  bob?: boolean;
  className?: string;
}

/** Peggy, the Pirate Cribbage parrot. */
export function Peggy({ squawk, bob, className = "h-24 w-auto" }: PeggyProps) {
  return (
    <img
      src={squawk ? squawkUrl : peggyUrl}
      alt="Peggy the parrot"
      className={className}
      style={
        bob ? { animation: "bob 3.2s ease-in-out infinite", transformOrigin: "50% 90%" } : undefined
      }
      draggable={false}
    />
  );
}
