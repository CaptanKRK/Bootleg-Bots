import { useEffect, useRef, useState } from 'react'

export function Sketchpad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [color, setColor] = useState('#17120d')
  const [size, setSize] = useState(8)
  const [eraser, setEraser] = useState(false)
  const history = useRef<ImageData[]>([])
  const snapshot = () => { const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (canvas && ctx) history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height)) }
  const publish = () => canvasRef.current?.toBlob(onChange, 'image/png')
  useEffect(() => { const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return; ctx.fillStyle = '#fffdf4'; ctx.fillRect(0, 0, canvas.width, canvas.height); publish() }, [])
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) } }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); snapshot(); const ctx = canvasRef.current!.getContext('2d')!; const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = canvasRef.current!.getContext('2d')!; const p = point(event); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size; ctx.strokeStyle = eraser ? '#fffdf4' : color; ctx.lineTo(p.x, p.y); ctx.stroke() }
  const finish = () => { if (drawing.current) { drawing.current = false; publish() } }
  const undo = () => { const state = history.current.pop(); const ctx = canvasRef.current?.getContext('2d'); if (state && ctx) { ctx.putImageData(state, 0, 0); publish() } }
  const clear = () => { snapshot(); const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fffdf4'; ctx.fillRect(0, 0, canvas.width, canvas.height); publish() }
  return <div className="sketchpad"><canvas ref={canvasRef} width="800" height="800" onPointerDown={start} onPointerMove={draw} onPointerUp={finish} onPointerLeave={finish} /><div className="sketch-tools"><input aria-label="Pen color" type="color" value={color} onChange={e => { setColor(e.target.value); setEraser(false) }} /><label>Size <input type="range" min="2" max="40" value={size} onChange={e => setSize(Number(e.target.value))} /></label><button type="button" className={eraser ? 'active' : ''} onClick={() => setEraser(!eraser)}>Eraser</button><button type="button" onClick={undo}>Undo</button><button type="button" onClick={clear}>Clear</button></div></div>
}
