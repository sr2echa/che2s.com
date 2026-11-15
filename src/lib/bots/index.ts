// The roster. To add a bot: write a BotDef in this folder and append it here. Nothing else to wire.
import type { BotDef } from '../types';
import { stockfish } from './stockfish';
import { maia } from './maia';
import { trapsky } from './trapsky';
import { crystal } from './crystal';
import { worstfish } from './worstfish';
import { shannon } from './shannon';
import { monte } from './monte';
import { dice } from './dice';
import { meridian } from './meridian';

export const BOTS: BotDef[] = [stockfish, maia, trapsky, crystal, worstfish, shannon, monte, meridian, dice];
export const botById = (id: string) => BOTS.find((b) => b.id === id);
