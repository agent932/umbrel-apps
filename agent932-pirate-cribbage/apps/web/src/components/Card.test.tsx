import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_COSMETICS, parseCard } from "@pirate/engine";
import { CosmeticsProvider, FaceStyleContext } from "../brand/cosmetics.js";
import { getDeckSkin } from "../brand/deckSkins.js";
import { type FaceStyle, PIRATE_PORTRAITS } from "../brand/faceStyles.js";
import { Card } from "./Card.js";

const crimson = { ...DEFAULT_COSMETICS, deck: "deck.crimson" };
/** A face style no real build has, so the test can tell whose faces are drawn. */
const STUB_FACES: FaceStyle = {
  id: "stub",
  courts: { 11: "/stub-jack.webp", 12: "/stub-queen.webp", 13: "/stub-king.webp" },
};

/** The portrait on a court card. */
const courtArt = (card: HTMLElement) =>
  card.querySelector<HTMLElement>('span[aria-hidden="true"]')!.style.backgroundImage;

describe("Card", () => {
  it("draws a face-down card with the default back, over its field colour", () => {
    const { container } = render(<Card hidden />);
    const back = getDeckSkin();
    const card = screen.getByRole("img", { name: "Face-down card" });
    // Still the card's own root element: the table sizes cards by direct-child selectors.
    expect(container.firstElementChild).toBe(card);
    expect(card.tagName).toBe("DIV");
    expect(card).toHaveAttribute("data-deck", "cribbage-logo");
    expect(card.style.backgroundImage).toBe(`url("${back.backUrl}")`);
    expect(card).toHaveStyle({ backgroundColor: back.backColor });
  });

  it("draws the back the table uses", () => {
    render(
      <CosmeticsProvider value={crimson}>
        <Card hidden label="Deck" />
      </CosmeticsProvider>,
    );
    const card = screen.getByRole("img", { name: "Deck" });
    expect(card).toHaveAttribute("data-deck", "crimson");
    expect(card.style.backgroundImage).toBe(`url("${getDeckSkin("deck.crimson").backUrl}")`);
    expect(card).toHaveStyle({ backgroundColor: getDeckSkin("deck.crimson").backColor });
  });

  it("keeps the same faces whatever the back", () => {
    const king = parseCard("KS");
    const { unmount } = render(<Card card={king} />);
    const plain = courtArt(screen.getByRole("img", { name: "King of spades" }));
    expect(plain).toBe(`url("${PIRATE_PORTRAITS.courts[13]}")`);
    unmount();
    render(
      <CosmeticsProvider value={crimson}>
        <Card card={king} />
      </CosmeticsProvider>,
    );
    expect(courtArt(screen.getByRole("img", { name: "King of spades" }))).toBe(plain);
  });

  it("draws the courts from the face style, not the back", () => {
    render(
      <FaceStyleContext.Provider value={STUB_FACES}>
        <CosmeticsProvider value={crimson}>
          <Card card={parseCard("KH")} />
          <Card card={parseCard("JC")} onClick={() => {}} />
          <Card hidden />
        </CosmeticsProvider>
      </FaceStyleContext.Provider>,
    );
    expect(courtArt(screen.getByRole("img", { name: "King of hearts" }))).toBe(
      'url("/stub-king.webp")',
    );
    expect(courtArt(screen.getByRole("button", { name: "Jack of clubs" }))).toBe(
      'url("/stub-jack.webp")',
    );
    expect(screen.getByRole("img", { name: "Face-down card" })).toHaveAttribute(
      "data-deck",
      "crimson",
    );
  });
});
