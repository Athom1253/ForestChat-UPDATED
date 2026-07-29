import { useState } from 'react'
import { X, RotateCcw, Send, Trophy, Gamepad2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface GameLauncherProps {
  onClose: () => void
  onSendResult: (text: string) => void
}

type GameType = 'menu' | 'tictactoe' | 'connectfour' | 'rps'

export default function GameLauncher({ onClose, onSendResult }: GameLauncherProps) {
  const [game, setGame] = useState<GameType>('menu')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-accent" />
            <span className="font-bold text-text">
              {game === 'menu' ? 'Mini Games' : game === 'tictactoe' ? 'Tic-Tac-Toe' : game === 'connectfour' ? 'Connect Four' : 'Rock Paper Scissors'}
            </span>
          </div>
          <div className="flex gap-1">
            {game !== 'menu' && (
              <button onClick={() => setGame('menu')} className="px-3 py-1.5 rounded-xl text-xs text-text-muted hover:bg-bg-hover transition-all">← Back</button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <AnimatePresence mode="wait">
            {game === 'menu' && (
              <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-3 gap-3">
                {[
                  { id: 'tictactoe', emoji: '✕', label: 'Tic-Tac-Toe', desc: '2 players' },
                  { id: 'connectfour', emoji: '🔴', label: 'Connect Four', desc: '2 players' },
                  { id: 'rps', emoji: '✊', label: 'Rock Paper\nScissors', desc: 'vs Computer' },
                ].map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGame(g.id as GameType)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-bg border border-border hover:bg-accent/5 hover:border-accent/30 transition-all"
                  >
                    <span className="text-3xl">{g.emoji}</span>
                    <span className="text-xs font-bold text-text text-center whitespace-pre-line leading-tight">{g.label}</span>
                    <span className="text-xs text-text-muted">{g.desc}</span>
                  </button>
                ))}
              </motion.div>
            )}
            {game === 'tictactoe' && (
              <motion.div key="ttt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <TicTacToe onSendResult={onSendResult} />
              </motion.div>
            )}
            {game === 'connectfour' && (
              <motion.div key="c4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ConnectFour onSendResult={onSendResult} />
              </motion.div>
            )}
            {game === 'rps' && (
              <motion.div key="rps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RockPaperScissors onSendResult={onSendResult} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

// ── Tic-Tac-Toe ───────────────────────────────────────────────────────────────

type TTTBoard = (null | 'X' | 'O')[]

function TicTacToe({ onSendResult }: { onSendResult: (t: string) => void }) {
  const [board, setBoard] = useState<TTTBoard>(Array(9).fill(null))
  const [player, setPlayer] = useState<'X' | 'O'>('X')
  const winner = calcWinner(board)
  const isDraw = !winner && board.every(Boolean)

  const click = (i: number) => {
    if (board[i] || winner) return
    const next = [...board]
    next[i] = player
    setBoard(next)
    setPlayer(player === 'X' ? 'O' : 'X')
  }

  const reset = () => { setBoard(Array(9).fill(null)); setPlayer('X') }

  const shareResult = () => {
    const lines = winner
      ? `🎮 Tic-Tac-Toe: **${winner}** wins!\n${renderBoard(board)}`
      : isDraw
      ? `🎮 Tic-Tac-Toe: It's a draw!\n${renderBoard(board)}`
      : `🎮 Tic-Tac-Toe in progress...\n${renderBoard(board)}`
    onSendResult(lines)
  }

  return (
    <div className="space-y-4">
      <div className="text-center text-sm font-bold text-text">
        {winner ? <span className="text-accent">🏆 {winner} wins!</span>
          : isDraw ? <span>🤝 Draw!</span>
          : <span>Player <span className={player === 'X' ? 'text-error' : 'text-accent'}>{player}</span>'s turn</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[220px] mx-auto">
        {board.map((cell, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.92 }}
            onClick={() => click(i)}
            className={`w-full aspect-square rounded-2xl border-2 text-3xl font-bold flex items-center justify-center transition-all ${
              cell === 'X' ? 'border-error/40 bg-error/5 text-error' :
              cell === 'O' ? 'border-accent/40 bg-accent/5 text-accent' :
              'border-border bg-bg hover:bg-bg-hover hover:border-accent/30'
            }`}
          >
            {cell}
          </motion.button>
        ))}
      </div>
      <div className="flex gap-2 justify-center">
        <button onClick={reset} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button onClick={shareResult} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-accent text-white hover:bg-accent-hover transition-all">
          <Send className="w-3.5 h-3.5" /> Share Result
        </button>
      </div>
    </div>
  )
}

function calcWinner(board: TTTBoard): string | null {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]!
  }
  return null
}

function renderBoard(board: TTTBoard): string {
  const s = board.map((c) => c ?? '·')
  return `${s[0]}${s[1]}${s[2]}\n${s[3]}${s[4]}${s[5]}\n${s[6]}${s[7]}${s[8]}`
}

// ── Connect Four ──────────────────────────────────────────────────────────────

const C4_ROWS = 6, C4_COLS = 7

type C4Cell = null | 1 | 2
type C4Board = C4Cell[][]

function makeC4Board(): C4Board {
  return Array(C4_ROWS).fill(null).map(() => Array(C4_COLS).fill(null))
}

function ConnectFour({ onSendResult }: { onSendResult: (t: string) => void }) {
  const [board, setBoard] = useState<C4Board>(makeC4Board())
  const [player, setPlayer] = useState<1 | 2>(1)
  const [winner, setWinner] = useState<1 | 2 | 'draw' | null>(null)

  const drop = (col: number) => {
    if (winner) return
    let row = -1
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (!board[r][col]) { row = r; break }
    }
    if (row < 0) return
    const next = board.map((r) => [...r])
    next[row][col] = player
    setBoard(next)
    const w = checkC4(next, row, col, player)
    if (w) { setWinner(player); return }
    if (next[0].every(Boolean)) { setWinner('draw'); return }
    setPlayer(player === 1 ? 2 : 1)
  }

  const reset = () => { setBoard(makeC4Board()); setPlayer(1); setWinner(null) }

  const shareResult = () => {
    const msg = winner
      ? winner === 'draw'
        ? `🎮 Connect Four: Draw!`
        : `🎮 Connect Four: Player ${winner} (${winner === 1 ? '🔴' : '🟡'}) wins!`
      : `🎮 Connect Four in progress...`
    onSendResult(msg)
  }

  return (
    <div className="space-y-3">
      <div className="text-center text-sm font-bold text-text">
        {winner
          ? winner === 'draw' ? '🤝 Draw!' : <span className="text-accent">🏆 Player {winner} wins!</span>
          : <span>Player <span className={player === 1 ? 'text-error' : 'text-warning'}>{player === 1 ? '🔴' : '🟡'}</span>'s turn</span>}
      </div>
      {/* Column drop buttons */}
      <div className="flex gap-1 justify-center">
        {Array(C4_COLS).fill(null).map((_, c) => (
          <button key={c} onClick={() => drop(c)} className="w-8 h-5 flex items-center justify-center text-text-muted hover:text-accent transition-all text-xs">▼</button>
        ))}
      </div>
      <div className="bg-accent/15 rounded-2xl p-2 inline-block mx-auto">
        {board.map((row, r) => (
          <div key={r} className="flex gap-1 mb-1">
            {row.map((cell, c) => (
              <motion.button
                key={c}
                whileTap={{ scale: 0.9 }}
                onClick={() => drop(c)}
                className="w-8 h-8 rounded-full border-2 border-white/20 transition-all"
                style={{
                  background: cell === 1 ? '#c46a5e' : cell === 2 ? '#d4a44a' : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-center">
        <button onClick={reset} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button onClick={shareResult} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-accent text-white hover:bg-accent-hover transition-all">
          <Send className="w-3.5 h-3.5" /> Share
        </button>
      </div>
    </div>
  )
}

function checkC4(board: C4Board, row: number, col: number, player: 1 | 2): boolean {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]]
  for (const [dr, dc] of dirs) {
    let count = 1
    for (const sign of [1, -1]) {
      let r = row + sign * dr, c = col + sign * dc
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r][c] === player) {
        count++; r += sign * dr; c += sign * dc
      }
    }
    if (count >= 4) return true
  }
  return false
}

// ── Rock Paper Scissors ───────────────────────────────────────────────────────

const RPS_CHOICES = [
  { id: 'rock', emoji: '✊', label: 'Rock' },
  { id: 'paper', emoji: '✋', label: 'Paper' },
  { id: 'scissors', emoji: '✌️', label: 'Scissors' },
]

type RPSChoice = 'rock' | 'paper' | 'scissors'

function beats(a: RPSChoice, b: RPSChoice): boolean {
  return (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')
}

function RockPaperScissors({ onSendResult }: { onSendResult: (t: string) => void }) {
  const [playerChoice, setPlayerChoice] = useState<RPSChoice | null>(null)
  const [cpuChoice, setCpuChoice] = useState<RPSChoice | null>(null)
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null)
  const [score, setScore] = useState({ player: 0, cpu: 0 })

  const play = (choice: RPSChoice) => {
    const cpu = RPS_CHOICES[Math.floor(Math.random() * 3)].id as RPSChoice
    setPlayerChoice(choice)
    setCpuChoice(cpu)
    if (choice === cpu) {
      setResult('draw')
    } else if (beats(choice, cpu)) {
      setResult('win')
      setScore((s) => ({ ...s, player: s.player + 1 }))
    } else {
      setResult('lose')
      setScore((s) => ({ ...s, cpu: s.cpu + 1 }))
    }
  }

  const reset = () => { setPlayerChoice(null); setCpuChoice(null); setResult(null) }

  const shareResult = () => {
    const playerE = RPS_CHOICES.find((r) => r.id === playerChoice)?.emoji
    const cpuE = RPS_CHOICES.find((r) => r.id === cpuChoice)?.emoji
    onSendResult(`🎮 Rock Paper Scissors: I played ${playerE} vs 🤖 ${cpuE} — ${result === 'win' ? 'I won! 🏆' : result === 'lose' ? 'I lost 😅' : 'Draw! 🤝'} (Score ${score.player}–${score.cpu})`)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm font-bold px-2">
        <span>You: <span className="text-accent">{score.player}</span></span>
        <span className="text-text-muted">vs</span>
        <span>CPU: <span className="text-error">{score.cpu}</span></span>
      </div>
      {!playerChoice ? (
        <div>
          <div className="text-center text-sm text-text-muted mb-3">Choose your move:</div>
          <div className="flex gap-3 justify-center">
            {RPS_CHOICES.map((c) => (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => play(c.id as RPSChoice)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-bg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all"
              >
                <span className="text-4xl">{c.emoji}</span>
                <span className="text-xs font-bold text-text">{c.label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-4xl mb-1">{RPS_CHOICES.find((r) => r.id === playerChoice)?.emoji}</div>
              <div className="text-xs text-text-muted">You</div>
            </div>
            <div className="text-xl font-bold text-text-muted">vs</div>
            <div className="text-center">
              <div className="text-4xl mb-1">{RPS_CHOICES.find((r) => r.id === cpuChoice)?.emoji}</div>
              <div className="text-xs text-text-muted">CPU</div>
            </div>
          </div>
          <div className="text-center text-lg font-bold">
            {result === 'win' && <span className="text-accent">🏆 You win!</span>}
            {result === 'lose' && <span className="text-error">😅 You lose!</span>}
            {result === 'draw' && <span className="text-text-muted">🤝 Draw!</span>}
          </div>
          <div className="flex gap-2 justify-center">
            <button onClick={reset} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all">
              <RotateCcw className="w-3.5 h-3.5" /> Play Again
            </button>
            <button onClick={shareResult} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-accent text-white hover:bg-accent-hover transition-all">
              <Send className="w-3.5 h-3.5" /> Share
            </button>
          </div>
        </div>
      )}
      {(result === 'win' || result === 'lose' || result === 'draw') && (
        <div className="flex items-center gap-1 justify-center text-xs text-text-muted">
          <Trophy className="w-3 h-3" /> Session score: {score.player}–{score.cpu}
        </div>
      )}
    </div>
  )
}
