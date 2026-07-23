import { isSupabaseConfigured } from './lib/supabase'

function App() {
  return (
    <main className="landing-page">
      <section className="hero" aria-labelledby="site-title">
        <p className="eyebrow">A spectacularly questionable robot card game</p>
        <h1 id="site-title">Bootleg Bots</h1>
        <p className="intro">
          Draw terrible robots. Give them wildly unfair moves. Battle your friends.
        </p>
        <div className="status" role="status">
          <span className={`status-dot ${isSupabaseConfigured ? 'ready' : ''}`} />
          {isSupabaseConfigured
            ? 'Game services connected'
            : 'Game services are being wired up'}
        </div>
      </section>

      <section className="coming-soon" aria-labelledby="coming-soon-title">
        <h2 id="coming-soon-title">In the workshop</h2>
        <ul>
          <li>Hand-draw a gloriously bad robot.</li>
          <li>Submit its stats and ridiculous moves.</li>
          <li>Get it approved, then fight with friends.</li>
        </ul>
      </section>
    </main>
  )
}

export default App
