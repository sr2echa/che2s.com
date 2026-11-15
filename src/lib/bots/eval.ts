// Shared search primitives for the in-browser JS bots: move generation + Michniewski's simplified evaluation.
import type { Chess } from 'chessops/chess';
import type { NormalMove, Role } from 'chessops/types';
import { VALUE } from '../chess';

// Tables are written rank 8 -> rank 1, from White's view.
// prettier-ignore
const PST: Record<Role | 'kingEnd', number[]> = {
  pawn: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  knight: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  bishop: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  rook: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  queen: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  king: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
  kingEnd: [-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50],
};

/** PST value for a piece of `color` on chessops square `sq` (0 = a1). */
export function pst(role: Role | 'kingEnd', color: 'white' | 'black', sq: number) {
  const file = sq & 7, rank = sq >> 3;
  return PST[role][(color === 'white' ? 7 - rank : rank) * 8 + file];
}

export const isEndgame = (pos: Chess) => pos.board.queen.isEmpty() || pos.board.occupied.size() - pos.board.pawn.size() <= 6;

/** Static eval, White POV, centipawns. */
export function evaluate(pos: Chess): number {
  const end = isEndgame(pos);
  let s = 0;
  for (const [sq, p] of pos.board) {
    const v = VALUE[p.role] + pst(p.role === 'king' && end ? 'kingEnd' : p.role, p.color, sq);
    s += p.color === 'white' ? v : -v;
  }
  return s;
}

/** Legal moves; promotions limited to queen + knight to keep search lean. */
export function genMoves(pos: Chess): NormalMove[] {
  const out: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    const pawn = pos.board.pawn.has(from);
    for (const to of dests) {
      if (pawn && (to >> 3 === 0 || to >> 3 === 7)) out.push({ from, to, promotion: 'queen' }, { from, to, promotion: 'knight' });
      else out.push({ from, to });
    }
  }
  return out;
}

/** MVV-LVA style ordering key; captures and promotions first. */
export function orderKey(pos: Chess, m: NormalMove) {
  const victim = pos.board.getRole(m.to);
  const enemy = victim && pos.board.getColor(m.to) !== pos.turn;
  return (enemy ? 10 * VALUE[victim!] - VALUE[pos.board.getRole(m.from)!] / 10 : 0) + (m.promotion ? 800 : 0);
}

export const isCapture = (pos: Chess, m: NormalMove) =>
  (pos.board.has(m.to) && pos.board.getColor(m.to) !== pos.turn) || (pos.board.pawn.has(m.from) && (m.from & 7) !== (m.to & 7));

export const yieldNow = () => new Promise((r) => setTimeout(r));
