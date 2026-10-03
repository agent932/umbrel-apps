import bronzeUrl from "../assets/ui/tier-bronze.webp";
import silverUrl from "../assets/ui/tier-silver.webp";
import goldUrl from "../assets/ui/tier-gold.webp";
import platinumUrl from "../assets/ui/tier-platinum.webp";
import diamondUrl from "../assets/ui/tier-diamond.webp";

const BADGES: Record<string, string> = {
  bronze: bronzeUrl,
  silver: silverUrl,
  gold: goldUrl,
  platinum: platinumUrl,
  diamond: diamondUrl,
};

/** A rank tier ("Gold") with its painted shield. */
export function TierBadge({ tier, className = "" }: { tier: string; className?: string }) {
  const url = BADGES[tier.toLowerCase()];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      {url && <img src={url} alt="" className="h-[1.4em] w-auto" />}
      {tier}
    </span>
  );
}
