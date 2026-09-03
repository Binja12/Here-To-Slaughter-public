import { IAbilityRule } from '../../interfaces'

// The six class masks (item-067 … item-072): "The equipped Hero card is
// considered a <class> instead of its original class."
//
// No entry at all: the class a mask confers is DATA (`ItemCardData.heroClass`)
// and the board DERIVES a hero's class from what it wears
// (`GameState.getHeroClass`), so there is nothing to install on equip and
// nothing to revert on unequip — the moment the mask comes off, by any route,
// the hero's default class (`HeroCard.getDefaultClass`) is what the board reads again. Every reader of a hero's
// class goes through that one method: party requirements, the "every class"
// win, the class choice filter, the "while you have a <class>" expiry.
//
// The empty list is still registered, because the deal is exactly the
// registry (`dealable`): an unregistered mask would never be dealt.
export const MaskAbility: IAbilityRule[] = []
