# Third-party notices

che2s is licensed under the GNU General Public License v3.0 or later (see `LICENSE`). It builds on the
following work. Licenses are as published by each project; check upstream for the authoritative text.

## Engines and models

| Component | Use | License | Source |
| --- | --- | --- | --- |
| Stockfish 19 (stockfish.js, lite single-threaded WASM) | Stockfish, WorstFish, Boris Trapsky, the judge, game review | GPL-3.0 | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish), [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) |
| Maia-3 (`maia3_simplified.onnx`) | Maia bot. Downloaded at runtime, not stored in this repository. | AGPL-3.0 | [CSSLab/maia-platform-frontend](https://github.com/CSSLab/maia-platform-frontend), [CSSLab/maia-chess](https://github.com/CSSLab/maia-chess) |
| Maia-3 move vocabulary (`src/lib/bots/data/all_moves_maia3.json`) | Maps network outputs to moves | AGPL-3.0 | [CSSLab/maia-platform-frontend](https://github.com/CSSLab/maia-platform-frontend) |
| ONNX Runtime Web | Runs Maia in the browser | MIT | [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) |

## Libraries

| Package | License |
| --- | --- |
| chessground (board UI) | GPL-3.0-or-later |
| chessops (rules, move generation, PGN) | GPL-3.0-or-later |
| Astro, @astrojs/react, React, React DOM | MIT |
| @phosphor-icons/react | MIT |
| Geist and Geist Mono (via @fontsource-variable) | SIL Open Font License 1.1 |
| Playwright (tests only) | Apache-2.0 |

## Piece sets

From the [lichess.org](https://github.com/lichess-org/lila) repository (`public/piece`). Credits are
also in `public/pieces/CREDITS.md`.

| Set | Author | License |
| --- | --- | --- |
| Classic (cburnett) | Colin M.L. Burnett | GPL-2.0-or-later |
| Papercut | Nikolay Anzarov | CC BY 4.0 |
| Spatial | Maurizio Monge | MIT |
| Kiwen (kiwen-suwi) | neverRare | CC BY 4.0 |
| Chessnut | Alexis Luengas | Apache-2.0 |

## Ideas

- Win probability curve and move accuracy formula follow [lichess](https://lichess.org/page/accuracy).
- Move classifications (Brilliant to Blunder) are modelled on chess.com's Game Review categories; the
  thresholds and explanations here are this project's own.
- WorstFish shares its idea with "worstfish" from Tom Murphy VII's "Elo World" (SIGBOVIK 2019).
